from __future__ import annotations

"""Persistence helpers for extraction debugging and review proposals.

Every mapping row should leave a trace in `extraction_results`, even when no
value was found. Successful and review-needed matches can also create
`proposed_updates`, but no value becomes dashboard data until an approval route
records the staff decision.
"""

from datetime import datetime, timezone
from typing import Any

from ..database import execute, fetch_all, fetch_one
from .automation_rules import OBSERVATION_DIMENSION_FIELDS, dashboard_year, dimension_summary, json_list, source_period, source_year, validate_candidate


VALID_RESULT_STATUSES = {"extracted", "not_found", "missing_mapping", "ambiguous_match", "error"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def clear_report_results(report_id: str) -> None:
    """Remove previous extraction artifacts before re-running one report."""
    execute("DELETE FROM extraction_results WHERE report_id = ?", (report_id,))
    execute("DELETE FROM proposed_updates WHERE source_report_id = ?", (report_id,))
    execute("DELETE FROM extracted_tables WHERE report_id = ?", (report_id,))


def record_result(
    *,
    report_id: str,
    mapping: dict[str, Any],
    status: str,
    reason: str,
    expected_report: str | None = None,
    expected_table: str | None = None,
    expected_row: str | None = None,
    expected_column: str | None = None,
    closest_matched_row: str | None = None,
    closest_matched_column: str | None = None,
    confidence_score: float | None = None,
    source_sheet_page: str | None = None,
    extracted_value: float | None = None,
    matched_table: str | None = None,
    matched_cell: str | None = None,
    debug_message: str | None = None,
    proposed_update_id: str | None = None,
) -> None:
    """Record one mapping-row outcome with enough evidence for debugging."""
    normalized_status = status if status in VALID_RESULT_STATUSES else "error"
    now = utc_now()
    execute(
        """
        INSERT INTO extraction_results (
            report_id, mapping_id, indicator, series_code, expected_report, expected_table, expected_row,
            expected_column, status, reason, closest_matched_row, closest_matched_column, confidence_score,
            source_sheet_page, dimension_summary, extracted_value, matched_table, matched_cell, debug_message, proposed_update_id,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            report_id,
            mapping["mapping_id"],
            mapping["indicator"],
            mapping.get("series_code"),
            expected_report,
            expected_table,
            expected_row,
            expected_column,
            normalized_status,
            reason,
            closest_matched_row,
            closest_matched_column,
            confidence_score,
            source_sheet_page,
            dimension_summary(mapping),
            extracted_value,
            matched_table,
            matched_cell,
            debug_message,
            proposed_update_id,
            now,
            now,
        ),
    )


def summarize_report_results(report_id: str) -> dict[str, int]:
    totals = {
        "total_mapping_rows_checked": 0,
        "extracted": 0,
        "needs_review": 0,
        "not_found": 0,
        "missing_mapping": 0,
        "errors": 0,
    }
    rows = fetch_all("SELECT status, confidence_score FROM extraction_results WHERE report_id = ?", (report_id,))
    totals["total_mapping_rows_checked"] = len(rows)
    for row in rows:
        status = row["status"]
        if status == "extracted":
            totals["extracted"] += 1
        elif status == "ambiguous_match":
            totals["needs_review"] += 1
        elif status == "not_found":
            totals["not_found"] += 1
        elif status == "missing_mapping":
            totals["missing_mapping"] += 1
        elif status == "error":
            totals["errors"] += 1
    return totals


def next_proposed_update_id(report_id: str) -> str:
    row = fetch_one("SELECT COUNT(*) AS total FROM proposed_updates WHERE source_report_id = ?", (report_id,))
    next_index = int(row["total"] if row else 0) + 1
    suffix = report_id.split("-")[-1]
    return f"UPD-{suffix}-{next_index:03d}"


def _safe_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def review_candidate_value(mapping: dict[str, Any], target_dashboard_year: int | None = None) -> float | None:
    """Return a safe manual-review candidate from corrected mapping metadata.

    This is used only for review placeholders. It never auto-approves data and
    preserves the MPI rule exactly: `SI_POV_NMPI` remains 0.136 with unit IX.
    """
    mapped_value = _safe_float(mapping.get("latest_value"))
    if str(mapping.get("series_code") or "") == "SI_POV_NMPI":
        mapped_value = mapped_value if mapped_value is not None else 0.136
        if str(mapping.get("unit_code") or "").strip().upper() != "IX":
            return None
        return 0.136 if abs(mapped_value - 0.136) < 1e-9 else None

    if mapped_value is None:
        return None

    candidate_years = {
        year
        for year in (
            _safe_int(mapping.get("dashboard_display_year")),
            _safe_int(mapping.get("latest_year")),
        )
        if year is not None
    }
    target_year = _safe_int(target_dashboard_year)
    if target_year is not None and candidate_years and target_year not in candidate_years:
        return None
    return mapped_value


def _review_candidate_note(mapping: dict[str, Any], candidate_value: float) -> str:
    if str(mapping.get("series_code") or "") == "SI_POV_NMPI":
        return f"Review candidate value set from corrected MPI mapping: {candidate_value}."
    return f"Review candidate value set from corrected mapping latest value: {candidate_value}."


def create_review_placeholder(
    *,
    report_id: str,
    report: dict[str, Any],
    mapping: dict[str, Any],
    year: int | None,
    old_value: float | None,
    status: str,
    confidence_score: float | None,
    confidence_label: str | None,
    extraction_method: str,
    extraction_note: str | None,
    table_or_sheet: str | None,
    evidence_page: str | None,
    source_evidence: str | None,
    matched_cell: str | None = None,
) -> str:
    """Create a proposed update that must be checked by staff before approval."""
    update_id = next_proposed_update_id(report_id)
    target_dashboard_year = dashboard_year(mapping, int(year or report.get("publication_year") or datetime.now().year))
    candidate_value = review_candidate_value(mapping, target_dashboard_year)
    difference = None if old_value is None or candidate_value is None else candidate_value - old_value
    final_extraction_note = extraction_note
    if candidate_value is not None:
        final_extraction_note = (
            f"{extraction_note or 'Manual review required.'} "
            f"{_review_candidate_note(mapping, candidate_value)}"
        )
    warnings = validate_candidate(
        mapping=mapping,
        new_value=candidate_value,
        old_value=old_value,
    )
    execute(
        """
        INSERT INTO proposed_updates (
            update_id, mapping_id, indicator, series_code, year, old_value, new_value,
            difference, unit_code, source_report, source_report_id, table_or_sheet, evidence_page,
            extraction_date, status, reviewer_comment, confidence_score, confidence_label,
            extraction_method, extraction_note, source_evidence, matched_cell, source_period,
            publication_year, dashboard_year, ref_area, province, district, urbanization, urbanization_code,
            education, education_code, occupation, occupation_code, composite, age, age_code, sex, sex_code,
            mapping_status, mapping_type, validation_warnings, source_year, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            update_id,
            mapping["mapping_id"],
            mapping["indicator"],
            mapping.get("series_code"),
            int(target_dashboard_year or year or report.get("publication_year") or datetime.now().year),
            old_value,
            candidate_value,
            difference,
            mapping.get("unit_code"),
            report["report_name"],
            report_id,
            table_or_sheet,
            evidence_page,
            utc_now(),
            status,
            None,
            confidence_score,
            confidence_label,
            extraction_method,
            final_extraction_note,
            source_evidence,
            matched_cell,
            source_period(mapping),
            mapping.get("publication_year") or report.get("publication_year"),
            target_dashboard_year,
            *(mapping.get(field) for field in OBSERVATION_DIMENSION_FIELDS),
            mapping.get("status"),
            mapping.get("mapping_type"),
            json_list(warnings),
            source_year(mapping, report.get("publication_year")),
            utc_now(),
            utc_now(),
        ),
    )
    return update_id
