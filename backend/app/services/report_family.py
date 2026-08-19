from __future__ import annotations

"""Report-family matching helpers.

Prevents an uploaded EICV/DHS/census report from being matched against mappings
for a different data source just because table text happens to look similar.
"""

import re
from typing import Any


FAMILY_PATTERNS: dict[str, tuple[str, ...]] = {
    "EICV": (
        r"\beicv\s*\d*\b",
        r"integrated household living conditions",
    ),
    "DHS": (
        r"\bdhs\b",
        r"\brdhs\b",
        r"demographic and health survey",
    ),
    "RPHC": (
        r"\brphc\b",
        r"\bcensus\b",
        r"population and housing census",
    ),
}


def _joined_text(values: tuple[Any, ...]) -> str:
    return " ".join(str(value or "") for value in values).lower()


def infer_report_family(*values: Any) -> str | None:
    text = _joined_text(values)
    if not text.strip():
        return None

    for family, patterns in FAMILY_PATTERNS.items():
        if any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in patterns):
            return family
    return None


def report_family_from_record(report: dict[str, Any]) -> str | None:
    return infer_report_family(
        report.get("report_family"),
        report.get("report_name"),
        report.get("original_file_name"),
        report.get("file_path"),
        report.get("metadata_json"),
    )


def mapping_family_from_record(mapping: dict[str, Any]) -> str | None:
    return infer_report_family(
        mapping.get("report_family"),
        mapping.get("data_source"),
        mapping.get("report_name"),
        mapping.get("file_name_or_link"),
        mapping.get("table_title"),
        mapping.get("notes"),
    )


def family_scope_decision(report: dict[str, Any], mapping: dict[str, Any]) -> tuple[bool, str | None, str | None]:
    uploaded_family = report_family_from_record(report)
    mapping_family = mapping_family_from_record(mapping)

    if not uploaded_family:
        return True, None, None

    if not mapping_family:
        return (
            False,
            "missing report data source",
            f"Uploaded report looks like {uploaded_family}, but this mapping row has no matching report_family or data_source.",
        )

    if uploaded_family != mapping_family:
        return (
            False,
            "report data source mismatch",
            f"Uploaded report is {uploaded_family}; mapping row is {mapping_family}. Value matching was not attempted.",
        )

    return True, None, f"Uploaded report and mapping row are both {uploaded_family}."
