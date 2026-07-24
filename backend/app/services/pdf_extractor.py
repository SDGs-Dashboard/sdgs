from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pdfplumber

from ..database import execute, fetch_all, fetch_one
from .audit import log_action
from .ai_provider import CandidateDecision, choose_extraction_candidate
from .automation_rules import (
    dashboard_year,
    json_list,
    mapping_eligibility,
    proposal_status_from_warnings,
    source_period,
    source_year,
    validate_candidate,
)
from .extraction_results import clear_report_results, create_review_placeholder, next_proposed_update_id, record_result, summarize_report_results
from .matcher import cleaned_match, confidence_label, exact_match, fuzzy_score, normalize_text
from .report_family import family_scope_decision, mapping_family_from_record, report_family_from_record
from .workbook_importer import get_current_dashboard_value
from .excel_extractor import _best_label_match, _candidate_column_terms, _candidate_row_labels, _get_mapping_context


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _page_table_title_lines(page_text: str) -> list[str]:
    return [line.strip() for line in page_text.splitlines() if line.strip().lower().startswith(("table", "figure"))]


def _significant_tokens(value: str) -> set[str]:
    stop_words = {
        "table",
        "figure",
        "and",
        "the",
        "for",
        "with",
        "from",
        "that",
        "this",
        "sex",
        "age",
        "province",
        "district",
        "residence",
        "area",
        "urban",
        "rural",
        "household",
        "households",
        "head",
        "heads",
        "population",
        "groups",
        "quintile",
        "consumption",
        "according",
        "compared",
        "girls",
        "boys",
        "male",
        "female",
        "total",
        "eicv",
        "nisr",
        "report",
        "thematic",
    }
    return {
        token
        for token in re.split(r"[^a-z0-9]+", normalize_text(value))
        if token and not token.isdigit() and token not in stop_words and not token.startswith("eicv")
    }


def _report_matches_mapping(report: dict[str, Any], mapping: dict[str, Any]) -> bool:
    report_type = normalize_text(report.get("report_type"))
    mapping_file_type = normalize_text(mapping.get("file_type"))
    mapping_report_name = normalize_text(mapping.get("report_name"))
    report_name = normalize_text(report.get("report_name"))

    if mapping_file_type and "pdf" not in mapping_file_type and "pdf+excel" not in mapping_file_type:
        return False
    family_allowed, _, _ = family_scope_decision(report, mapping)
    if not family_allowed:
        return False
    if not report_family_from_record(report) and mapping_report_name and report_name and mapping_report_name not in report_name and report_name not in mapping_report_name:
        return False
    return report_type == "pdf"


def _mapping_reference_candidates(mapping: dict[str, Any], context: dict[str, Any]) -> list[str]:
    candidates: list[str] = []
    source_reference = str(context.get("source_table_reference") or "").strip()
    table_no = str(mapping.get("table_no") or "").strip()
    table_title = str(mapping.get("table_title") or "").strip()

    for value in [
        source_reference,
        f"{table_no}: {table_title}" if table_no and table_title else "",
        table_title,
    ]:
        normalized = str(value or "").strip()
        if normalized and normalized not in candidates:
            candidates.append(normalized)
    if not candidates and table_no:
        candidates.append(table_no)
    return candidates


def _expected_report_text(mapping: dict[str, Any], report: dict[str, Any]) -> str:
    return str(
        mapping.get("report_name")
        or mapping.get("report_family")
        or mapping.get("data_source")
        or report.get("report_name")
        or ""
    ).strip()


def _expected_column_text(mapping: dict[str, Any], context: dict[str, Any], report: dict[str, Any]) -> str:
    target_year = dashboard_year(mapping, context.get("target_year") or report.get("publication_year"))
    column_label = str(mapping.get("column_label") or "").strip()
    if column_label and target_year not in (None, ""):
        return f"{column_label} / {target_year}"
    if column_label:
        return column_label
    return str(target_year or "").strip()


