"""Standalone helper for inspecting NISR reports outside the FastAPI workflow.

The production automation uses backend/app/services/* extractors. This script is
kept for quick command-line table inspection and debugging.
"""

import json
import os
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import pdfplumber


def clean_cell(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    if isinstance(value, str):
        cleaned = value.replace("\n", " ").strip()
        return cleaned or None
    return value


def unique_headers(values: List[Optional[str]]) -> List[str]:
    counts: Dict[str, int] = {}
    headers: List[str] = []
    for index, value in enumerate(values, start=1):
        base = re.sub(r"\s+", " ", (value or "").strip()) or f"Column_{index}"
        counts[base] = counts.get(base, 0) + 1
        headers.append(base if counts[base] == 1 else f"{base}_{counts[base]}")
    return headers


def normalize_grid(rows: List[List[Any]]) -> List[List[str]]:
    if not rows:
        return []

    width = max(len(row) for row in rows)
    normalized: List[List[str]] = []
    for row in rows:
        padded = list(row) + [None] * (width - len(row))
        normalized.append(["" if cell is None else str(cell).strip() for cell in padded])
    return normalized


def detect_title(rows: List[List[Any]], fallback: str) -> Tuple[str, Optional[int]]:
    for index, row in enumerate(rows[:6]):
        text = " ".join(str(cell).strip() for cell in row if cell not in (None, ""))
        if not text:
            continue
        if re.search(r"\b(table|figure)\b", text, flags=re.IGNORECASE):
            return text, index
    return fallback, None


def find_header_index(rows: List[List[Any]], title_index: Optional[int]) -> int:
    start = (title_index + 1) if title_index is not None else 0
    best_index = start
    best_score = -1
    for index in range(start, min(len(rows), start + 8)):
        row = rows[index]
        non_empty = [cell for cell in row if cell not in (None, "")]
        text_cells = [cell for cell in non_empty if isinstance(cell, str)]
        score = len(non_empty) + len(text_cells)
        if len(non_empty) >= 2 and score > best_score:
          best_score = score
          best_index = index
    return best_index


def rows_to_records(headers: List[str], rows: List[List[Any]]) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    for row in rows:
        if not any(cell not in (None, "") for cell in row):
            continue
        padded = list(row) + [None] * (len(headers) - len(row))
        records.append({header: clean_cell(padded[index]) for index, header in enumerate(headers)})
    return records


def extract_from_dataframe(df: pd.DataFrame, fallback_title: str, sheet_name: Optional[str], cell_range: Optional[str]) -> Dict[str, Any]:
    rows = [[clean_cell(value) for value in record] for record in df.where(pd.notnull(df), None).values.tolist()]
    rows = [row for row in rows if any(value not in (None, "") for value in row)]
    title, title_index = detect_title(rows, fallback_title)
    header_index = find_header_index(rows, title_index)
    headers = unique_headers([None if value is None else str(value).strip() for value in rows[header_index]])
    body_rows = rows[header_index + 1 :]
    records = rows_to_records(headers, body_rows)

    return {
        "table_title": title,
        "table_reference": re.search(r"\b(Table|Figure)\s+[A-Za-z0-9.\-]+", title, flags=re.IGNORECASE).group(0)
        if re.search(r"\b(Table|Figure)\s+[A-Za-z0-9.\-]+", title, flags=re.IGNORECASE)
        else None,
        "page_number": None,
        "sheet_name": sheet_name,
        "cell_range": cell_range,
        "columns": headers,
        "original_preview": normalize_grid(rows[:12]),
        "row_count": len(records),
        "rows": records,
        "sample_rows": records[:8],
        "warnings": []
    }


def extract_excel_tables(input_path: str) -> List[Dict[str, Any]]:
    workbook = pd.ExcelFile(input_path)
    tables: List[Dict[str, Any]] = []
    for sheet_name in workbook.sheet_names:
        if "table of contents" in sheet_name.strip().lower():
            continue
        df = workbook.parse(sheet_name=sheet_name, header=None)
        if df.empty:
            continue
        table = extract_from_dataframe(df, sheet_name, sheet_name, None)
        table["table_title"] = table["table_title"] or sheet_name
        tables.append(table)
    return tables


def extract_csv_tables(input_path: str) -> List[Dict[str, Any]]:
    df = pd.read_csv(input_path, header=None)
    return [extract_from_dataframe(df, os.path.basename(input_path), "CSV", None)]


def extract_pdf_tables(input_path: str) -> List[Dict[str, Any]]:
    tables: List[Dict[str, Any]] = []
    with pdfplumber.open(input_path) as pdf:
        for page_index, page in enumerate(pdf.pages, start=1):
            page_text = page.extract_text() or ""
            page_lines = [line.strip() for line in page_text.splitlines() if line.strip()]
            extracted_tables = page.extract_tables() or []

            for table_index, extracted in enumerate(extracted_tables, start=1):
                rows = [[clean_cell(cell) for cell in row] for row in extracted if row]
                rows = [row for row in rows if any(value not in (None, "") for value in row)]
                if len(rows) < 2:
                    continue

                title = f"Table p{page_index}.{table_index}"
                for line in page_lines[:12]:
                    if re.search(r"\b(table|figure)\b", line, flags=re.IGNORECASE):
                        title = line
                        break

                title_index = 0 if title in page_lines else None
                header_index = find_header_index(rows, title_index)
                headers = unique_headers([None if value is None else str(value).strip() for value in rows[header_index]])
                records = rows_to_records(headers, rows[header_index + 1 :])

                tables.append(
                    {
                        "table_title": title,
                        "table_reference": re.search(
                            r"\b(Table|Figure)\s+[A-Za-z0-9.\-]+", title, flags=re.IGNORECASE
                        ).group(0)
                        if re.search(r"\b(Table|Figure)\s+[A-Za-z0-9.\-]+", title, flags=re.IGNORECASE)
                        else f"Page {page_index} Table {table_index}",
                        "page_number": page_index,
                        "sheet_name": None,
                        "cell_range": None,
                        "columns": headers,
                        "original_preview": normalize_grid(rows[:12]),
                        "row_count": len(records),
                        "rows": records,
                        "sample_rows": records[:8],
                        "warnings": []
                    }
                )

            if not extracted_tables and not page_text.strip():
                tables.append(
                    {
                        "table_title": f"Scanned page {page_index}",
                        "table_reference": f"Page {page_index}",
                        "page_number": page_index,
                        "sheet_name": None,
                        "cell_range": None,
                        "columns": [],
                        "original_preview": [],
                        "row_count": 0,
                        "rows": [],
                        "sample_rows": [],
                        "warnings": ["No machine-readable text was detected on this PDF page. OCR review is required."]
                    }
                )
    return tables


def filter_tables(tables: List[Dict[str, Any]], wanted_reference: Optional[str]) -> List[Dict[str, Any]]:
    if not wanted_reference:
        return tables

    normalized = wanted_reference.strip().lower()
    return [
        table
        for table in tables
        if normalized in (str(table.get("table_reference") or "").lower())
        or normalized in (str(table.get("table_title") or "").lower())
    ]


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: extract_nisr_report.py <input_path> [table_reference]")

    input_path = sys.argv[1]
    table_reference = sys.argv[2] if len(sys.argv) > 2 else None
    extension = os.path.splitext(input_path)[1].lower()

    if extension in (".xlsx", ".xls", ".xlsm"):
        tables = extract_excel_tables(input_path)
    elif extension == ".csv":
        tables = extract_csv_tables(input_path)
    elif extension == ".pdf":
        tables = extract_pdf_tables(input_path)
    else:
        raise SystemExit(f"Unsupported file type: {extension}")

    payload = {"tables": filter_tables(tables, table_reference)}
    sys.stdout.write(json.dumps(payload))


if __name__ == "__main__":
    main()
