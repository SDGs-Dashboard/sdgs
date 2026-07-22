from __future__ import annotations

import re
import shutil
from copy import copy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

from ..database import CONTROL_WORKBOOK_PATH, EXPORTS_DIR, execute, fetch_all, fetch_one, get_connection, init_db, init_storage, table_count
from .automation_rules import dashboard_year, identity_where_clause, observation_identity


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def generate_id(prefix: str, index: int) -> str:
    return f"{prefix}-{index:03d}"


def to_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def to_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_table_reference(reference: Any) -> tuple[str | None, str | None]:
    raw_value = str(reference or "").strip()
    if not raw_value:
        return None, None

    compact_value = " ".join(raw_value.replace("\n", " ").split())
    match = re.match(r"^(table|figure)\s+([a-z0-9]+(?:\s*\.\s*[a-z0-9]+)*)\s*[:.-]?\s*(.*)$", compact_value, re.IGNORECASE)
    if not match:
        return None, compact_value

    item_type, number, title = match.groups()
    normalized_number = re.sub(r"\s*\.\s*", ".", number.strip())
    table_number = f"{item_type.title()} {normalized_number}"
    clean_title = title.strip(" :.-") or compact_value
    return table_number, clean_title


def infer_report_family(data_source: str) -> str | None:
    normalized = (data_source or "").lower()
    if "eicv" in normalized:
        return "EICV"
    if "rphc" in normalized or "census" in normalized:
        return "Census"
    if "dhs" in normalized:
        return "DHS"
    return None


def infer_row_label(ref_area: str, province: str, district: str, urbanization: str) -> str | None:
    if district:
        return district
    if province:
        return province
    if urbanization:
        return urbanization
    if ref_area.upper() in {"RW", "RWA", "Rwanda".upper()}:
        return "Rwanda"
    return None


def workbook_exists() -> bool:
    return CONTROL_WORKBOOK_PATH.exists()


def copy_control_workbook(source_path: str | Path) -> str:
    init_storage()
    source = Path(source_path)
    shutil.copy2(source, CONTROL_WORKBOOK_PATH)
    return str(CONTROL_WORKBOOK_PATH)


