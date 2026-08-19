from __future__ import annotations

"""Central safety rules for the NISR SDG automation workflow.

The extractors should focus on finding candidate values. This module decides
whether a mapping is eligible for automatic extraction, which warnings should be
shown to reviewers, and whether a proposed update can be considered ready or
must stay in manual review.
"""

import json
from dataclasses import dataclass
from typing import Any

READY_STATUS = "ready"
BLOCKED_STATUS_LABELS = {
    "needs review": "Mapping is marked Needs Review and must be resolved by NISR before automatic extraction.",
    "proxy—approval required": "Proxy mapping requires explicit NISR approval before extraction.",
    "proxy-approval required": "Proxy mapping requires explicit NISR approval before extraction.",
    "proxy approval required": "Proxy mapping requires explicit NISR approval before extraction.",
    "to map": "Mapping is To Map and has no approved NISR source/table yet.",
    "unresolved": "Mapping is unresolved and must be reviewed by NISR.",
}
ALLOWED_UNITS = {"PT", "IX", "NUMBER", "NUM", "USD", "RWF", "RATE", "RATIO", "YR", "PERCENT"}
PERCENT_UNITS = {"PT", "PERCENT"}
DIMENSION_FIELDS = (
    "indicator",
    "series_code",
    "ref_area",
    "province",
    "district",
    "urbanization",
    "urbanization_code",
    "education",
    "education_code",
    "occupation",
    "occupation_code",
    "composite",
    "age",
    "age_code",
    "sex",
    "sex_code",
)
OBSERVATION_DIMENSION_FIELDS = tuple(field for field in DIMENSION_FIELDS if field not in {"indicator", "series_code"})
DIMENSION_DISPLAY_FIELDS = (
    ("ref_area", "Area"),
    ("province", "Province"),
    ("district", "District"),
    ("urbanization", "Urbanization"),
    ("education", "Education"),
    ("occupation", "Occupation"),
    ("composite", "Composite"),
    ("age", "Age"),
    ("sex", "Sex"),
)
TOTAL_DIMENSION_MARKERS = {"", "_t", "t", "total", "none", "nan", "n/a", "na", "all"}


@dataclass(frozen=True)
class EligibilityDecision:
    eligible: bool
    status: str
    reason: str


