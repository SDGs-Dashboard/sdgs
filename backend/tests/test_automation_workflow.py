from __future__ import annotations

import sys
from pathlib import Path

import pytest
from openpyxl import Workbook, load_workbook

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import database
from app.database import execute, fetch_all, fetch_one, init_db
from app.routes.approvals import review_update
from app.routes.proposed_updates import update_proposed_update
from app.schemas import ProposedUpdateEditRequest, ReviewActionRequest
from app.services.automation_rules import (
    identity_where_clause,
    mapping_eligibility,
    observation_identity,
    validate_candidate,
)
from app.services.excel_extractor import SheetSnapshot, _direct_series_year_match
from app.services.workbook_importer import ensure_year_column, export_updated_dashboard_workbook, find_dashboard_observation


@pytest.fixture()
def temp_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    db_path = tmp_path / "nisr_test.db"
    monkeypatch.setattr(database, "DATABASE_URL", "")
    monkeypatch.setattr(database, "DB_PATH", db_path)
    init_db()
    return db_path


def _ready_mapping(**overrides: object) -> dict[str, object]:
    mapping: dict[str, object] = {
        "mapping_id": "MAP-001",
        "indicator": "1.2.1",
        "series_code": "SI_POV_NAHC",
        "unit_code": "PT",
        "status": "Ready",
        "mapping_type": "Direct",
        "dashboard_display_year": 2024,
        "report_year": 2025,
        "publication_year": 2025,
        "table_no": "Table 9.1",
        "table_title": "Headcount poverty rate",
        "row_label": "Rwanda",
        "column_label": "Total",
    }
    mapping.update(overrides)
    return mapping


def test_ready_mapping_eligibility_and_non_ready_blocking() -> None:
    assert mapping_eligibility(_ready_mapping()).eligible

    blocked_statuses = ["Needs Review", "Proxy—Approval Required", "To Map", "Unresolved", "Auto-mapped"]
    for status in blocked_statuses:
        decision = mapping_eligibility(_ready_mapping(status=status))
        assert not decision.eligible
        assert decision.status in {"ambiguous_match", "missing_mapping"}

    auto_decision = mapping_eligibility(_ready_mapping(mapping_id="AUTO-001", status="Ready"))
    assert not auto_decision.eligible
    assert "Auto-generated" in auto_decision.reason


def test_mpi_preservation_blocks_wrong_value_and_keeps_expected_value() -> None:
    mapping = _ready_mapping(
        mapping_id="MAP-002",
        indicator="1.2.2",
        series_code="SI_POV_NMPI",
        unit_code="IX",
        latest_value=0.136,
        calculation_or_transformation_rule="Direct extract: National MPI (M0) index from Table B.5.",
    )
    assert validate_candidate(mapping=mapping, new_value=0.136, old_value=0.136) == []

    warnings = validate_candidate(mapping=mapping, new_value=27.4, old_value=0.136)
    assert any("MPI preservation" in warning for warning in warnings)


def test_direct_extraction_uses_dashboard_year_not_publication_year() -> None:
    sheet = SheetSnapshot(
        name="Data",
        rows=[
            ["Indicator", "Series_Code", 2024],
            ["1.2.1", "SI_POV_NAHC", 27.4],
        ],
        header_index=0,
        header=["Indicator", "Series_Code", 2024],
        header_lookup={},
        text_blob="Indicator | Series_Code | 2024\n1.2.1 | SI_POV_NAHC | 27.4",
    )
    candidate = _direct_series_year_match(sheet, _ready_mapping(report_year=2025, dashboard_display_year=2024), {"publication_year": 2025})
    assert candidate is not None
    assert candidate["year"] == 2024
    assert candidate["new_value"] == 27.4


def test_validation_detects_duplicates_invalid_percentages_and_unit_mismatch() -> None:
    mapping = _ready_mapping(unit_code="PT")
    warnings = validate_candidate(
        mapping=mapping,
        new_value=125,
        old_value=50,
        existing_unit="IX",
        duplicate=True,
        approved_duplicate=True,
    )
    assert "Percentage outside 0–100" in warnings
    assert "Duplicate observation" in warnings
    assert "Attempted overwrite of approved data" in warnings
    assert any("Definition or unit mismatch" in warning for warning in warnings)


