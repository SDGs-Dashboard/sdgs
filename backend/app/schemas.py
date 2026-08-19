"""Pydantic request/response models for the FastAPI automation API."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class MessageResponse(BaseModel):
    message: str


class DeleteReportResponse(BaseModel):
    message: str
    deleted_report_id: str
    report_name: str | None = None
    removed_extracted_table_count: int
    removed_extraction_result_count: int
    removed_proposed_update_count: int
    removed_approved_update_count: int
    removed_version_history_count: int


class ImportResponse(BaseModel):
    imported: bool
    workbook_path: str
    indicators: int
    mappings: int
    dashboard_rows: int
    reports: int


class ReportRead(BaseModel):
    report_id: str
    report_name: str
    report_family: str | None = None
    report_type: str
    source_institution: str | None = None
    publication_year: int | None = None
    file_path: str | None = None
    original_file_name: str | None = None
    upload_date: str
    status: str
    extraction_summary: str | None = None


class UploadResponse(BaseModel):
    report: ReportRead


class ExtractionResponse(BaseModel):
    report_id: str
    report_status: str
    extracted_tables: int
    proposed_updates: int
    total_mapping_rows_checked: int
    extracted_values: int
    needs_review: int
    not_found: int
    missing_mapping: int
    errors: int
    message: str


class ProposedUpdateRead(BaseModel):
    update_id: str
    mapping_id: str
    indicator: str
    series_code: str | None = None
    year: int
    old_value: float | None = None
    new_value: float | None = None
    difference: float | None = None
    unit_code: str | None = None
    source_report: str | None = None
    source_report_id: str | None = None
    table_or_sheet: str | None = None
    evidence_page: str | None = None
    extraction_date: str
    status: str
    reviewer_comment: str | None = None
    confidence_score: float | None = None
    confidence_label: str | None = None
    extraction_method: str | None = None
    extraction_note: str | None = None
    source_evidence: str | None = None
    matched_cell: str | None = None
    source_period: str | None = None
    publication_year: int | None = None
    dashboard_year: int | None = None
    ref_area: str | None = None
    province: str | None = None
    district: str | None = None
    urbanization: str | None = None
    urbanization_code: str | None = None
    education: str | None = None
    education_code: str | None = None
    occupation: str | None = None
    occupation_code: str | None = None
    composite: str | None = None
    age: str | None = None
    age_code: str | None = None
    sex: str | None = None
    sex_code: str | None = None
    mapping_status: str | None = None
    mapping_type: str | None = None
    validation_warnings: str | None = None
    source_year: int | None = None


class ProposedUpdateEditRequest(BaseModel):
    new_value: float | None = None
    year: int | None = Field(default=None, ge=1900, le=2100)
    table_or_sheet: str | None = None
    evidence_page: str | None = None
    extraction_note: str | None = None
    reviewer_comment: str | None = None


class ReviewActionRequest(BaseModel):
    reviewer: str = Field(default="staff")
    comment: str | None = None
    action: Literal["approve", "correct_approve", "reject", "needs_review", "return_for_review"]


class DashboardSummary(BaseModel):
    nisr_indicators: int
    missing_values: int
    proposed_updates_waiting_review: int
    approved_updates: int
    reports_processed: int
    extraction_success_rate: float


class ExtractionResultRead(BaseModel):
    id: int
    report_id: str
    mapping_id: str
    indicator: str
    series_code: str | None = None
    expected_report: str | None = None
    expected_table: str | None = None
    expected_row: str | None = None
    expected_column: str | None = None
    status: str
    reason: str
    closest_matched_row: str | None = None
    closest_matched_column: str | None = None
    confidence_score: float | None = None
    source_sheet_page: str | None = None
    dimension_summary: str | None = None
    extracted_value: float | None = None
    previous_year: int | None = None
    previous_value: float | None = None
    matched_table: str | None = None
    matched_cell: str | None = None
    debug_message: str | None = None
    proposed_update_id: str | None = None
    created_at: str
    updated_at: str


class ExtractionResultsSummary(BaseModel):
    total_mapping_rows_checked: int
    extracted: int
    needs_review: int
    not_found: int
    missing_mapping: int
    errors: int


class ExportResponse(BaseModel):
    file_name: str
    file_path: str
    kind: str


class MappingSummary(BaseModel):
    mapping_id: str
    indicator: str
    series_code: str | None = None
    report_family: str | None = None
    table_no: str | None = None
    table_title: str | None = None
    row_label: str | None = None
    column_label: str | None = None
    status: str | None = None


class ApiListResponse(BaseModel):
    items: list[dict[str, Any]]


class AuditLogEntry(BaseModel):
    id: int
    actor: str
    action: str
    entity_type: str
    entity_id: str
    old_value: str | None = None
    new_value: str | None = None
    source_file: str | None = None
    source_evidence: str | None = None
    source_period: str | None = None
    publication_year: int | None = None
    dashboard_year: int | None = None
    ref_area: str | None = None
    province: str | None = None
    district: str | None = None
    urbanization: str | None = None
    urbanization_code: str | None = None
    education: str | None = None
    education_code: str | None = None
    occupation: str | None = None
    occupation_code: str | None = None
    composite: str | None = None
    age: str | None = None
    age_code: str | None = None
    sex: str | None = None
    sex_code: str | None = None
    mapping_status: str | None = None
    mapping_type: str | None = None
    validation_warnings: str | None = None
    approval_action: str | None = None
    created_at: str
    details_json: str | None = None


class VersionHistoryEntry(BaseModel):
    id: int
    proposed_update_id: str | None = None
    dashboard_data_id: int | None = None
    indicator: str
    series_code: str | None = None
    year: int
    old_value: float | None = None
    new_value: float | None = None
    changed_by: str
    approval_action: str
    source_report: str | None = None
    source_evidence: str | None = None
    notes: str | None = None
    created_at: str
