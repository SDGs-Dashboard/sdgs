# Rwanda SDG Dashboard

This repository contains:

- the public Rwanda SDG dashboard built with `Next.js`, `React`, `TypeScript`, `Tailwind CSS`, and `Recharts`
- the admin-only `NISR Data Automation` workflow for uploading reports, extracting mapped SDG values, reviewing them, and approving them before they affect dashboard data
- a local `FastAPI` backend used by the admin automation module

## What is included

- Public dashboard pages:
  - `/`
  - `/goals`
  - `/indicators`
  - `/downloads`
  - `/metadata`
  - `/data-availability`
  - `/data-quality`
- Admin automation pages:
  - `/admin/nisr-automation`
  - `/admin/nisr-automation/extract`
  - `/admin/nisr-automation/results`
  - `/admin/nisr-automation/review`
  - `/admin/nisr-automation/approved`
- Backend API under `backend/app`
- Frontend pages under `pages/`
- Shared UI components under `components/`
- Local automation data under `data/`
- Optional hosted Postgres support for the admin automation backend

## Project structure

```text
backend/                  FastAPI backend for NISR automation
components/               Shared dashboard and admin UI components
data/                     Local workbook, SQLite DB, uploads, exports
docs/                     Supporting documentation
pages/                    Next.js pages and API routes
public/                   Static assets
scripts/                  Data validation and build scripts
styles/                   Global styles
utils/                    Shared utilities
```

## Main data files

- Dashboard workbook: `data/2025_RW-SDG_Data.xlsx`
- Automation mapping workbook: `data/NISR_SDG_Automation_Mapping_Built.xlsx`
- Local automation database: `data/nisr_sdg.db`
- Uploaded NISR reports: `data/uploads/`
- Approved dashboard export source: `data/approved/2025_RW-SDG_Data.xlsx`

## Requirements

Install these before local setup:

- `Node.js` 18+ and `npm`
- `Python` 3.11+ recommended
- `git`

## First-time setup

### 1. Clone from GitHub

```bash
git clone https://github.com/SDGs-Dashboard/sdgs.git
cd sdgs
git checkout develop
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Install backend dependencies

```bash
cd backend
pip install -r requirements.txt
cd ..
```

### 4. Configure environment

Copy `.env.example` to `.env.local` and update values if needed.

Example:

```bash
copy .env.example .env.local
```

Important values in `.env.local`:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_AUTH_SECRET`
- `DATABASE_URL` if using hosted Postgres instead of local SQLite
- `BACKEND_CORS_ORIGINS` if the backend is hosted separately from the frontend
- `NEXT_PUBLIC_NISR_AUTOMATION_API_BASE` if the frontend should call a hosted backend
- `PUBLIC_SDG_DATA_PATH`

## Running locally

You need **two terminals**.

By default the backend uses local SQLite at `data/nisr_sdg.db`. Leave `DATABASE_URL` blank for local development.

### Terminal 1: start backend

```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Backend health check:

- `http://127.0.0.1:8000/api/health`

### Terminal 2: start frontend

From the repository root:

```bash
npm run dev
```

Open:

- Public dashboard: `http://localhost:3000`
- Admin automation: `http://localhost:3000/admin` or `http://localhost:3000/admin/nisr-automation`

Use `localhost:3000` instead of `127.0.0.1:3000` for local frontend access.

## Online admin with Postgres

GitHub Pages is static hosting. It can serve the dashboard UI, but it cannot run SQLite, Postgres, FastAPI, file uploads, or server-side extraction by itself.

For the full online admin workflow:

1. Host the FastAPI backend on a service such as Render, Railway, Fly.io, Azure, or another Python host.
2. Create a managed Postgres database, for example Neon, Supabase, Railway Postgres, or Render Postgres.
3. Set the backend environment variable:

```bash
DATABASE_URL=postgresql://user:password@host:5432/database
```

4. Allow the GitHub Pages frontend to call the backend:

```bash
BACKEND_CORS_ORIGINS=https://sdgs-dashboard.github.io,http://localhost:3000,http://127.0.0.1:3000
ADMIN_COOKIE_SECURE=true
ADMIN_COOKIE_SAMESITE=none
```

5. Build the frontend with the hosted backend URL:

```bash
NEXT_PUBLIC_NISR_AUTOMATION_API_BASE=https://your-backend.example.com/api
```

Do not connect GitHub Pages directly to Postgres from browser JavaScript. That would expose database credentials. The browser should call FastAPI, and FastAPI should connect to Postgres securely.

