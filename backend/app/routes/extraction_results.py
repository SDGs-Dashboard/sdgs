from __future__ import annotations

from fastapi import APIRouter, Query

from ..database import fetch_all
from ..schemas import ExtractionResultRead, ExtractionResultsSummary
from ..services.extraction_results import summarize_report_results

router = APIRouter(prefix="/extraction-results", tags=["extraction-results"])


@router.get("", response_model=list[ExtractionResultRead])
def list_extraction_results(
    report_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
) -> list[ExtractionResultRead]:
    query = "SELECT * FROM extraction_results WHERE 1=1"
    params: list[str] = []
    if report_id:
        query += " AND report_id = ?"
        params.append(report_id)
    if status:
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY id ASC"
    return [ExtractionResultRead(**row) for row in fetch_all(query, params)]


@router.get("/summary", response_model=ExtractionResultsSummary)
def get_extraction_results_summary(report_id: str) -> ExtractionResultsSummary:
    return ExtractionResultsSummary(**summarize_report_results(report_id))
