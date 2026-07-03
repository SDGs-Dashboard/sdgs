from __future__ import annotations

import re
from typing import Any

from rapidfuzz import fuzz


def normalize_text(value: Any) -> str:
    normalized = str(value or "").strip().lower().replace("\n", " ")
    normalized = normalized.replace("\u2011", "-").replace("\u2013", "-").replace("\u2014", "-")
    normalized = re.sub(r"\s*\.\s*", ".", normalized)
    normalized = re.sub(r"\s*:\s*", ": ", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def is_blank(value: Any) -> bool:
    return normalize_text(value) == ""


def exact_match(left: Any, right: Any) -> bool:
    left_value = normalize_text(left)
    right_value = normalize_text(right)
    return bool(left_value and right_value and left_value == right_value)


def cleaned_text(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", normalize_text(value))


def cleaned_match(left: Any, right: Any) -> bool:
    left_value = cleaned_text(left)
    right_value = cleaned_text(right)
    return bool(left_value and right_value and left_value == right_value)


def fuzzy_score(left: Any, right: Any) -> float:
    left_value = normalize_text(left)
    right_value = normalize_text(right)
    if not left_value or not right_value:
        return 0.0
    return fuzz.ratio(left_value, right_value) / 100.0


def confidence_label(score: float) -> str:
    if score >= 0.9:
        return "High"
    if score >= 0.75:
        return "Medium"
    return "Low"


def score_match(
    *,
    table_number_match: bool,
    table_title_match: bool,
    row_label_match: bool,
    column_label_match: bool,
    fuzzy_only: bool,
    series_code_match: bool = False,
    indicator_code_match: bool = False,
) -> tuple[float, str]:
    if fuzzy_only:
        return 0.55, "Fuzzy text suggestion only"

    score = 0.4
    notes: list[str] = []

    if series_code_match:
        score += 0.55
        notes.append("Exact series code match")
    elif indicator_code_match:
        score += 0.45
        notes.append("Exact indicator code match")

    if table_number_match:
        score += 0.2
        notes.append("Exact table number match")
    if table_title_match:
        score += 0.12
        notes.append("Exact table title match")
    if row_label_match:
        score += 0.08
        notes.append("Exact row label match")
    if column_label_match:
        score += 0.05
        notes.append("Exact column/year match")

    return min(score, 0.99), "; ".join(notes) or "Metadata-assisted sheet match"
