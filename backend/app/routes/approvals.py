from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from ..database import execute, fetch_one, get_connection
from ..schemas import MessageResponse, ReviewActionRequest
from ..services.audit import log_action

router = APIRouter(prefix="/approvals", tags=["approvals"])


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _apply_dashboard_update(connection, update: dict) -> tuple[int, float | None]:
    previous_value = None
    existing = connection.execute(
        """
        SELECT id
             , value
        FROM dashboard_data
        WHERE indicator = ?
          AND COALESCE(series_code, '') = COALESCE(?, '')
          AND year = ?
        ORDER BY CASE WHEN ref_area = 'RW' THEN 0 ELSE 1 END, id
        LIMIT 1
        """,
        (update["indicator"], update["series_code"], update["year"]),
    ).fetchone()

    if existing:
        previous_value = existing["value"]
        connection.execute(
            "UPDATE dashboard_data SET value = ?, updated_at = ?, table_name_and_number = COALESCE(?, table_name_and_number) WHERE id = ?",
            (update["new_value"], utc_now(), update["table_or_sheet"], existing["id"]),
        )
        return int(existing["id"]), previous_value

    cursor = connection.execute(
        """
        INSERT INTO dashboard_data (
            indicator, series, series_code, unit_code, data_source, description,
            ref_area, province, district, urbanization, education, age, sex, year,
            value, table_name_and_number, source_row_number, source_year_column, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            update["indicator"],
            None,
            update["series_code"],
            update["unit_code"],
            "NISR",
            None,
            "RW",
            None,
            None,
            None,
            None,
            None,
            None,
            update["year"],
            update["new_value"],
            update["table_or_sheet"],
            None,
            str(update["year"]),
            utc_now(),
            utc_now(),
        ),
    )
    return int(cursor.lastrowid or 0), previous_value


def _find_duplicate_approval(connection, update: dict) -> dict | None:
    row = connection.execute(
        """
        SELECT *
        FROM approved_updates
        WHERE indicator = ?
          AND COALESCE(series_code, '') = COALESCE(?, '')
          AND year = ?
          AND COALESCE(source_report, '') = COALESCE(?, '')
          AND COALESCE(table_or_sheet, '') = COALESCE(?, '')
          AND new_value = ?
        LIMIT 1
        """,
        (
            update["indicator"],
            update["series_code"],
            update["year"],
            update["source_report"],
            update["table_or_sheet"],
            update["new_value"],
        ),
    ).fetchone()
    return dict(row) if row else None


@router.post("/{update_id}", response_model=MessageResponse)
def review_update(update_id: str, payload: ReviewActionRequest) -> MessageResponse:
    update = fetch_one("SELECT * FROM proposed_updates WHERE update_id = ?", (update_id,))
    if not update:
        raise HTTPException(status_code=404, detail="Proposed update not found.")

    if payload.action == "approve":
        if update["new_value"] is None:
            raise HTTPException(status_code=400, detail="Cannot approve an empty extracted value.")
        with get_connection() as connection:
            duplicate = _find_duplicate_approval(connection, update)
            if duplicate and duplicate["proposed_update_id"] != update_id:
                raise HTTPException(
                    status_code=409,
                    detail=f"Duplicate approval already exists for {update['indicator']} {update['year']} from this source.",
                )

            dashboard_data_id, previous_value = _apply_dashboard_update(connection, update)
            approval_time = utc_now()
            connection.execute(
                """
                INSERT INTO approved_updates (
                    proposed_update_id, mapping_id, indicator, series_code, year, old_value,
                    new_value, unit_code, source_report, table_or_sheet, evidence_page,
                    approved_by, approved_at, source_evidence
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(proposed_update_id) DO UPDATE SET
                    mapping_id = excluded.mapping_id,
                    indicator = excluded.indicator,
                    series_code = excluded.series_code,
                    year = excluded.year,
                    old_value = excluded.old_value,
                    new_value = excluded.new_value,
                    unit_code = excluded.unit_code,
                    source_report = excluded.source_report,
                    table_or_sheet = excluded.table_or_sheet,
                    evidence_page = excluded.evidence_page,
                    approved_by = excluded.approved_by,
                    approved_at = excluded.approved_at,
                    source_evidence = excluded.source_evidence
                """,
                (
                    update_id,
                    update["mapping_id"],
                    update["indicator"],
                    update["series_code"],
                    update["year"],
                    previous_value if previous_value is not None else update["old_value"],
                    update["new_value"],
                    update["unit_code"],
                    update["source_report"],
                    update["table_or_sheet"],
                    update["evidence_page"],
                    payload.reviewer,
                    approval_time,
                    update["source_evidence"],
                ),
            )
            connection.execute(
                """
                INSERT INTO sdg_data_version_history (
                    proposed_update_id, dashboard_data_id, indicator, series_code, year, old_value, new_value,
                    changed_by, approval_action, source_report, source_evidence, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    update_id,
                    dashboard_data_id or None,
                    update["indicator"],
                    update["series_code"],
                    update["year"],
                    previous_value if previous_value is not None else update["old_value"],
                    update["new_value"],
                    payload.reviewer,
                    "approve",
                    update["source_report"],
                    update["source_evidence"],
                    payload.comment,
                    approval_time,
                ),
            )
            connection.execute(
                "UPDATE proposed_updates SET status = ?, reviewer_comment = ?, updated_at = ? WHERE update_id = ?",
                ("Approved", payload.comment, approval_time, update_id),
            )
            connection.execute(
                "UPDATE extraction_results SET status = ?, reason = ?, updated_at = ? WHERE proposed_update_id = ?",
                ("extracted", "approved", approval_time, update_id),
            )
            connection.commit()
        status = "Approved"
    elif payload.action == "reject":
        status = "Rejected"
        execute(
            "UPDATE extraction_results SET status = ?, reason = ?, updated_at = ? WHERE proposed_update_id = ?",
            ("not_found", "rejected by reviewer", utc_now(), update_id),
        )
    else:
        status = "Needs Review"
        execute(
            "UPDATE extraction_results SET status = ?, reason = ?, updated_at = ? WHERE proposed_update_id = ?",
            ("ambiguous_match", "needs reviewer attention", utc_now(), update_id),
        )

    if payload.action != "approve":
        execute(
            "UPDATE proposed_updates SET status = ?, reviewer_comment = ?, updated_at = ? WHERE update_id = ?",
            (status, payload.comment, utc_now(), update_id),
        )
    log_action(
        payload.reviewer,
        f"proposed_update_{payload.action}",
        "proposed_update",
        update_id,
        old_value=update["old_value"],
        new_value=update["new_value"],
        source_file=update["source_report"],
        source_evidence=update["source_evidence"],
        details={"comment": payload.comment, "status": status},
    )
    return MessageResponse(message=f"Update {update_id} marked as {status}.")
