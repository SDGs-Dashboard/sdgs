from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ..database import execute, fetch_all, fetch_one
from .automation_rules import dashboard_year, json_list, source_period, source_year, validate_candidate


VALID_RESULT_STATUSES = {"extracted", "not_found", "missing_mapping", "ambiguous_match", "error"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def clear_report_results(report_id: str) -> None:
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
    normalized_status = status if status in VALID_RESULT_STATUSES else "error"
    now = utc_now()
    execute(
        """
        INSERT INTO extraction_results (
            report_id, mapping_id, indicator, series_code, expected_report, expected_table, expected_row,
            expected_column, status, reason, closest_matched_row, closest_matched_column, confidence_score,
            source_sheet_page, extracted_value, matched_table, matched_cell, debug_message, proposed_update_id,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    update_id = next_proposed_update_id(report_id)
    target_dashboard_year = dashboard_year(mapping, int(year or report.get("publication_year") or datetime.now().year))
    warnings = validate_candidate(
        mapping=mapping,
        new_value=None,
        old_value=old_value,
    )
    execute(
        """
        INSERT INTO proposed_updates (
            update_id, mapping_id, indicator, series_code, year, old_value, new_value,
            difference, unit_code, source_report, source_report_id, table_or_sheet, evidence_page,
            extraction_date, status, reviewer_comment, confidence_score, confidence_label,
            extraction_method, extraction_note, source_evidence, matched_cell, source_period,
            publication_year, dashboard_year, mapping_status, mapping_type, validation_warnings,
            source_year, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            update_id,
            mapping["mapping_id"],
            mapping["indicator"],
            mapping.get("series_code"),
            int(target_dashboard_year or year or report.get("publication_year") or datetime.now().year),
            old_value,
            None,
            None,
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
            extraction_note,
            source_evidence,
            matched_cell,
            source_period(mapping),
            mapping.get("publication_year") or report.get("publication_year"),
            target_dashboard_year,
            mapping.get("status"),
            mapping.get("mapping_type"),
            json_list(warnings),
            source_year(mapping, report.get("publication_year")),
            utc_now(),
            utc_now(),
        ),
    )
    return update_id