def _validate_mapping(mapping: dict[str, Any], context: dict[str, Any], report: dict[str, Any]) -> tuple[str | None, str | None]:
    if not str(mapping.get("report_name") or mapping.get("report_family") or mapping.get("data_source") or "").strip():
        return "missing report name", "missing_mapping"
    if not _mapping_reference_candidates(mapping, context):
        return "missing table number", "missing_mapping"
    if not _candidate_row_labels(mapping, context):
        return "missing row label", "missing_mapping"
    if not _expected_column_text(mapping, context, report):
        return "missing column/year", "missing_mapping"
    return None, None


def _iter_table_cells(table: list[list[Any]]) -> list[tuple[int, int, Any]]:
    cells: list[tuple[int, int, Any]] = []
    for row_index, row in enumerate(table):
        for col_index, cell in enumerate(row):
            cells.append((row_index, col_index, cell))
    return cells


def _nearby_numeric_values(table: list[list[Any]], row_index: int, col_index: int) -> list[tuple[float, str]]:
    values: list[tuple[float, str]] = []
    for row_offset in range(0, 2):
        current_row_index = row_index + row_offset
        if current_row_index >= len(table):
            continue
        row = table[current_row_index]
        for col_offset in range(0, 3):
            current_col_index = col_index + col_offset
            if current_col_index >= len(row):
                continue
            cell = row[current_col_index]
            if cell in (None, ""):
                continue
            try:
                numeric_value = float(str(cell).replace(",", "").strip())
            except (TypeError, ValueError):
                continue
            values.append((numeric_value, f"R{current_row_index + 1}C{current_col_index + 1}"))
    return values


def _expected_ai_payload(
    *,
    expected_report: str | None,
    expected_table: str | None,
    expected_row: str | None,
    expected_column: str | None,
) -> dict[str, Any]:
    return {
        "report": expected_report,
        "table": expected_table,
        "row": expected_row,
        "column_or_year": expected_column,
    }


def _openrouter_note(decision: CandidateDecision) -> str:
    return f"OpenRouter suggestion: {decision.reason} (confidence {decision.confidence_score:.2f})"


def _ai_choose_page(
    *,
    mapping: dict[str, Any],
    report: dict[str, Any],
    expected_report: str | None,
    expected_table: str | None,
    expected_row: str | None,
    expected_column: str | None,
    page_matches: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, str | None]:
    decision = choose_extraction_candidate(
        task="Choose the best PDF page/table reference for this mapped SDG value.",
        mapping=mapping,
        report=report,
        expected=_expected_ai_payload(
            expected_report=expected_report,
            expected_table=expected_table,
            expected_row=expected_row,
            expected_column=expected_column,
        ),
        candidates=[
            {
                "page_index": page_match["page_index"],
                "matched_line": page_match.get("matched_line"),
                "reference": page_match.get("reference"),
                "deterministic_score": round(float(page_match.get("score") or 0.0), 3),
                "match_type": page_match.get("match_type"),
                "title_lines": page_match.get("title_lines", [])[:5],
                "text_preview": str(page_match.get("text") or "")[:700],
            }
            for page_match in page_matches[:5]
        ],
    )
    if not decision:
        return None, None
    note = _openrouter_note(decision)
    if decision.status == "use_candidate" and decision.selected_index is not None and decision.confidence_score >= 0.8:
        return page_matches[decision.selected_index], note
    return None, note