def test_dimension_aware_matching_prefers_matching_disaggregation(temp_db: Path) -> None:
    now = "2026-01-01T00:00:00Z"
    execute(
        """
        INSERT INTO source_mapping (
            mapping_id, indicator, series_code, unit_code, status, mapping_type,
            dashboard_display_year, table_no, row_label, column_label, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("MAP-SEX", "5.1.1", "SERIES", "PT", "Ready", "Direct", 2024, "Table 1", "Female", "Total", now, now),
    )
    for sex, value in [("Male", 10), ("Female", 20)]:
        execute(
            """
            INSERT INTO dashboard_data (
                indicator, series_code, unit_code, ref_area, sex, sex_code, year, value,
                source_row_number, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            ("5.1.1", "SERIES", "PT", "RW", sex, sex.upper(), 2024, value, 2 if sex == "Male" else 3, now, now),
        )

    mapping = fetch_one("SELECT * FROM source_mapping WHERE mapping_id = ?", ("MAP-SEX",))
    assert mapping is not None
    matched = find_dashboard_observation(mapping, 2024)
    assert matched is not None
    assert matched["sex"] == "Female"
    identity = observation_identity(matched, 2024)
    clause, params = identity_where_clause(identity)
    assert "series_code" in clause
    assert 2024 in params


def test_approval_correction_rejection_return_and_audit(temp_db: Path) -> None:
    now = "2026-01-01T00:00:00Z"
    execute(
        """
        INSERT INTO source_mapping (
            mapping_id, indicator, series_code, unit_code, status, mapping_type,
            dashboard_display_year, table_no, row_label, column_label, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("MAP-APP", "1.2.1", "SI_POV_NAHC", "PT", "Ready", "Direct", 2024, "Table 9.1", "Rwanda", "Total", now, now),
    )
    execute(
        """
        INSERT INTO dashboard_data (
            indicator, series_code, unit_code, ref_area, year, value, source_row_number, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("1.2.1", "SI_POV_NAHC", "PT", "RW", 2024, 25.0, 2, now, now),
    )
    execute(
        """
        INSERT INTO reports (
            report_id, report_name, report_type, upload_date, status
        ) VALUES (?, ?, ?, ?, ?)
        """,
        ("REP", "Report", "excel", now, "Uploaded"),
    )
    for suffix, value in [("APPROVE", 27.4), ("CORRECT", 26.0), ("REJECT", 28.0), ("RETURN", 29.0)]:
        year = 2025 if suffix == "CORRECT" else 2024
        old_value = None if suffix == "CORRECT" else 25.0
        execute(
            """
            INSERT INTO proposed_updates (
                update_id, mapping_id, indicator, series_code, year, old_value, new_value,
                difference, unit_code, source_report, source_report_id, table_or_sheet, evidence_page,
                extraction_date, status, confidence_score, confidence_label, extraction_method,
                extraction_note, source_evidence, matched_cell, dashboard_year, mapping_status,
                mapping_type, validation_warnings, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"UPD-{suffix}",
                "MAP-APP",
                "1.2.1",
                "SI_POV_NAHC",
                year,
                old_value,
                value,
                None if old_value is None else value - old_value,
                "PT",
                "Report",
                "REP",
                "Table",
                "1",
                now,
                "Ready",
                0.95,
                "High",
                "test",
                "test",
                "Sheet!A1",
                "A1",
                year,
                "Ready",
                "Direct",
                "[]",
                now,
                now,
            ),
        )

    review_update("UPD-APPROVE", ReviewActionRequest(action="approve", reviewer="tester"))
    assert fetch_one("SELECT status FROM proposed_updates WHERE update_id = ?", ("UPD-APPROVE",))["status"] == "Approved"

    update_proposed_update("UPD-CORRECT", ProposedUpdateEditRequest(new_value=26.5, reviewer_comment="corrected"))
    review_update("UPD-CORRECT", ReviewActionRequest(action="correct_approve", reviewer="tester", comment="corrected"))
    assert fetch_one("SELECT status FROM proposed_updates WHERE update_id = ?", ("UPD-CORRECT",))["status"] == "Corrected and Approved"

    review_update("UPD-REJECT", ReviewActionRequest(action="reject", reviewer="tester"))
    assert fetch_one("SELECT status FROM proposed_updates WHERE update_id = ?", ("UPD-REJECT",))["status"] == "Rejected"

    review_update("UPD-RETURN", ReviewActionRequest(action="return_for_review", reviewer="tester"))
    assert fetch_one("SELECT status FROM proposed_updates WHERE update_id = ?", ("UPD-RETURN",))["status"] == "Needs Review"

    assert fetch_one("SELECT COUNT(*) AS total FROM approved_updates")["total"] == 2
    assert fetch_one("SELECT COUNT(*) AS total FROM sdg_data_version_history")["total"] == 2
    assert fetch_one("SELECT COUNT(*) AS total FROM audit_log WHERE action LIKE 'proposed_update_%'")["total"] >= 4


def test_export_adds_new_year_updates_numcolumns_and_preserves_original(temp_db: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    workbook_path = tmp_path / "control.xlsx"
    workbook = Workbook()
    data = workbook.active
    data.title = "Data"
    data.append(["Indicator", "Series", "Series_Code", "Composite", "Unit_Code", "Occupation", "Occupation_Code", "Ref_Area", "Province", "District", "Urbanization", "Urbanization_Code", "Education", "Education_Code", "Data Source", "Description", "Seats", "Age_Code", "Age", "Sex_Code", "Sex", 2023, 2024, "Table name and number"])
    data.append(["1.2.1", "Poverty", "SI_POV_NAHC", "_T", "PT", None, "_T", "RW", None, None, None, "_T", None, "_T", "NISR", "Poverty", None, "_T", None, "_T", None, 25, 27.4, "Table 9.1"])
    params = workbook.create_sheet("Parameters")
    params.append(["Element", "Type", "PosType", "Position", "", "DataStart", "V2"])
    params.append(["FREQ", "DIM", "FIX", "A", None, "NumColumns", 2])
    workbook.save(workbook_path)

    monkeypatch.setattr("app.services.workbook_importer.CONTROL_WORKBOOK_PATH", workbook_path)
    monkeypatch.setattr("app.services.workbook_importer.EXPORTS_DIR", tmp_path / "exports")

    now = "2026-01-01T00:00:00Z"
    execute(
        """
        INSERT INTO source_mapping (
            mapping_id, indicator, series_code, unit_code, status, mapping_type,
            dashboard_display_year, table_no, row_label, column_label, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("MAP-EXP", "1.2.1", "SI_POV_NAHC", "PT", "Ready", "Direct", 2025, "Table 9.1", "Rwanda", "Total", now, now),
    )
    execute(
        """
        INSERT INTO dashboard_data (
            indicator, series_code, unit_code, ref_area, year, value, source_row_number, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("1.2.1", "SI_POV_NAHC", "PT", "RW", 2025, None, 2, now, now),
    )
    execute(
        """
        INSERT INTO approved_updates (
            proposed_update_id, mapping_id, indicator, series_code, year, old_value, new_value,
            unit_code, source_report, table_or_sheet, evidence_page, approved_by, approved_at,
            source_evidence, dashboard_year, mapping_status, mapping_type, validation_warnings, approval_action
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("UPD-EXP", "MAP-EXP", "1.2.1", "SI_POV_NAHC", 2025, None, 30.0, "PT", "Report", "Table", "1", "tester", now, "Sheet!A1", 2025, "Ready", "Direct", "[]", "approve"),
    )

    output_path = export_updated_dashboard_workbook()
    original = load_workbook(workbook_path)
    exported = load_workbook(output_path)

    assert 2025 not in [cell.value for cell in original["Data"][1]]
    exported_headers = [cell.value for cell in exported["Data"][1]]
    assert 2025 in exported_headers
    assert exported["Data"].cell(row=2, column=exported_headers.index(2025) + 1).value == 30.0
    assert exported["Data"].cell(row=2, column=exported_headers.index(2023) + 1).value == 25
    assert exported["Parameters"]["G2"].value == 3


def test_ensure_year_column_updates_numcolumns_without_duplicate() -> None:
    workbook = Workbook()
    data = workbook.active
    data.title = "Data"
    data.append(["Indicator", 2023, "Table name and number"])
    params = workbook.create_sheet("Parameters")
    params.append(["Element", "Type", "PosType", "Position", "", "DataStart", "V2"])
    params.append(["FREQ", "DIM", "FIX", "A", None, "NumColumns", 1])

    first_column = ensure_year_column(workbook, data, 2024)
    second_column = ensure_year_column(workbook, data, 2024)
    assert first_column == second_column
    assert params["G2"].value == 2