def import_control_workbook(workbook_path: str | Path | None = None, *, force: bool = False) -> dict[str, Any]:
    init_storage()
    init_db()

    workbook_file = Path(workbook_path) if workbook_path else CONTROL_WORKBOOK_PATH
    if not workbook_file.exists():
        raise FileNotFoundError(f"Control workbook not found at {workbook_file}")

    if table_count("source_mapping") > 0 and not force:
        return {
            "imported": False,
            "workbook_path": str(workbook_file),
            "indicators": table_count("indicators"),
            "mappings": table_count("source_mapping"),
            "dashboard_rows": table_count("dashboard_data"),
            "reports": table_count("reports"),
        }

    workbook = load_workbook(workbook_file, read_only=True, data_only=True)
    now = utc_now()
    mapping_seeds: dict[tuple[str, str], dict[str, Any]] = {}

    with get_connection() as connection:
        cursor = connection.cursor()
        cursor.executescript(
            """
            DELETE FROM approved_updates;
            DELETE FROM proposed_updates;
            DELETE FROM extracted_tables;
            DELETE FROM reports
            WHERE COALESCE(original_file_name, '') = ''
               OR report_type = 'pending';
            DELETE FROM source_mapping;
            DELETE FROM dashboard_data;
            DELETE FROM indicators;
            """
        )

        data_sheet = workbook["Data"]
        data_headers = [cell for cell in next(data_sheet.iter_rows(min_row=1, max_row=1, values_only=True))]
        year_columns = [(index, int(header)) for index, header in enumerate(data_headers) if isinstance(header, int)]
        table_ref_index = data_headers.index("Table name and number") if "Table name and number" in data_headers else None

        for row_number, row in enumerate(data_sheet.iter_rows(min_row=2, values_only=True), start=2):
            indicator = str(row[0] or "").strip()
            series = str(row[1] or "").strip()
            series_code = str(row[2] or "").strip()
            composite = str(row[3] or "").strip()
            unit_code = str(row[4] or "").strip()
            occupation = str(row[5] or "").strip()
            occupation_code = str(row[6] or "").strip()
            data_source = str(row[14] or "").strip()
            description = str(row[15] or "").strip()
            seats = str(row[16] or "").strip()
            ref_area = str(row[7] or "").strip()
            province = str(row[8] or "").strip()
            district = str(row[9] or "").strip()
            urbanization = str(row[10] or "").strip()
            urbanization_code = str(row[11] or "").strip()
            education = str(row[12] or "").strip()
            education_code = str(row[13] or "").strip()
            age_code = str(row[17] or "").strip()
            age = str(row[18] or "").strip()
            sex_code = str(row[19] or "").strip()
            sex = str(row[20] or "").strip()
            table_reference = str(row[table_ref_index] or "").strip() if table_ref_index is not None else ""
            if not indicator:
                continue

            latest_year = None
            latest_value = None
            for column_index, year in year_columns:
                value = to_float(row[column_index])
                if value is not None:
                    latest_year = year
                    latest_value = value

            cursor.execute(
                """
                INSERT INTO indicators (
                    indicator_code, series, series_code, dashboard_description, unit_code,
                    data_source, latest_year, latest_value, geography, disaggregation,
                    source_table_reference, metadata_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(indicator_code, series_code) DO UPDATE SET
                    series = excluded.series,
                    dashboard_description = excluded.dashboard_description,
                    unit_code = excluded.unit_code,
                    data_source = excluded.data_source,
                    latest_year = excluded.latest_year,
                    latest_value = excluded.latest_value,
                    geography = excluded.geography,
                    disaggregation = excluded.disaggregation,
                    source_table_reference = excluded.source_table_reference,
                    metadata_json = excluded.metadata_json,
                    updated_at = excluded.updated_at
                """,
                (
                    indicator,
                    series,
                    series_code or None,
                    description,
                    unit_code or None,
                    data_source or None,
                    latest_year,
                    latest_value,
                    ref_area or "RW",
                    None,
                    table_reference or None,
                    "{}",
                    now,
                    now,
                ),
                )

            table_no, table_title = parse_table_reference(table_reference)
            mapping_key = (indicator, series_code or "")
            mapping_seed = mapping_seeds.get(mapping_key, {})
            mapping_seeds[mapping_key] = {
                "indicator": indicator,
                "series": series,
                "series_code": series_code or None,
                "dashboard_description": description or None,
                "unit_code": unit_code or None,
                "data_source": data_source or None,
                "latest_year": latest_year,
                "latest_value": latest_value,
                "report_family": infer_report_family(data_source),
                "report_year": latest_year,
                "file_type": "pdf+excel",
                "table_no": table_no,
                "table_title": table_title,
                "report_indicator_name": description or series or None,
                "row_label": infer_row_label(ref_area, province, district, urbanization),
                "source_table_reference": table_reference or None,
                "existing": mapping_seed.get("existing", False),
            }

            for column_index, year in year_columns:
                cursor.execute(
                    """
                    INSERT INTO dashboard_data (
                        indicator, series, series_code, composite, unit_code, data_source, description,
                        ref_area, province, district, urbanization, urbanization_code, education, education_code,
                        occupation, occupation_code, age, age_code, sex, sex_code, seats, year,
                        value, table_name_and_number, source_row_number, source_year_column, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        indicator,
                        series,
                        series_code or None,
                        composite or None,
                        unit_code or None,
                        data_source or None,
                        description or None,
                        ref_area or None,
                        province or None,
                        district or None,
                        urbanization or None,
                        urbanization_code or None,
                        education or None,
                        education_code or None,
                        occupation or None,
                        occupation_code or None,
                        age or None,
                        age_code or None,
                        sex or None,
                        sex_code or None,
                        seats or None,
                        year,
                        to_float(row[column_index]),
                        table_reference or None,
                        row_number,
                        str(year),
                        now,
                        now,
                    ),
                )

        mapping_sheet = workbook["NISR_Source_Mapping"]
        mapping_headers = [str(cell or "").strip() for cell in next(mapping_sheet.iter_rows(min_row=1, max_row=1, values_only=True))]
        imported_mapping_keys: set[tuple[str, str]] = set()
        for index, row in enumerate(mapping_sheet.iter_rows(min_row=2, values_only=True), start=1):
            payload = {mapping_headers[position]: row[position] for position in range(len(mapping_headers))}
            if not payload.get("Indicator"):
                continue
            mapping_id = str(payload.get("Mapping_ID") or generate_id("MAP", index))
            indicator = str(payload.get("Indicator") or "").strip()
            series_code = str(payload.get("Series_Code") or "").strip()
            seed = mapping_seeds.get((indicator, series_code), {})
            seed_table_no = seed.get("table_no")
            seed_table_title = seed.get("table_title")
            seed_report_family = seed.get("report_family")
            seed_report_indicator_name = seed.get("report_indicator_name")
            seed_row_label = seed.get("row_label")
            cursor.execute(
                """
                INSERT INTO source_mapping (
                    mapping_id, indicator, series, series_code, dashboard_description, unit_code,
                    data_source, latest_year, latest_value, report_family, report_name, report_year,
                    file_type, file_name_or_link, sheet_or_page, table_no, table_title,
                    report_indicator_name, row_label, column_label, geography, disaggregation,
                    extraction_method, confidence, status, reviewer, notes, mapping_type,
                    source_or_survey_period, publication_year, dashboard_display_year,
                    calculation_or_transformation_rule, required_nisr_review_action, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mapping_id,
                    indicator,
                    str(payload.get("Series") or "").strip() or None,
                    series_code or None,
                    str(payload.get("Dashboard_Description") or "").strip() or seed.get("dashboard_description"),
                    str(payload.get("Unit_Code") or "").strip() or seed.get("unit_code"),
                    str(payload.get("Data_Source") or "").strip() or seed.get("data_source"),
                    to_int(payload.get("Latest_Year")) or seed.get("latest_year"),
                    to_float(payload.get("Latest_Value")) if payload.get("Latest_Value") not in (None, "") else seed.get("latest_value"),
                    str(payload.get("Report_Family") or "").strip() or seed_report_family,
                    str(payload.get("Report_Name") or "").strip() or None,
                    to_int(payload.get("Report_Year")) or seed.get("report_year"),
                    str(payload.get("File_Type") or "").strip() or seed.get("file_type"),
                    str(payload.get("File_Name_or_Link") or "").strip() or None,
                    str(payload.get("Sheet_or_Page") or "").strip() or None,
                    str(payload.get("Table_No") or "").strip() or seed_table_no,
                    str(payload.get("Table_Title") or "").strip() or seed_table_title,
                    str(payload.get("Report_Indicator_Name") or "").strip() or seed_report_indicator_name,
                    str(payload.get("Row_Label") or "").strip() or seed_row_label,
                    str(payload.get("Column_Label") or "").strip() or None,
                    str(payload.get("Geography") or "").strip() or None,
                    str(payload.get("Disaggregation") or "").strip() or None,
                    str(payload.get("Extraction_Method") or "").strip() or None,
                    str(payload.get("Confidence") or "").strip() or None,
                    str(payload.get("Status") or "").strip() or None,
                    str(payload.get("Reviewer") or "").strip() or None,
                    str(payload.get("Notes") or "").strip() or None,
                    str(payload.get("Mapping_Type") or "").strip() or None,
                    str(payload.get("Source_or_Survey_Period") or "").strip() or None,
                    to_int(payload.get("Publication_Year")),
                    to_int(payload.get("Dashboard_Display_Year")),
                    str(payload.get("Calculation_or_Transformation_Rule") or "").strip() or None,
                    str(payload.get("Required_NISR_Review_Action") or "").strip() or None,
                    now,
                    now,
                ),
            )
            imported_mapping_keys.add((indicator, series_code))

        # Do not generate AUTO-* mappings. The corrected NISR_Source_Mapping sheet is
        # the source of truth; unmapped indicators must stay in manual review.

        register_sheet = workbook["Report_Register"]
        register_headers = [str(cell or "").strip() for cell in next(register_sheet.iter_rows(min_row=1, max_row=1, values_only=True))]
        for index, row in enumerate(register_sheet.iter_rows(min_row=2, values_only=True), start=1):
            payload = {register_headers[position]: row[position] for position in range(len(register_headers))}
            report_family = str(payload.get("Report_Family") or "").strip()
            report_id = str(payload.get("Report_ID") or generate_id("REP", index))
            if not report_family and not payload.get("Report_Name"):
                continue
            cursor.execute(
                """
                INSERT INTO reports (
                    report_id, report_name, report_family, report_type, source_institution,
                    publication_year, file_path, original_file_name, upload_date, status,
                    extraction_summary, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    report_id,
                    str(payload.get("Report_Name") or report_family or report_id),
                    report_family or None,
                    str(payload.get("File_Type") or "pending"),
                    "NISR",
                    to_int(payload.get("Report_Year")),
                    str(payload.get("File_Name_or_Link") or "").strip() or None,
                    None,
                    now,
                    str(payload.get("Status") or "Not Started"),
                    "Imported from Report_Register",
                    "{}",
                ),
            )

        connection.commit()

    return {
        "imported": True,
        "workbook_path": str(workbook_file),
        "indicators": table_count("indicators"),
        "mappings": table_count("source_mapping"),
        "dashboard_rows": table_count("dashboard_data"),
        "reports": table_count("reports"),
    }


def export_updated_dashboard_workbook() -> Path:
    if not CONTROL_WORKBOOK_PATH.exists():
        raise FileNotFoundError("Control workbook is missing.")

    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    export_path = EXPORTS_DIR / f"updated_sdg_dashboard_{timestamp}.xlsx"
    shutil.copy2(CONTROL_WORKBOOK_PATH, export_path)

    workbook = load_workbook(export_path)
    sheet = workbook["Data"]
    approved_rows = fetch_all("SELECT * FROM approved_updates ORDER BY approved_at ASC, id ASC")

    for approved in approved_rows:
        mapping = fetch_one("SELECT * FROM source_mapping WHERE mapping_id = ?", (approved["mapping_id"],))
        if not mapping:
            continue
        target_year = int(approved.get("dashboard_year") or approved.get("year") or dashboard_year(mapping) or 0)
        if target_year <= 0:
            continue
        column_number = ensure_year_column(workbook, sheet, target_year)
        dashboard_row = find_dashboard_observation(mapping, target_year)
        row_number = dashboard_row.get("source_row_number") if dashboard_row else None
        if row_number:
            sheet.cell(row=int(row_number), column=column_number).value = approved["new_value"]

    workbook.save(export_path)
    return export_path


def _year_headers(sheet: Any) -> dict[int, int]:
    lookup: dict[int, int] = {}
    for index, cell in enumerate(sheet[1], start=1):
        value = cell.value
        if isinstance(value, int):
            lookup[value] = index
        elif isinstance(value, str) and value.strip().isdigit():
            lookup[int(value.strip())] = index
    return lookup


def ensure_year_column(workbook: Any, sheet: Any, year: int) -> int:
    year_lookup = _year_headers(sheet)
    if year in year_lookup:
        update_num_columns(workbook, len(year_lookup))
        return year_lookup[year]

    headers = [cell.value for cell in sheet[1]]
    table_column = next((index + 1 for index, value in enumerate(headers) if str(value or "").strip() == "Table name and number"), sheet.max_column + 1)
    insert_at = table_column
    previous_column = max(year_lookup.values(), default=insert_at - 1)
    sheet.insert_cols(insert_at)
    if previous_column > 0:
        for row in range(1, sheet.max_row + 1):
            source_cell = sheet.cell(row=row, column=previous_column)
            target_cell = sheet.cell(row=row, column=insert_at)
            if source_cell.has_style:
                target_cell._style = copy(source_cell._style)
            target_cell.number_format = source_cell.number_format
            target_cell.font = copy(source_cell.font)
            target_cell.fill = copy(source_cell.fill)
            target_cell.border = copy(source_cell.border)
            target_cell.alignment = copy(source_cell.alignment)
    sheet.cell(row=1, column=insert_at).value = year
    sheet.column_dimensions[get_column_letter(insert_at)].width = sheet.column_dimensions[get_column_letter(previous_column)].width if previous_column > 0 else 12
    update_num_columns(workbook, len(_year_headers(sheet)))
    return insert_at


def update_num_columns(workbook: Any, year_count: int) -> None:
    if "Parameters" not in workbook.sheetnames:
        return
    sheet = workbook["Parameters"]
    for row in sheet.iter_rows():
        for cell in row:
            if str(cell.value or "").strip() == "NumColumns":
                sheet.cell(row=cell.row, column=cell.column + 1).value = year_count
                return


def find_dashboard_observation(mapping: dict[str, Any], year: int) -> dict[str, Any] | None:
    candidates = fetch_all(
        """
        SELECT *
        FROM dashboard_data
        WHERE indicator = ?
          AND COALESCE(series_code, '') = COALESCE(?, '')
          AND year = ?
        ORDER BY CASE WHEN ref_area = 'RW' THEN 0 ELSE 1 END, id
        """,
        (mapping["indicator"], mapping.get("series_code"), year),
    )
    if not candidates:
        candidates = fetch_all(
            """
            SELECT *
            FROM dashboard_data
            WHERE indicator = ?
              AND COALESCE(series_code, '') = COALESCE(?, '')
            ORDER BY CASE WHEN ref_area = 'RW' THEN 0 ELSE 1 END, year DESC, id
            """,
            (mapping["indicator"], mapping.get("series_code")),
        )
    if not candidates:
        return None

    def score_candidate(row: dict[str, Any]) -> int:
        score = 0
        mapping_labels = {
            str(mapping.get("row_label") or "").strip().lower(),
            str(mapping.get("geography") or "").strip().lower(),
            str(mapping.get("disaggregation") or "").strip().lower(),
        }
        mapping_labels.discard("")
        for field in (
            "ref_area",
            "province",
            "district",
            "urbanization",
            "education",
            "occupation",
            "composite",
            "age",
            "sex",
        ):
            value = str(row.get(field) or "").strip().lower()
            if value and value in mapping_labels:
                score += 3
        for field in (
            "urbanization_code",
            "education_code",
            "occupation_code",
            "age_code",
            "sex_code",
            "composite",
        ):
            value = str(row.get(field) or "").strip().lower()
            if value and value in mapping_labels:
                score += 2
        if str(row.get("ref_area") or "").upper() == "RW":
            score += 1
        return score

    best_row = max(candidates, key=score_candidate)
    identity = observation_identity(best_row, year=year)
    where_clause, params = identity_where_clause(identity)
    row = fetch_one(f"SELECT * FROM dashboard_data WHERE {where_clause} LIMIT 1", params)
    return row or best_row


def get_current_dashboard_value(indicator: str, series_code: str | None, year: int) -> float | None:
    row = fetch_one(
        """
        SELECT value
        FROM dashboard_data
        WHERE indicator = ?
          AND COALESCE(series_code, '') = COALESCE(?, '')
          AND year = ?
        ORDER BY CASE WHEN ref_area = 'RW' THEN 0 ELSE 1 END, id
        LIMIT 1
        """,
        (indicator, series_code, year),
    )
    return float(row["value"]) if row and row["value"] is not None else None
