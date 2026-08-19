// Legacy/local admin data models used by JSON-backed Next.js API helpers.
export type NisrFileType = 'pdf' | 'excel' | 'csv';

export type NisrProcessingStatus =
  | 'uploaded'
  | 'processing'
  | 'extracted'
  | 'needs_review'
  | 'approved'
  | 'rejected'
  | 'failed'
  | 'draft';

export type ReviewStatus = 'pending' | 'draft' | 'approved' | 'rejected';

export type DuplicateStatus = 'none' | 'exact_match' | 'conflict';

export interface NisrReportRecord {
  id: string;
  report_name: string;
  report_year: number | null;
  file_type: NisrFileType;
  mime_type: string;
  original_file_name: string;
  stored_file_path: string;
  file_size_bytes: number;
  upload_date: string;
  uploaded_by: string;
  source_url: string | null;
  table_or_figure_number: string | null;
  related_sdg_indicator: string | null;
  processing_status: NisrProcessingStatus;
  extraction_engine: string | null;
  extraction_error: string | null;
  extraction_started_at?: string | null;
  extraction_completed_at?: string | null;
  extraction_summary?: string | null;
  notes: string | null;
}

export interface NisrExtractedTableRecord {
  id: string;
  report_id: string;
  table_index: number;
  table_number: string | null;
  table_title: string;
  page_number: number | null;
  sheet_name: string | null;
  cell_range: string | null;
  headers: string[];
  original_preview: string[][];
  raw_rows: Array<Record<string, string | number | null>>;
  sample_rows: Array<Record<string, string | number | null>>;
  suggested_sdg_indicator: string | null;
  suggestion_confidence_score: number;
  suggestion_explanation: string;
  processing_status: NisrProcessingStatus;
  extraction_warnings: string[];
  source_kind?: 'table' | 'figure' | 'sheet' | 'unknown';
  extraction_method?: string | null;
  raw_ai_json?: string | null;
  extracted_at: string;
}

export interface NisrExtractedValueRecord {
  id: string;
  report_id: string;
  extracted_table_id: string;
  goal: string | null;
  target: string | null;
  indicator: string | null;
  indicator_code: string;
  series: string;
  series_code: string;
  unit: string;
  location: string;
  province: string;
  district: string;
  sex: string;
  age_group: string;
  time_period: string;
  value: number | null;
  data_source: string;
  report_name: string;
  table_number: string | null;
  page_number: number | null;
  source_url: string | null;
  notes: string;
  confidence_score: number;
  suggestion_explanation: string;
  validation_issues: string[];
  duplicate_status: DuplicateStatus;
  duplicate_with_record_id: string | null;
  change_warning: string | null;
  overwrite_warning: string | null;
  review_status: ReviewStatus;
  needs_review: boolean;
  ai_payload_json: string | null;
  original_row_json: string;
  last_edited_at: string;
  last_edited_by: string | null;
}

export interface SdgIndicatorMappingRuleRecord {
  id: string;
  pattern: string;
  pattern_type: 'contains' | 'exact' | 'regex';
  indicator_code: string;
  series: string | null;
  series_code: string | null;
  unit: string | null;
  explanation: string;
  priority: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SdgDataApprovalRecord {
  id: string;
  report_id: string;
  extracted_table_id: string;
  extracted_value_id: string;
  action: 'approve' | 'reject' | 'draft';
  status: ReviewStatus;
  reviewer: string;
  review_note: string | null;
  approved_record_id: string | null;
  created_at: string;
}

export interface SdgDataVersionHistoryRecord {
  id: string;
  indicator_code: string;
  approved_record_id: string;
  report_id: string;
  extracted_value_id: string;
  time_period: string;
  location_key: string;
  previous_value: number | null;
  new_value: number | null;
  changed_by: string;
  changed_at: string;
  reason: string;
}

export interface ApprovedSdgDataRecord {
  id: string;
  extracted_value_id: string;
  report_id: string;
  goal: string | null;
  target: string | null;
  indicator: string | null;
  indicator_code: string;
  series: string;
  series_code: string;
  unit: string;
  location: string;
  province: string;
  district: string;
  sex: string;
  age_group: string;
  time_period: string;
  value: number;
  data_source: string;
  report_name: string;
  table_number: string | null;
  page_number: number | null;
  source_url: string | null;
  notes: string;
  approved_by: string;
  approved_at: string;
}

export interface SourceLogRecord {
  id: string;
  indicator_code: string;
  indicator_name: string;
  value: number;
  year: number;
  source_report_name: string;
  institution: string;
  page_number: number | null;
  upload_date: string;
  approved_by: string;
  approved_at: string;
  report_id: string;
  approved_record_id: string;
  source_url?: string | null;
  table_number?: string | null;
}

export interface AuditLogRecord {
  id: string;
  actor: string;
  action: string;
  entity_type: 'report' | 'table' | 'value' | 'approval' | 'export' | 'auth';
  entity_id: string;
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
}

export interface AdminDatabase {
  version: number;
  nisr_reports: NisrReportRecord[];
  nisr_extracted_tables: NisrExtractedTableRecord[];
  nisr_extracted_values: NisrExtractedValueRecord[];
  sdg_indicator_mapping_rules: SdgIndicatorMappingRuleRecord[];
  sdg_data_approvals: SdgDataApprovalRecord[];
  sdg_data_version_history: SdgDataVersionHistoryRecord[];
  approved_sdg_data: ApprovedSdgDataRecord[];
  source_log: SourceLogRecord[];
  audit_log: AuditLogRecord[];
}

export interface AdminSession {
  username: string;
  role: 'Admin';
  issuedAt: number;
  expiresAt: number;
}
