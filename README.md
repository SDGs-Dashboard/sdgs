# Rwanda SDG Public Dashboard

This project contains the public Rwanda SDG dashboard built with Next.js, React, TypeScript, Tailwind CSS, and Recharts.

## What is included

- Public dashboard pages (`/`, `/goals`, `/indicators`, `/downloads`, `/metadata`, `/data-availability`, `/data-quality`)
- Admin NISR Data Automation pages (`/admin/nisr-automation`, `/admin/nisr-automation/extract`, `/admin/nisr-automation/review`, `/admin/nisr-automation/approved`)
- Public download APIs under `/api/public/*`
- Admin automation APIs under `/api/admin/nisr/*`
- Open SDG build and validation scripts:
  - `scripts/check_data.py`
  - `scripts/build_data.py`
  - `scripts/extract_nisr_report.py`

## Data sources

- Main data workbook: `data/2025_RW-SDG_Data.xlsx`
- SDMX output: `sdmx-data/2025_RWA-SDG_Data.xml`
- Metadata files: `meta/*.md`

## Local development

```bash
npm install
pip install -r scripts/requirements.txt
npm run dev
```

Open: `http://localhost:3000`

Admin automation:

- Upload reports in `/admin/nisr-automation`
- Run extraction in `/admin/nisr-automation/extract`
- Review and approve extracted rows in `/admin/nisr-automation/review`
- Inspect approved records in `/admin/nisr-automation/approved`

The workflow is approval-first: extracted rows are not published to the dashboard workbook until an admin approves them.

## Build

```bash
npm run build
npm run start
```

## SDG data checks

```bash
npm run validate:sdg
npm run build:sdg
```
