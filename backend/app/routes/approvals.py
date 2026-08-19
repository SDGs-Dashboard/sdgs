from __future__ import annotations

"""Approval endpoints for proposed SDG updates.

This is the only place where proposed values are applied to dashboard data.
Every action writes audit and version-history records.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from ..database import execute, fetch_one, get_connection
from ..schemas import MessageResponse, ReviewActionRequest
from ..services.audit import log_action
from ..services.automation_rules import OBSERVATION_DIMENSION_FIELDS, json_list, parse_json_list, validate_candidate
from ..services.workbook_importer import find_dashboard_observation

router = APIRouter(prefix="/approvals", tags=["approvals"])


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _apply_dashboard_update(connection, update: dict, mapping: dict) -> tuple[int, float | None]:
    """Insert or update one dashboard observation after staff approval."""
    previous_value = None
    target_mapping = {**mapping, **{field: update.get(field) for field in OBSERVATION_DIMENSION_FIELDS}}
    existing = find_dashboard_observation(target_mapping, int(update["year"]))

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
            ref_area, province, district, urbanization, urbanization_code, education, education_code,
            occupation, occupation_code, composite, age, age_code, sex, sex_code, year,
            value, table_name_and_number, source_row_number, source_year_column, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            update["indicator"],
            None,
            update["series_code"],
            update["unit_code"],
            "NISR",
            None,
            update.get("ref_area") or mapping.get("ref_area") or "RW",
            update.get("province") or mapping.get("province"),
            update.get("district") or mapping.get("district"),
            update.get("urbanization") or mapping.get("urbanization"),
            update.get("urbanization_code") or mapping.get("urbanization_code"),
            update.get("education") or mapping.get("education"),
            update.get("education_code") or mapping.get("education_code"),
            update.get("occupation") or mapping.get("occupation"),
            update.get("occupation_code") or mapping.get("occupation_code"),
            update.get("composite") or mapping.get("composite"),
            update.get("age") or mapping.get("age"),
            update.get("age_code") or mapping.get("age_code"),
            update.get("sex") or mapping.get("sex"),
            update.get("sex_code") or mapping.get("sex_code"),
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
    dimension_clause = "\n          ".join(
        f"AND COALESCE({field}, '') = COALESCE(?, '')" for field in OBSERVATION_DIMENSION_FIELDS
    )
    row = connection.execute(
        f"""
        SELECT *
        FROM approved_updates
        WHERE indicator = ?
          AND COALESCE(series_code, '') = COALESCE(?, '')
          AND year = ?
          {dimension_clause}
          AND COALESCE(source_report, '') = COALESCE(?, '')
          AND COALESCE(table_or_sheet, '') = COALESCE(?, '')
          AND new_value = ?
        LIMIT 1
        """,
        (
            update["indicator"],
            update["series_code"],
            update["year"],
            *(update.get(field) or "" for field in OBSERVATION_DIMENSION_FIELDS),
            update["source_report"],
            update["table_or_sheet"],
            update["new_value"],
        ),
    ).fetchone()
    return dict(row) if row else None


def _approved_observation_exists(update: dict) -> bool:
    dimension_clause = "\n          ".join(
        f"AND COALESCE({field}, '') = COALESCE(?, '')" for field in OBSERVATION_DIMENSION_FIELDS
    )
    row = fetch_one(
        f"""
        SELECT COUNT(*) AS total
        FROM approved_updates
        WHERE mapping_id = ?
          AND COALESCE(dashboard_year, year) = ?
          {dimension_clause}
          AND proposed_update_id <> ?
        """,
        (
            update["mapping_id"],
            update.get("dashboard_year") or update["year"],
            *(update.get(field) or "" for field in OBSERVATION_DIMENSION_FIELDS),
            update["update_id"],
        ),
    )
    return bool(row and int(row["total"]) > 0)


@router.post("/{update_id}", response_model=MessageResponse)
def review_update(update_id: str, payload: ReviewActionRequest) -> MessageResponse:
    update = fetch_one("SELECT * FROM proposed_updates WHERE update_id = ?", (update_id,))
    if not update:
        raise HTTPException(status_code=404, detail="Proposed update not found.")
    mapping = fetch_one("SELECT * FROM source_mapping WHERE mapping_id = ?", (update["mapping_id"],))
    if not mapping:
        raise HTTPException(status_code=404, detail="Source mapping not found.")

    if payload.action in {"approve", "correct_approve"}:
        if update["new_value"] is None:
            raise HTTPException(status_code=400, detail="Cannot approve an empty extracted value.")
        warnings = parse_json_list(update.get("validation_warnings"))
        warnings.extend(
            validate_candidate(
                mapping=mapping,
                new_value=update["new_value"],
                old_value=update["old_value"],
                existing_unit=update.get("unit_code"),
                duplicate=False,
                approved_duplicate=_approved_observation_exists(update),
            )
        )
        warnings = sorted(set(warnings))
        with get_connection() as connection:
            duplicate = _find_duplicate_approval(connection, update)
            if duplicate and duplicate["proposed_update_id"] != update_id:
                warnings.append(
                    f"Duplicate approval override: an approved value already exists for {update['indicator']} {update['year']} from this source."
                )
                warnings = sorted(set(warnings))

            dashboard_data_id, previous_value = _apply_dashboard_update(connection, update, mapping)
            approval_time = utc_now()
            connection.execute(
                """
                INSERT INTO approved_updates (
                    proposed_update_id, mapping_id, indicator, series_code, year, old_value,
                    new_value, unit_code, source_report, table_or_sheet, evidence_page,
                    approved_by, approved_at, source_evidence, source_period, publication_year,
                    dashboard_year, ref_area, province, district, urbanization, urbanization_code,
                    education, education_code, occupation, occupation_code, composite, age, age_code,
                    sex, sex_code, mapping_status, mapping_type, validation_warnings, approval_action
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    source_evidence = excluded.source_evidence,
                    source_period = excluded.source_period,
                    publication_year = excluded.publication_year,
                    dashboard_year = excluded.dashboard_year,
                    ref_area = excluded.ref_area,
                    province = excluded.province,
                    district = excluded.district,
                    urbanization = excluded.urbanization,
                    urbanization_code = excluded.urbanization_code,
                    education = excluded.education,
                    education_code = excluded.education_code,
                    occupation = excluded.occupation,
                    occupation_code = excluded.occupation_code,
                    composite = excluded.composite,
                    age = excluded.age,
                    age_code = excluded.age_code,
                    sex = excluded.sex,
                    sex_code = excluded.sex_code,
                    mapping_status = excluded.mapping_status,
                    mapping_type = excluded.mapping_type,
                    validation_warnings = excluded.validation_warnings,
                    approval_action = excluded.approval_action
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
                    update.get("source_period"),
                    update.get("publication_year"),
                    update.get("dashboard_year") or update["year"],
                    *(update.get(field) for field in OBSERVATION_DIMENSION_FIELDS),
                    update.get("mapping_status"),
                    update.get("mapping_type"),
                    json_list(warnings),
                    payload.action,
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
                    payload.action,
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
                ("extracted", payload.action, approval_time, update_id),
            )
            connection.commit()
        status = "Approved" if payload.action == "approve" else "Corrected and Approved"
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
            ("ambiguous_match", "returned for review" if payload.action == "return_for_review" else "needs reviewer attention", utc_now(), update_id),
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
