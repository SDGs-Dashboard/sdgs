from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from ..database import execute, fetch_all, fetch_one
from ..schemas import ProposedUpdateEditRequest, ProposedUpdateRead

router = APIRouter(prefix="/proposed-updates", tags=["proposed-updates"])


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("", response_model=list[ProposedUpdateRead])
def list_proposed_updates(
    status: str | None = Query(default=None),
    report_id: str | None = Query(default=None),
) -> list[ProposedUpdateRead]:
    query = "SELECT * FROM proposed_updates WHERE 1=1"
    params: list[str] = []
    if status:
        query += " AND status = ?"
        params.append(status)
    if report_id:
        query += " AND source_report_id = ?"
        params.append(report_id)
    query += " ORDER BY extraction_date DESC, id DESC"
    rows = fetch_all(query, params)
    return [ProposedUpdateRead(**row) for row in rows]


@router.patch("/{update_id}", response_model=ProposedUpdateRead)
def update_proposed_update(update_id: str, payload: ProposedUpdateEditRequest) -> ProposedUpdateRead:
    existing = fetch_one("SELECT * FROM proposed_updates WHERE update_id = ?", (update_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Proposed update not found.")
    if str(existing["status"]).lower() == "approved":
        raise HTTPException(status_code=400, detail="Approved updates cannot be edited here.")

    provided_fields = payload.model_fields_set
    next_year = payload.year if "year" in provided_fields else existing["year"]
    next_value = payload.new_value if "new_value" in provided_fields else existing["new_value"]
    next_table = payload.table_or_sheet if "table_or_sheet" in provided_fields else existing["table_or_sheet"]
    next_page = payload.evidence_page if "evidence_page" in provided_fields else existing["evidence_page"]
    next_note = payload.extraction_note if "extraction_note" in provided_fields else existing["extraction_note"]
    next_comment = payload.reviewer_comment if "reviewer_comment" in provided_fields else existing["reviewer_comment"]
    old_value = existing["old_value"]
    difference = None if old_value is None or next_value is None else float(next_value) - float(old_value)

    execute(
        """
        UPDATE proposed_updates
        SET new_value = ?, year = ?, difference = ?, table_or_sheet = ?, evidence_page = ?,
            extraction_note = ?, reviewer_comment = ?, updated_at = ?
        WHERE update_id = ?
        """,
        (
            next_value,
            next_year,
            difference,
            next_table,
            next_page,
            next_note,
            next_comment,
            utc_now(),
            update_id,
        ),
    )

    updated = fetch_one("SELECT * FROM proposed_updates WHERE update_id = ?", (update_id,))
    if not updated:
        raise HTTPException(status_code=404, detail="Updated proposed record not found.")
    return ProposedUpdateRead(**updated)
