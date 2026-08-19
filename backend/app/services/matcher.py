from __future__ import annotations

"""Text matching helpers shared by Excel and PDF extraction.

Matching is intentionally layered: exact matches are preferred, cleaned text
matches handle spacing/punctuation differences, and fuzzy scores are treated as
suggestions that need review when confidence is not strong enough.
"""

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


def reference_text_variants(value: Any) -> list[str]:
    """Expand a mapping reference into searchable aliases.

    Mapping cells often contain combined values such as table number, title,
    page, report family, and notes separated by pipes. Extractors use these
    aliases to find the same table even when report wording is slightly different.
    """
    raw_value = str(value or "").strip()
    if not raw_value:
        return []

    variants: list[str] = []

    def add(candidate: Any) -> None:
        normalized = " ".join(str(candidate or "").replace("\n", " ").split()).strip(" ,;")
        if normalized and normalized not in variants:
            variants.append(normalized)

    for piece in re.split(r"\s*\|\s*|;\s*", raw_value):
        compact_piece = " ".join(piece.replace("\n", " ").split()).strip()
        if not compact_piece:
            continue
        add(compact_piece)

        for match in re.finditer(r"\b(table|figure)\s*([a-z0-9]+(?:\s*\.\s*[a-z0-9]+)*)(?:\.)?", compact_piece, re.IGNORECASE):
            item_type, number = match.groups()
            normalized_number = re.sub(r"\s*\.\s*", ".", number.strip()).rstrip(".")
            item_reference = f"{item_type.title()} {normalized_number}"
            add(item_reference)

            remainder = compact_piece[match.end() :]
            title = re.split(r",?\s*p\.?\s*\d+|,\s*(?:eicv|nisr|rwanda)\b", remainder, maxsplit=1, flags=re.IGNORECASE)[0]
            title = title.strip(" ,:.-")
            if title:
                add(f"{item_reference}: {title}")
                add(title)
                title_before_survey = re.split(r"\s*[—-]\s*eicv|\s*,", title, maxsplit=1, flags=re.IGNORECASE)[0].strip()
                add(title_before_survey)

    return variants


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
    """Score a candidate match and explain which metadata matched."""
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
