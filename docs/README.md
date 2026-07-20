# NISR SDG Automation

This project adds a local, metadata-driven SDG automation workflow built around `data/NISR_SDG_Automation_Mapping_Built.xlsx`.

## Structure

- `backend/` FastAPI automation API, using SQLite locally or Postgres when `DATABASE_URL` is set
- `frontend/` React frontend for local staff workflows
- `data/` SQLite database, workbook copy, uploads, processed files, exports

## First version workflow

1. Import `NISR_SDG_Automation_Mapping_Built.xlsx` into SQLite.
2. Upload one Excel or PDF report.
3. Use `NISR_Source_Mapping` as the source of truth for matching.
4. Save extracted candidates into `proposed_updates`.
5. Approve or reject proposed updates.
6. Export an updated SDG dashboard workbook.

## Run backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Run frontend

```bash
cd frontend
npm install
npm run dev
```

The backend defaults to `http://127.0.0.1:8000`, and the frontend expects that base URL.

## Database options

The first local version uses SQLite at `data/nisr_sdg.db`.

For an online admin system, deploy the FastAPI backend separately and set:

```bash
DATABASE_URL=postgresql://user:password@host:5432/database
BACKEND_CORS_ORIGINS=https://sdgs-dashboard.github.io,http://localhost:3000
NEXT_PUBLIC_NISR_AUTOMATION_API_BASE=https://your-backend.example.com/api
```

GitHub Pages cannot run SQLite or Postgres directly. It should only host the frontend and call the FastAPI backend.

## Key backend endpoints

- `POST /api/import-control-workbook`
- `POST /api/upload`
- `GET /api/reports`
- `POST /api/extraction/reports/{report_id}/run`
- `GET /api/proposed-updates`
- `POST /api/approvals/{update_id}`
- `GET /api/exports/dashboard`

## Notes

- Excel extraction is the primary supported path in this first version.
- PDF extraction is included as an initial low-confidence review workflow using `pdfplumber`.
- Matching priority is metadata-driven and avoids name-only approval.