def _ai_choose_pdf_candidate(
    *,
    mapping: dict[str, Any],
    report: dict[str, Any],
    expected_report: str | None,
    expected_table: str | None,
    expected_row: str | None,
    expected_column: str | None,
    candidates: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, str | None, float | None]:
    decision = choose_extraction_candidate(
        task="Choose the best extracted PDF table value for this mapped SDG observation.",
        mapping=mapping,
        report=report,
        expected=_expected_ai_payload(
            expected_report=expected_report,
            expected_table=expected_table,
            expected_row=expected_row,
            expected_column=expected_column,
        ),
        candidates=[
            {
                "new_value": candidate.get("new_value"),
                "year": candidate.get("year"),
                "matched_cell": candidate.get("matched_cell"),
                "table_or_sheet": candidate.get("table_or_sheet"),
                "closest_matched_row": candidate.get("closest_matched_row"),
                "closest_matched_column": candidate.get("closest_matched_column"),
                "deterministic_score": round(float(candidate.get("confidence_score") or 0.0), 3),
                "extraction_note": candidate.get("extraction_note"),
            }
            for candidate in candidates[:8]
        ],
    )
    if not decision:
        return None, None, None
    note = _openrouter_note(decision)
    if decision.status == "use_candidate" and decision.selected_index is not None and decision.confidence_score >= 0.8:
        return candidates[decision.selected_index], note, decision.confidence_score
    return None, note, decision.confidence_score


def _page_reference_match(page_text: str, title_lines: list[str], mapping: dict[str, Any], context: dict[str, Any]) -> dict[str, Any] | None:
    references = _mapping_reference_candidates(mapping, context)
    table_no = str(mapping.get("table_no") or "").strip()
    normalized_page = normalize_text(page_text)
    best: dict[str, Any] | None = None

    def consider(score: float, match_type: str, matched_line: str | None, reference: str, reason: str) -> None:
        nonlocal best
        candidate = {
            "score": score,
            "match_type": match_type,
            "matched_line": matched_line,
            "reference": reference,
            "reason": reason,
        }
        if best is None or candidate["score"] > best["score"]:
            best = candidate

    for reference in references:
        if not normalize_text(reference):
            continue
        if normalize_text(reference) in normalized_page:
            consider(0.96 if any(exact_match(line, reference) for line in title_lines) else 0.9, "exact", reference, reference, "exact table/title text")
        for line in title_lines:
            if exact_match(line, reference):
                consider(1.0, "exact", line, reference, "exact sheet/table match")
            elif cleaned_match(line, reference):
                consider(0.94, "cleaned", line, reference, "cleaned text match")
            else:
                score = fuzzy_score(line, reference)
                if score >= 0.6:
                    consider(score, "fuzzy", line, reference, "fuzzy title similarity")

    if table_no:
        if normalize_text(table_no) in normalized_page:
            consider(0.95, "exact", table_no, table_no, "exact table number match")
        for line in title_lines:
            if exact_match(line, table_no):
                consider(1.0, "exact", line, table_no, "exact table number match")
            elif cleaned_match(line, table_no):
                consider(0.94, "cleaned", line, table_no, "cleaned table number match")
            else:
                score = fuzzy_score(line, table_no)
                if score >= 0.7:
                    consider(score, "fuzzy", line, table_no, "fuzzy table number match")

    return best