def normalize_status(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def is_proxy_mapping(mapping: dict[str, Any]) -> bool:
    status = normalize_status(mapping.get("status"))
    mapping_type = normalize_status(mapping.get("mapping_type"))
    return "proxy" in status or "proxy" in mapping_type


def mapping_eligibility(mapping: dict[str, Any]) -> EligibilityDecision:
    """Return whether a mapping row may be processed automatically.

    Only corrected, Ready, Direct mappings are eligible. Needs Review, proxy,
    To Map, unresolved, and AUTO-generated mappings are routed into review so
    the system never silently extracts from unapproved source metadata.
    """
    mapping_id = str(mapping.get("mapping_id") or "")
    if mapping_id.upper().startswith("AUTO-"):
        return EligibilityDecision(False, "missing_mapping", "Auto-generated mappings are blocked from automatic processing.")

    status = normalize_status(mapping.get("status"))
    mapping_type = normalize_status(mapping.get("mapping_type"))
    if status != READY_STATUS:
        return EligibilityDecision(False, "ambiguous_match", BLOCKED_STATUS_LABELS.get(status, f"Mapping status `{mapping.get('status') or 'blank'}` is not Ready."))

    if mapping_type and mapping_type != "direct":
        return EligibilityDecision(False, "ambiguous_match", f"Only Direct mappings can be automatically extracted; this mapping type is `{mapping.get('mapping_type')}`.")

    return EligibilityDecision(True, "extracted", "Mapping is Ready and Direct.")


def dashboard_year(mapping: dict[str, Any], fallback_year: int | None = None) -> int | None:
    for key in ("dashboard_display_year", "dashboard_year", "latest_year", "report_year"):
        value = mapping.get(key)
        if value not in (None, ""):
            try:
                return int(value)
            except (TypeError, ValueError):
                continue
    return fallback_year


def source_year(mapping: dict[str, Any], fallback_year: int | None = None) -> int | None:
    for key in ("report_year", "publication_year", "latest_year"):
        value = mapping.get(key)
        if value not in (None, ""):
            try:
                return int(value)
            except (TypeError, ValueError):
                continue
    return fallback_year


def source_period(mapping: dict[str, Any]) -> str | None:
    value = str(mapping.get("source_or_survey_period") or "").strip()
    return value or None


def json_list(values: list[str]) -> str:
    return json.dumps(values, ensure_ascii=False)


def parse_json_list(value: Any) -> list[str]:
    if not value:
        return []
    try:
        payload = json.loads(str(value))
    except json.JSONDecodeError:
        return [str(value)]
    return [str(item) for item in payload] if isinstance(payload, list) else [str(value)]


def observation_identity(row: dict[str, Any], year: int | None = None) -> dict[str, Any]:
    """Build the dimension-aware identity used for duplicate/overwrite checks."""
    identity: dict[str, Any] = {field: row.get(field) for field in DIMENSION_FIELDS if row.get(field) not in (None, "")}
    if year is not None:
        identity["year"] = int(year)
    elif row.get("year") not in (None, ""):
        identity["year"] = int(row["year"])
    return identity


def clean_dimension_value(value: Any) -> str:
    """Return a clean dimension value, treating total markers as blank."""
    normalized = " ".join(str(value or "").strip().split())
    if normalized.lower() in TOTAL_DIMENSION_MARKERS:
        return ""
    return normalized


def dimension_values(row: dict[str, Any]) -> dict[str, str]:
    """Extract meaningful non-total observation dimensions from a row/mapping."""
    values: dict[str, str] = {}
    for field in OBSERVATION_DIMENSION_FIELDS:
        value = clean_dimension_value(row.get(field))
        if value:
            values[field] = value
    return values


def dimension_summary(row: dict[str, Any]) -> str:
    """Create the compact target-observation label shown in admin review."""
    values = dimension_values(row)
    parts: list[str] = []
    for field, label in DIMENSION_DISPLAY_FIELDS:
        value = values.get(field)
        if not value:
            continue
        if field == "ref_area" and value.upper() in {"RW", "RWA"}:
            continue
        parts.append(f"{label}: {value}")
    return " | ".join(parts) if parts else "National / total"


def identity_where_clause(identity: dict[str, Any], *, table_alias: str = "") -> tuple[str, list[Any]]:
    prefix = f"{table_alias}." if table_alias else ""
    clauses: list[str] = []
    params: list[Any] = []
    for key, value in identity.items():
        if key == "indicator":
            clauses.append(f"{prefix}indicator = ?")
            params.append(value)
        elif key == "year":
            clauses.append(f"{prefix}year = ?")
            params.append(value)
        else:
            clauses.append(f"COALESCE({prefix}{key}, '') = COALESCE(?, '')")
            params.append(value)
    return " AND ".join(clauses), params


def required_mapping_warnings(mapping: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    for field in ("indicator", "series_code", "unit_code"):
        if not str(mapping.get(field) or "").strip():
            warnings.append(f"Missing required code: {field}")
    if not str(mapping.get("table_no") or mapping.get("table_title") or mapping.get("sheet_or_page") or "").strip():
        warnings.append("Missing source location")
    unresolved_source_text = " ".join(
        str(mapping.get(field) or "")
        for field in ("data_source", "report_name", "file_name_or_link", "table_title", "notes")
    ).lower()
    if any(token in unresolved_source_text for token in ("not yet identified", "to be confirmed", "source to be confirmed", "unresolved")):
        warnings.append("Missing source location")
    invalid_dimension_text = " ".join(str(mapping.get(field) or "") for field in ("geography", "disaggregation", "row_label")).lower()
    if any(token in invalid_dimension_text for token in ("invalid", "unknown code", "unmapped geography")):
        warnings.append("Invalid geographic/disaggregation codes")
    if dashboard_year(mapping) is None:
        warnings.append("Invalid or missing dashboard year")
    if source_year(mapping) is None and not source_period(mapping):
        warnings.append("Missing source/reference year")
    return warnings


def validate_candidate(
    *,
    mapping: dict[str, Any],
    new_value: float | None,
    old_value: float | None,
    existing_unit: str | None = None,
    duplicate: bool = False,
    approved_duplicate: bool = False,
) -> list[str]:
    """Run deterministic validation after extraction or manual correction.

    These warnings are deliberately conservative. Any serious validation issue
    keeps the proposal in review even when the extractor found a numeric value.
    """
    warnings = required_mapping_warnings(mapping)
    unit_code = str(mapping.get("unit_code") or "").strip().upper()

    if unit_code and unit_code not in ALLOWED_UNITS:
        warnings.append(f"Invalid unit: {unit_code}")
    if existing_unit and unit_code and existing_unit.strip().upper() != unit_code:
        warnings.append(f"Definition or unit mismatch: dashboard={existing_unit}, mapping={unit_code}")
    if is_proxy_mapping(mapping):
        warnings.append("Proxy and non-ready mapping restrictions")
    if normalize_status(mapping.get("status")) != READY_STATUS:
        warnings.append("Proxy and non-ready mapping restrictions")
    if duplicate:
        warnings.append("Duplicate observation")
    if approved_duplicate:
        warnings.append("Attempted overwrite of approved data")

    year = dashboard_year(mapping)
    if year is None or year < 1900 or year > 2100:
        warnings.append("Invalid year")
    if new_value is None:
        warnings.append("Value empty")
    else:
        if unit_code in PERCENT_UNITS and not 0 <= float(new_value) <= 100:
            warnings.append("Percentage outside 0–100")
        if old_value not in (None, 0):
            change_ratio = abs((float(new_value) - float(old_value)) / float(old_value))
            if change_ratio >= 0.25:
                warnings.append("Unexpected change from existing value")

    if str(mapping.get("series_code") or "") == "SI_POV_NMPI":
        if unit_code != "IX":
            warnings.append("MPI preservation violation: unit must remain IX")
        if new_value is not None and abs(float(new_value) - 0.136) > 1e-9:
            warnings.append("MPI preservation violation: keep MPI (M0) value 0.136; do not use poverty incidence (H)")

    return warnings


def proposal_status_from_warnings(confidence_score: float | None, warnings: list[str]) -> str:
    """Convert confidence and validation warnings into the proposal queue status."""
    blocking_terms = (
        "Proxy and non-ready",
        "MPI preservation violation",
        "Duplicate observation",
        "Attempted overwrite",
        "Definition or unit mismatch",
        "Invalid unit",
        "Invalid year",
        "Percentage outside",
    )
    if any(any(term in warning for term in blocking_terms) for warning in warnings):
        return "Needs Review"
    if confidence_score is not None and confidence_score < 0.9:
        return "Pending Review"
    return "Ready"
