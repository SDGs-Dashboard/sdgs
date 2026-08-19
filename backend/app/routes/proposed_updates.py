from __future__ import annotations

"""Proposed update review-queue endpoints.

Staff can list and edit proposed values here, but approvals are handled by the
approval route so audit/version history is always written consistently.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from ..database import execute, fetch_all, fetch_one
from ..schemas import ProposedUpdateEditRequest, ProposedUpdateRead
from ..services.audit import log_action
from ..services.automation_rules import json_list, validate_candidate

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
    mapping = fetch_one("SELECT * FROM source_mapping WHERE mapping_id = ?", (existing["mapping_id"],))
    validation_warnings = existing.get("validation_warnings")
    if mapping:
        validation_warnings = json_list(
            validate_candidate(
                mapping=mapping,
                new_value=next_value,
                old_value=old_value,
                existing_unit=existing.get("unit_code"),
            )
        )

    execute(
        """
        UPDATE proposed_updates
        SET new_value = ?, year = ?, difference = ?, table_or_sheet = ?, evidence_page = ?,
            extraction_note = ?, reviewer_comment = ?, validation_warnings = ?, updated_at = ?
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
            validation_warnings,
            utc_now(),
            update_id,
        ),
    )
    log_action(
        "admin",
        "proposed_update_corrected",
        "proposed_update",
        update_id,
        old_value=existing["new_value"],
        new_value=next_value,
        source_file=existing["source_report"],
        source_evidence=existing["source_evidence"],
        details={
            "old_year": existing["year"],
            "new_year": next_year,
            "old_table_or_sheet": existing["table_or_sheet"],
            "new_table_or_sheet": next_table,
            "reviewer_comment": next_comment,
        },
    )

    updated = fetch_one("SELECT * FROM proposed_updates WHERE update_id = ?", (update_id,))
    if not updated:
        raise HTTPException(status_code=404, detail="Updated proposed record not found.")
    return ProposedUpdateRead(**updated)