def _table_candidate(
    table: list[list[Any]],
    mapping: dict[str, Any],
    context: dict[str, Any],
    report: dict[str, Any],
    page_index: int,
    page_match: dict[str, Any],
) -> dict[str, Any]:
    target_year = dashboard_year(mapping, report.get("publication_year"))
    target_year = int(target_year) if target_year not in (None, "") else None
    cells = _iter_table_cells(table)
    row_match = _best_label_match(cells, _candidate_row_labels(mapping, context))
    if row_match is None:
        return {
            "status": "not_found",
            "reason": "row label not found",
            "confidence_score": page_match["score"],
        }

    header_depth = min(len(table), 8)
    header_cells = _iter_table_cells(table[:header_depth])
    column_terms = [term for term in _candidate_column_terms(mapping, context, target_year) if normalize_text(term)]
    column_match = _best_label_match(header_cells, column_terms)
    if column_match is None and target_year is not None:
        column_match = _best_label_match(cells, [str(target_year)])
    if column_match is None:
        return {
            "status": "not_found",
            "reason": "year/column not found",
            "closest_matched_row": row_match["value"],
            "confidence_score": min(page_match["score"], row_match["score"]),
        }

    nearby_values = _nearby_numeric_values(table, row_match["row_index"], column_match["col_index"])
    if not nearby_values:
        return {
            "status": "not_found",
            "reason": "value empty",
            "closest_matched_row": row_match["value"],
            "closest_matched_column": column_match["value"],
            "confidence_score": min(page_match["score"], row_match["score"], column_match["score"]),
        }

    extracted_value, matched_cell = nearby_values[0]
    distinct_values = {value for value, _ in nearby_values}
    confidence = min(page_match["score"], row_match["score"], column_match["score"])
    notes = [page_match["reason"], f"row match: {row_match['match_type']}", f"column match: {column_match['match_type']}"]
    status = "extracted"
    reason = "extracted"
    if row_match["match_type"] == "fuzzy" or column_match["match_type"] == "fuzzy":
        if confidence < 0.8:
            status = "ambiguous_match"
            reason = "multiple possible matches found"
        else:
            notes.append("fuzzy match accepted")
    if len(distinct_values) > 1:
        status = "ambiguous_match"
        reason = "multiple possible matches found"
        notes.append("multiple nearby numeric values")

    return {
        "status": status,
        "reason": reason,
        "year": target_year or datetime.now().year,
        "new_value": extracted_value,
        "matched_cell": matched_cell,
        "table_or_sheet": page_match.get("matched_line") or mapping.get("table_no") or f"Page {page_index}",
        "evidence_page": str(page_index),
        "source_evidence": f"Page {page_index} {matched_cell}",
        "closest_matched_row": row_match["value"],
        "closest_matched_column": column_match["value"],
        "confidence_score": confidence,
        "confidence_label": confidence_label(confidence),
        "extraction_method": "PDF table extraction",
        "extraction_note": "; ".join(notes),
    }