On GitHub Pages, open `/sdgs/admin/login`, enter the HTTPS backend API URL, sign in, then use the normal workflow:

1. upload report
2. run extraction
3. review proposed updates
4. approve or reject values
5. export approved dashboard data

### Render backend blueprint

This repository includes `render.yaml` and `backend/Dockerfile` for deploying the FastAPI backend with a managed Postgres database on Render.

1. In Render, create a new Blueprint from `https://github.com/SDGs-Dashboard/sdgs.git`.
2. Select the `develop` branch.
3. Let Render create `nisr-sdg-automation-api` and `nisr-sdg-automation-db`.
4. Set the prompted `ADMIN_PASSWORD` value.
5. After deployment, copy the backend URL and add `/api`, for example:

```bash
https://nisr-sdg-automation-api.onrender.com/api
```

6. Open `https://sdgs-dashboard.github.io/sdgs/admin/login` and paste that URL into **Backend API URL**.

If you use another host, deploy `backend/Dockerfile` or run:

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then set the same environment variables shown above.

## Admin login

Admin authentication is required for automation pages.

Credentials come from `.env.local`:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

Default values in `.env.example` are for local development only and should be changed.

## NISR Data Automation workflow

The automation is approval-first. Nothing should affect final dashboard data until an admin approves it.

### Workflow

1. Open `/admin/nisr-automation`
2. Upload a NISR report (`.pdf`, `.xlsx`, `.xls`, `.csv`)
3. Open `/admin/nisr-automation/extract`
4. Run extraction for the selected report
5. Open `/admin/nisr-automation/results` to see:
   - extracted
   - needs review
   - not found
   - missing mapping
   - errors
6. Open `/admin/nisr-automation/review`
7. Edit extracted values if needed
8. Approve only confirmed values
9. Open `/admin/nisr-automation/approved` to review approved values and version history

### Important automation behavior

- Mapping workbook is the source of truth
- Uploaded report family/data source is checked before value matching, so an EICV report only extracts from EICV mappings
- Every mapping row is checked and logged
- Low-confidence or ambiguous matches go to `Needs Review`
- Blank values must be manually entered before approval
- Approved values are written back only after review
- Version history is stored for approved changes

## Extraction behavior

### Excel

- Reads all sheets
- Handles merged cells
- Searches table references, row labels, and year/column labels
- Creates proposed updates for:
  - extracted values
  - review-needed placeholders

### PDF

- Uses `pdfplumber`
- Matches mapped table references and page titles
- Creates:
  - extracted proposed rows when a safe value is found
  - review placeholders when a mapped page/table is found but no reliable numeric value is confirmed

## Export options

From the admin pages you can export:

- updated dashboard workbook
- proposed updates workbook
- approved updates workbook
- audit log workbook
- extraction debug report workbook

## Useful commands

### Frontend

```bash
npm run dev
npm run build
npm run build:pages
npm run start
```

### Data validation

```bash
npm run validate:sdg
npm run build:sdg
```

### Backend

```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Troubleshooting

### GitHub Pages deployment

The public dashboard can be published to:

- `https://sdgs-dashboard.github.io/sdgs/`

How it works:

- pushes to `develop` trigger `.github/workflows/deploy-to-staging.yml`
- pushes to `production` trigger `.github/workflows/deploy-to-production.yml`
- the Pages build exports the public dashboard and static frontend pages
- full admin automation pages are included, but upload/extract/review/approve still need the FastAPI backend running locally or hosted separately
- GitHub Pages does not run SQLite, Postgres, Python, file uploads, or PDF extraction

Before the first deployment, make sure the repository Pages source is set to **GitHub Actions** in GitHub settings.

### Frontend says `Failed to fetch`

Check that the backend is running:

```bash
http://127.0.0.1:8000/api/health
```

If backend is down, restart it.

### Review row exists but `Approve` is inactive

That means `new_value` is still blank.

Steps:

1. Click `Edit`
2. Enter the confirmed value
3. Click `Save`
4. Click `Approve`

### Review page shows nothing even though extraction says `Needs Review`

Re-run extraction for that report. The system now creates review placeholders for ambiguous matches.

### Next.js local errors after many edits

If the frontend dev server becomes unstable:

1. stop the frontend server
2. delete `.next/`
3. run `npm run dev` again

## Notes

- This repository currently includes local automation data and uploaded report files because they were intentionally pushed with the project state.
- For production or team sharing, review whether `data/nisr_sdg.db`, `data/uploads/`, and generated files should remain versioned.
