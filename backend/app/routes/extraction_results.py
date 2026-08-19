from __future__ import annotations

"""Extraction debug-result endpoints.

These endpoints power the admin Extraction Results page, including current
candidate values and previous dashboard values for side-by-side review.
"""

from fastapi import APIRouter, Query

from typing import Any

from ..database import fetch_all, fetch_one
from ..schemas import ExtractionResultRead, ExtractionResultsSummary
from ..services.automation_rules import OBSERVATION_DIMENSION_FIELDS, dimension_summary
from ..services.extraction_results import review_candidate_value, summarize_report_results

router = APIRouter(prefix="/extraction-results", tags=["extraction-results"])


def _target_year(result: dict[str, Any]) -> int | None:
    proposed = fetch_one("SELECT year, dashboard_year FROM proposed_updates WHERE update_id = ?", (result.get("proposed_update_id"),))
    for value in [
        proposed.get("dashboard_year") if proposed else None,
        proposed.get("year") if proposed else None,
    ]:
        if value not in (None, ""):
            return int(value)

    mapping = fetch_one("SELECT dashboard_display_year, latest_year, report_year FROM source_mapping WHERE mapping_id = ?", (result["mapping_id"],))
    if not mapping:
        return None
    for key in ("dashboard_display_year", "latest_year", "report_year"):
        value = mapping.get(key)
        if value not in (None, ""):
            return int(value)
    return None


def _current_extracted_value(result: dict[str, Any]) -> float | None:
    if result.get("extracted_value") is not None:
        return result["extracted_value"]
    if not result.get("proposed_update_id"):
        mapping = fetch_one("SELECT * FROM source_mapping WHERE mapping_id = ?", (result["mapping_id"],))
        return review_candidate_value(mapping, _target_year(result)) if mapping and result.get("status") == "ambiguous_match" else None
    proposed = fetch_one("SELECT new_value FROM proposed_updates WHERE update_id = ?", (result["proposed_update_id"],))
    if proposed and proposed.get("new_value") is not None:
        return proposed["new_value"]
    mapping = fetch_one("SELECT * FROM source_mapping WHERE mapping_id = ?", (result["mapping_id"],))
    return review_candidate_value(mapping, _target_year(result)) if mapping and result.get("status") == "ambiguous_match" else None


def _previous_dashboard_value(result: dict[str, Any]) -> tuple[int | None, float | None]:
    target_year = _target_year(result)
    if target_year is None:
        return None, None
    proposed = fetch_one("SELECT * FROM proposed_updates WHERE update_id = ?", (result.get("proposed_update_id"),))
    if proposed:
        dimension_clause = "\n          ".join(
            f"AND COALESCE({field}, '') = COALESCE(?, '')" for field in OBSERVATION_DIMENSION_FIELDS
        )
        previous = fetch_one(
            f"""
            SELECT year, value
            FROM dashboard_data
            WHERE indicator = ?
              AND COALESCE(series_code, '') = COALESCE(?, '')
              AND year < ?
              {dimension_clause}
              AND value IS NOT NULL
            ORDER BY year DESC
            LIMIT 1
            """,
            (
                result["indicator"],
                result.get("series_code"),
                target_year,
                *(proposed.get(field) or "" for field in OBSERVATION_DIMENSION_FIELDS),
            ),
        )
        if previous:
            return int(previous["year"]), previous["value"]

    previous = fetch_one(
        """
        SELECT year, value
        FROM dashboard_data
        WHERE indicator = ?
          AND COALESCE(series_code, '') = COALESCE(?, '')
          AND year < ?
          AND value IS NOT NULL
        ORDER BY year DESC
        LIMIT 1
        """,
        (result["indicator"], result.get("series_code"), target_year),
    )
    if not previous:
        return None, None
    return int(previous["year"]), previous["value"]


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
    results: list[ExtractionResultRead] = []
    for row in fetch_all(query, params):
        payload = dict(row)
        payload["extracted_value"] = _current_extracted_value(payload)
        if not payload.get("dimension_summary"):
            proposed = fetch_one("SELECT * FROM proposed_updates WHERE update_id = ?", (payload.get("proposed_update_id"),))
            mapping = fetch_one("SELECT * FROM source_mapping WHERE mapping_id = ?", (payload["mapping_id"],))
            payload["dimension_summary"] = dimension_summary(proposed or mapping or payload)
        previous_year, previous_value = _previous_dashboard_value(payload)
        payload["previous_year"] = previous_year
        payload["previous_value"] = previous_value
        results.append(ExtractionResultRead(**payload))
    return results


@router.get("/summary", response_model=ExtractionResultsSummary)
def get_extraction_results_summary(report_id: str) -> ExtractionResultsSummary:
    return ExtractionResultsSummary(**summarize_report_results(report_id))
