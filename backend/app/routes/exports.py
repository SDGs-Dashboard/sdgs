from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from openpyxl import Workbook

from ..database import EXPORTS_DIR, fetch_all
from ..services.workbook_importer import export_updated_dashboard_workbook

router = APIRouter(prefix="/exports", tags=["exports"])


def _export_query_to_workbook(file_name: str, sheet_name: str, rows: list[dict]) -> Path:
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = sheet_name
    if rows:
        headers = list(rows[0].keys())
        sheet.append(headers)
        for row in rows:
            sheet.append([row.get(header) for header in headers])
    output_path = EXPORTS_DIR / file_name
    workbook.save(output_path)
    return output_path


@router.get("/dashboard")
def export_dashboard() -> FileResponse:
    output_path = export_updated_dashboard_workbook()
    return FileResponse(output_path, filename=output_path.name)


@router.get("/proposed-updates")
def export_proposed_updates() -> FileResponse:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    rows = fetch_all("SELECT * FROM proposed_updates ORDER BY extraction_date DESC, id DESC")
    output_path = _export_query_to_workbook(f"proposed_updates_{timestamp}.xlsx", "Proposed Updates", rows)
    return FileResponse(output_path, filename=output_path.name)


@router.get("/approved-updates")
def export_approved_updates() -> FileResponse:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    rows = fetch_all("SELECT * FROM approved_updates ORDER BY approved_at DESC, id DESC")
    output_path = _export_query_to_workbook(f"approved_updates_{timestamp}.xlsx", "Approved Updates", rows)
    return FileResponse(output_path, filename=output_path.name)


@router.get("/audit-log")
def export_audit_log() -> FileResponse:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    rows = fetch_all("SELECT * FROM audit_log ORDER BY created_at DESC, id DESC")
    output_path = _export_query_to_workbook(f"audit_log_{timestamp}.xlsx", "Audit Log", rows)
    return FileResponse(output_path, filename=output_path.name)


@router.get("/extraction-debug-report")
def export_extraction_debug_report(report_id: str) -> FileResponse:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    rows = fetch_all(
        """
        SELECT
            indicator AS Indicator,
            series_code AS Series_Code,
            expected_report AS [Report expected],
            expected_table AS [Table expected],
            expected_row AS [Row expected],
            expected_column AS [Column/year expected],
            status AS Status,
            reason AS Reason,
            closest_matched_row AS [Closest matched row],
            closest_matched_column AS [Closest matched column],
            confidence_score AS [Confidence score],
            source_sheet_page AS [Source sheet/page]
        FROM extraction_results
        WHERE report_id = ?
        ORDER BY id ASC
        """,
        (report_id,),
    )
    output_path = _export_query_to_workbook(f"Extraction_Debug_Report_{report_id}_{timestamp}.xlsx", "Extraction Debug", rows)
    return FileResponse(output_path, filename=output_path.name)