def extract_report(report_id: str) -> dict[str, Any]:
    report = fetch_one("SELECT * FROM reports WHERE report_id = ?", (report_id,))
    if not report:
        raise ValueError("Report not found.")

    file_path = Path(report["file_path"])
    mappings = fetch_all("SELECT * FROM source_mapping ORDER BY mapping_id")

    clear_report_results(report_id)

    proposals = 0
    extracted_tables = 0

    with pdfplumber.open(file_path) as pdf:
        pages_payload: list[dict[str, Any]] = []
        for page_index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            title_lines = _page_table_title_lines(text)
            tables = page.extract_tables() or []
            pages_payload.append(
                {
                    "page_index": page_index,
                    "text": text,
                    "title_lines": title_lines,
                    "tables": tables,
                }
            )
            for table_index, table in enumerate(tables, start=1):
                extracted_tables += 1
                execute(
                    """
                    INSERT INTO extracted_tables (
                        report_id, sheet_name, page_number, table_number, table_title,
                        header_row_index, preview_json, text_snapshot, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        report_id,
                        None,
                        page_index,
                        f"Table {table_index}",
                        title_lines[0] if title_lines else None,
                        0,
                        str(table[:8]),
                        text[:4000],
                        utc_now(),
                    ),
                )

        for mapping in mappings:
            context = _get_mapping_context(mapping, report)
            expected_report = _expected_report_text(mapping, report)
            expected_table = " | ".join(_mapping_reference_candidates(mapping, context))
            expected_row = " | ".join(_candidate_row_labels(mapping, context))
            expected_column = _expected_column_text(mapping, context, report)

            try:
                family_allowed, family_reason, family_debug = family_scope_decision(report, mapping)
                if not family_allowed:
                    record_result(
                        report_id=report_id,
                        mapping=mapping,
                        status="missing_mapping" if family_reason == "missing report data source" else "not_found",
                        reason=family_reason or "report data source mismatch",
                        expected_report=expected_report,
                        expected_table=expected_table,
                        expected_row=expected_row,
                        expected_column=expected_column,
                        debug_message=family_debug,
                    )
                    continue

                if not _report_matches_mapping(report, mapping):
                    record_result(
                        report_id=report_id,
                        mapping=mapping,
                        status="not_found",
                        reason="report does not match uploaded file",
                        expected_report=expected_report,
                        expected_table=expected_table,
                        expected_row=expected_row,
                        expected_column=expected_column,
                        debug_message=(
                            f"Uploaded family={report_family_from_record(report) or 'unknown'}; "
                            f"mapping family={mapping_family_from_record(mapping) or 'unknown'}. "
                            "Mapping row belongs to a different report name or file type."
                        ),
                    )
                    continue

                eligibility = mapping_eligibility(mapping)
                if not eligibility.eligible:
                    placeholder_id = create_review_placeholder(
                        report_id=report_id,
                        report=report,
                        mapping=mapping,
                        year=context.get("target_year") or dashboard_year(mapping, report.get("publication_year")),
                        old_value=get_current_dashboard_value(
                            mapping["indicator"],
                            mapping.get("series_code"),
                            int(context.get("target_year") or dashboard_year(mapping, report.get("publication_year")) or datetime.now().year),
                        ),
                        status="Needs Review",
                        confidence_score=0.0,
                        confidence_label="Needs Review",
                        extraction_method="Mapping eligibility gate",
                        extraction_note=f"{eligibility.reason} Required action: {mapping.get('required_nisr_review_action') or 'Manual NISR review required.'}",
                        table_or_sheet=mapping.get("table_no") or mapping.get("table_title"),
                        evidence_page=mapping.get("sheet_or_page"),
                        source_evidence=mapping.get("file_name_or_link") or mapping.get("report_name"),
                    )
                    record_result(
                        report_id=report_id,
                        mapping=mapping,
                        status=eligibility.status,
                        reason=eligibility.reason,
                        expected_report=expected_report,
                        expected_table=expected_table,
                        expected_row=expected_row,
                        expected_column=expected_column,
                        debug_message=mapping.get("required_nisr_review_action"),
                        proposed_update_id=placeholder_id,
                    )
                    proposals += 1
                    continue

                validation_reason, validation_status = _validate_mapping(mapping, context, report)
                if validation_reason:
                    record_result(
                        report_id=report_id,
                        mapping=mapping,
                        status=validation_status or "missing_mapping",
                        reason=validation_reason,
                        expected_report=expected_report,
                        expected_table=expected_table,
                        expected_row=expected_row,
                        expected_column=expected_column,
                    )
                    continue

                page_matches: list[dict[str, Any]] = []
                for page_payload in pages_payload:
                    page_match = _page_reference_match(page_payload["text"], page_payload["title_lines"], mapping, context)
                    if page_match and page_match["score"] >= 0.6:
                        page_matches.append({**page_payload, **page_match})

                page_matches.sort(key=lambda item: item["score"], reverse=True)
                if not page_matches:
                    record_result(
                        report_id=report_id,
                        mapping=mapping,
                        status="not_found",
                        reason="table not found",
                        expected_report=expected_report,
                        expected_table=expected_table,
                        expected_row=expected_row,
                        expected_column=expected_column,
                    )
                    continue

                page_ai_note = None
                if len(page_matches) > 1 and page_matches[0]["score"] >= 0.8 and abs(page_matches[0]["score"] - page_matches[1]["score"]) <= 0.03:
                    ai_page, page_ai_note = _ai_choose_page(
                        mapping=mapping,
                        report=report,
                        expected_report=expected_report,
                        expected_table=expected_table,
                        expected_row=expected_row,
                        expected_column=expected_column,
                        page_matches=page_matches,
                    )
                    if ai_page is not None:
                        best_page = ai_page
                    else:
                        review_note = "Multiple possible mapped pages found. Enter the confirmed value after manual review."
                        if page_ai_note:
                            review_note = f"{review_note} {page_ai_note}"
                        placeholder_id = create_review_placeholder(
                            report_id=report_id,
                            report=report,
                            mapping=mapping,
                            year=context.get("target_year") or dashboard_year(mapping, report.get("publication_year")),
                            old_value=get_current_dashboard_value(
                                mapping["indicator"],
                                mapping.get("series_code"),
                                int(context.get("target_year") or dashboard_year(mapping, report.get("publication_year")) or datetime.now().year),
                            ),
                            status="Needs Review",
                            confidence_score=page_matches[0]["score"],
                            confidence_label=confidence_label(page_matches[0]["score"]),
                            extraction_method="PDF ambiguous page match",
                            extraction_note=review_note,
                            table_or_sheet=page_matches[0].get("matched_line"),
                            evidence_page=str(page_matches[0]["page_index"]),
                            source_evidence=f"Page {page_matches[0]['page_index']}: {page_matches[0].get('matched_line') or ''}".strip(),
                        )
                        record_result(
                            report_id=report_id,
                            mapping=mapping,
                            status="ambiguous_match",
                            reason="multiple possible matches found",
                            expected_report=expected_report,
                            expected_table=expected_table,
                            expected_row=expected_row,
                            expected_column=expected_column,
                            confidence_score=page_matches[0]["score"],
                            source_sheet_page=f"Page {page_matches[0]['page_index']}",
                            matched_table=page_matches[0].get("matched_line"),
                            debug_message=review_note,
                            proposed_update_id=placeholder_id,
                        )
                        proposals += 1
                        continue
                else:
                    best_page = page_matches[0]

                if not best_page["tables"]:
                    record_result(
                        report_id=report_id,
                        mapping=mapping,
                        status="not_found",
                        reason="table not found",
                        expected_report=expected_report,
                        expected_table=expected_table,
                        expected_row=expected_row,
                        expected_column=expected_column,
                        confidence_score=best_page["score"],
                        source_sheet_page=f"Page {best_page['page_index']}",
                        matched_table=best_page.get("matched_line"),
                        debug_message="The page matched, but no structured PDF table could be extracted from it.",
                    )
                    continue

                candidates: list[dict[str, Any]] = []
                failures: list[dict[str, Any]] = []
                for table in best_page["tables"]:
                    candidate = _table_candidate(table, mapping, context, report, best_page["page_index"], best_page)
                    if candidate["status"] in {"extracted", "ambiguous_match"} and candidate.get("new_value") is not None:
                        candidates.append(candidate)
                    else:
                        failures.append(candidate)

                if not candidates:
                    failure = max(failures, key=lambda item: item.get("confidence_score", 0.0), default=None)
                    placeholder_id = None
                    if failure and failure["status"] == "ambiguous_match":
                        placeholder_id = create_review_placeholder(
                            report_id=report_id,
                            report=report,
                            mapping=mapping,
                            year=context.get("target_year") or dashboard_year(mapping, report.get("publication_year")),
                            old_value=get_current_dashboard_value(
                                mapping["indicator"],
                                mapping.get("series_code"),
                                int(context.get("target_year") or dashboard_year(mapping, report.get("publication_year")) or datetime.now().year),
                            ),
                            status="Needs Review",
                            confidence_score=failure.get("confidence_score"),
                            confidence_label=confidence_label(float(failure.get("confidence_score") or 0.0)) if failure.get("confidence_score") is not None else None,
                            extraction_method="PDF manual review required",
                            extraction_note=failure.get("extraction_note") or "Candidate match needs manual review before a value can be entered.",
                            table_or_sheet=best_page.get("matched_line"),
                            evidence_page=str(best_page["page_index"]),
                            source_evidence=f"Page {best_page['page_index']}: {best_page.get('matched_line') or ''}".strip(),
                        )
                        proposals += 1
                    record_result(
                        report_id=report_id,
                        mapping=mapping,
                        status="not_found" if not failure else failure["status"],
                        reason="table not found" if not failure else failure["reason"],
                        expected_report=expected_report,
                        expected_table=expected_table,
                        expected_row=expected_row,
                        expected_column=expected_column,
                        closest_matched_row=None if not failure else failure.get("closest_matched_row"),
                        closest_matched_column=None if not failure else failure.get("closest_matched_column"),
                        confidence_score=None if not failure else failure.get("confidence_score"),
                        source_sheet_page=f"Page {best_page['page_index']}",
                        matched_table=best_page.get("matched_line"),
                        debug_message=None if not failure else failure.get("extraction_note"),
                        proposed_update_id=placeholder_id,
                    )
                    continue

                candidates.sort(key=lambda item: item["confidence_score"], reverse=True)
                best_candidate = candidates[0]
                result_status = best_candidate["status"]
                result_reason = best_candidate["reason"]
                if len(candidates) > 1:
                    ai_candidate, candidate_ai_note, candidate_ai_confidence = _ai_choose_pdf_candidate(
                        mapping=mapping,
                        report=report,
                        expected_report=expected_report,
                        expected_table=expected_table,
                        expected_row=expected_row,
                        expected_column=expected_column,
                        candidates=candidates,
                    )
                    if ai_candidate is not None:
                        best_candidate = ai_candidate
                        best_candidate["confidence_score"] = min(
                            float(best_candidate["confidence_score"]),
                            float(candidate_ai_confidence or 0.0),
                            0.89,
                        )
                        best_candidate["confidence_label"] = confidence_label(best_candidate["confidence_score"])
                        best_candidate["extraction_method"] = "OpenRouter-assisted PDF table extraction"
                        best_candidate["extraction_note"] = (
                            f"{best_candidate['extraction_note']}; {candidate_ai_note}; staff approval required"
                            if candidate_ai_note
                            else f"{best_candidate['extraction_note']}; staff approval required"
                        )
                        result_status = "ambiguous_match"
                        result_reason = "OpenRouter-assisted value suggestion"
                    else:
                        competing_values = {candidate["new_value"] for candidate in candidates[:2]}
                        if len(competing_values) > 1 and abs(candidates[0]["confidence_score"] - candidates[1]["confidence_score"]) <= 0.04:
                            result_status = "ambiguous_match"
                            result_reason = "multiple possible matches found"
                            best_candidate["extraction_note"] = f"{best_candidate['extraction_note']}; multiple table candidates on the page"
                        if candidate_ai_note:
                            best_candidate["extraction_note"] = f"{best_candidate['extraction_note']}; {candidate_ai_note}"

                if page_ai_note:
                    best_candidate["confidence_score"] = min(float(best_candidate["confidence_score"]), 0.89)
                    best_candidate["confidence_label"] = confidence_label(best_candidate["confidence_score"])
                    best_candidate["extraction_note"] = f"{best_candidate['extraction_note']}; {page_ai_note}; staff approval required"
                    result_status = "ambiguous_match"
                    result_reason = "OpenRouter-assisted page suggestion"

                year = int(dashboard_year(mapping, best_candidate["year"]) or best_candidate["year"])
                old_value = get_current_dashboard_value(mapping["indicator"], mapping.get("series_code"), year)
                new_value = float(best_candidate["new_value"])
                difference = None if old_value is None else new_value - old_value
                update_id = next_proposed_update_id(report_id)
                duplicate = bool(
                    fetch_one(
                        """
                        SELECT COUNT(*) AS total
                        FROM proposed_updates
                        WHERE mapping_id = ?
                          AND year = ?
                          AND source_report_id = ?
                        """,
                        (mapping["mapping_id"], year, report_id),
                    )["total"]
                )
                approved_duplicate = bool(
                    fetch_one(
                        """
                        SELECT COUNT(*) AS total
                        FROM approved_updates
                        WHERE mapping_id = ?
                          AND COALESCE(dashboard_year, year) = ?
                        """,
                        (mapping["mapping_id"], year),
                    )["total"]
                )
                dashboard_context = _get_mapping_context(mapping, report)
                warnings = validate_candidate(
                    mapping=mapping,
                    new_value=new_value,
                    old_value=old_value,
                    existing_unit=dashboard_context.get("unit_code"),
                    duplicate=duplicate,
                    approved_duplicate=approved_duplicate,
                )
                proposal_status = proposal_status_from_warnings(best_candidate["confidence_score"], warnings)
                if proposal_status != "Ready":
                    result_status = "ambiguous_match"
                    result_reason = "; ".join(warnings) or "Proposal requires staff review"
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
                        year,
                        old_value,
                        new_value,
                        difference,
                        mapping.get("unit_code"),
                        report["report_name"],
                        report_id,
                        best_candidate["table_or_sheet"],
                        best_candidate["evidence_page"],
                        utc_now(),
                        proposal_status,
                        None,
                        best_candidate["confidence_score"],
                        best_candidate["confidence_label"],
                        best_candidate["extraction_method"],
                        best_candidate["extraction_note"],
                        best_candidate["source_evidence"],
                        best_candidate["matched_cell"],
                        source_period(mapping),
                        mapping.get("publication_year") or report.get("publication_year"),
                        year,
                        mapping.get("status"),
                        mapping.get("mapping_type"),
                        json_list(warnings),
                        source_year(mapping, report.get("publication_year")),
                        utc_now(),
                        utc_now(),
                    ),
                )
                proposals += 1

                record_result(
                    report_id=report_id,
                    mapping=mapping,
                    status=result_status,
                    reason=result_reason,
                    expected_report=expected_report,
                    expected_table=expected_table,
                    expected_row=expected_row,
                    expected_column=expected_column,
                    closest_matched_row=best_candidate.get("closest_matched_row"),
                    closest_matched_column=best_candidate.get("closest_matched_column"),
                    confidence_score=best_candidate["confidence_score"],
                    source_sheet_page=f"Page {best_page['page_index']}",
                    extracted_value=new_value,
                    matched_table=best_candidate["table_or_sheet"],
                    matched_cell=best_candidate["matched_cell"],
                    debug_message=best_candidate["extraction_note"],
                    proposed_update_id=update_id,
                )
            except Exception as exc:
                record_result(
                    report_id=report_id,
                    mapping=mapping,
                    status="error",
                    reason="error",
                    expected_report=expected_report,
                    expected_table=expected_table,
                    expected_row=expected_row,
                    expected_column=expected_column,
                    debug_message=str(exc),
                )

    summary = summarize_report_results(report_id)
    report_status = "Needs Review" if summary["needs_review"] or summary["errors"] else "Processed"
    execute(
        "UPDATE reports SET status = ?, extraction_summary = ? WHERE report_id = ?",
        (
            report_status,
            f"Checked {summary['total_mapping_rows_checked']} mapping row(s): {summary['extracted']} extracted, {summary['needs_review']} needs review, {summary['not_found']} not found, {summary['missing_mapping']} missing mapping, {summary['errors']} errors.",
            report_id,
        ),
    )
    log_action(
        "system",
        "report_extracted_pdf",
        "report",
        report_id,
        new_value=proposals,
        source_file=report["original_file_name"],
        details={"extracted_tables": extracted_tables, "proposals": proposals, **summary},
    )
    return {
        "report_id": report_id,
        "report_status": report_status,
        "extracted_tables": extracted_tables,
        "proposed_updates": proposals,
        "total_mapping_rows_checked": summary["total_mapping_rows_checked"],
        "extracted_values": summary["extracted"],
        "needs_review": summary["needs_review"],
        "not_found": summary["not_found"],
        "missing_mapping": summary["missing_mapping"],
        "errors": summary["errors"],
        "message": "PDF extraction completed.",
    }
