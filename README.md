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
git clone https://github.com/Pieron23/Strategy_Development_Goals.git
cd Strategy_Development_Goals
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
- `PUBLIC_SDG_DATA_PATH`

## Running locally

You need **two terminals**.

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
- Admin automation: `http://localhost:3000/admin/nisr-automation`

Use `localhost:3000` instead of `127.0.0.1:3000` for local frontend access.

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
