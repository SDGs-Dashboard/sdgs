from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..database import fetch_all, fetch_one
from ..schemas import DashboardSummary, ReportRead

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("", response_model=list[ReportRead])
def list_reports() -> list[ReportRead]:
    rows = fetch_all("SELECT * FROM reports ORDER BY upload_date DESC, id DESC")
    return [ReportRead(**row) for row in rows]


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary() -> DashboardSummary:
    total_indicators = fetch_one("SELECT COUNT(*) AS total FROM indicators")["total"]
    missing_values = fetch_one("SELECT COUNT(*) AS total FROM dashboard_data WHERE value IS NULL")["total"]
    pending = fetch_one("SELECT COUNT(*) AS total FROM proposed_updates WHERE status IN ('Pending Review', 'Ready', 'Needs Review')")["total"]
    approved = fetch_one("SELECT COUNT(*) AS total FROM approved_updates")["total"]
    processed = fetch_one("SELECT COUNT(*) AS total FROM reports WHERE status IN ('Processed', 'Approved', 'Needs Review')")["total"]
    total_reports = fetch_one("SELECT COUNT(*) AS total FROM reports WHERE report_type IN ('excel', 'pdf')")["total"]
    extraction_success_rate = round((processed / total_reports) * 100, 2) if total_reports else 0.0
    return DashboardSummary(
        nisr_indicators=int(total_indicators),
        missing_values=int(missing_values),
        proposed_updates_waiting_review=int(pending),
        approved_updates=int(approved),
        reports_processed=int(processed),
        extraction_success_rate=extraction_success_rate,
    )


@router.get("/{report_id}", response_model=ReportRead)
def get_report(report_id: str) -> ReportRead:
    row = fetch_one("SELECT * FROM reports WHERE report_id = ?", (report_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Report not found.")
    return ReportRead(**row)
