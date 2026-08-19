from __future__ import annotations

"""Report library and admin dashboard summary endpoints."""

from fastapi import APIRouter, HTTPException

from ..database import fetch_all, fetch_one
from ..schemas import DashboardSummary, DeleteReportResponse, ReportRead
from ..services.report_cleanup import delete_report

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


@router.delete("/{report_id}", response_model=DeleteReportResponse)
def remove_report(report_id: str) -> DeleteReportResponse:
    try:
        result = delete_report(report_id, "admin")
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    return DeleteReportResponse(
        message=(
            f"Deleted report {result['deleted_report_id']}. "
            f"Removed {result['removed_extracted_table_count']} extracted table(s), "
            f"{result['removed_extraction_result_count']} extraction result(s), "
            f"{result['removed_proposed_update_count']} proposed update(s), "
            f"{result['removed_approved_update_count']} approved update(s), and "
            f"{result['removed_version_history_count']} version-history entry(ies)."
        ),
        **result,
    )
