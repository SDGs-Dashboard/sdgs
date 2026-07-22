import fs from 'fs';
import path from 'path';

import { ADMIN_DB_PATH, ADMIN_EXTRACTED_JSON_DIR, PUBLIC_APPROVED_DATA_DIR, REPORT_UPLOADS_DIR } from './constants';
import {
  AdminDatabase,
  ApprovedSdgDataRecord,
  AuditLogRecord,
  NisrExtractedTableRecord,
  NisrExtractedValueRecord,
  NisrProcessingStatus,
  NisrReportRecord,
  SdgDataApprovalRecord,
  SdgDataVersionHistoryRecord,
  SdgIndicatorMappingRuleRecord,
  SourceLogRecord
} from './types';

const DEFAULT_DB: AdminDatabase = {
  version: 2,
  nisr_reports: [],
  nisr_extracted_tables: [],
  nisr_extracted_values: [],
  sdg_indicator_mapping_rules: [],
  sdg_data_approvals: [],
  sdg_data_version_history: [],
  approved_sdg_data: [],
  source_log: [],
  audit_log: []
};

const cloneDefaultDb = (): AdminDatabase => JSON.parse(JSON.stringify(DEFAULT_DB)) as AdminDatabase;

const toStatus = (value: unknown): NisrProcessingStatus => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll(' ', '_');

  switch (normalized) {
    case 'uploaded':
    case 'processing':
    case 'extracted':
    case 'needs_review':
    case 'approved':
    case 'rejected':
    case 'failed':
    case 'draft':
      return normalized;
    case 'ai_suggested':
      return 'needs_review';
    default:
      return 'uploaded';
  }
};

const asNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const asString = (value: unknown): string => String(value ?? '').trim();

const inferGoalTarget = (indicatorCode: string): { goal: string | null; target: string | null } => {
  const cleaned = indicatorCode.trim();
  if (!cleaned) {
    return { goal: null, target: null };
  }
  const parts = cleaned.split('.');
  return {
    goal: parts[0] || null,
    target: parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0] || null
  };
};

const migrateLegacyReports = (candidate: any): NisrReportRecord[] =>
  Array.isArray(candidate?.nisr_reports)
    ? candidate.nisr_reports
    : Array.isArray(candidate?.reports)
      ? candidate.reports.map((report: any) => ({
          id: asString(report.id),
          report_name: asString(report.report_name),
          report_year: asNumberOrNull(report.report_year),
          file_type: report.file_type === 'pdf' ? 'pdf' : report.file_type === 'excel' ? 'excel' : 'csv',
          mime_type: asString(report.mime_type) || 'application/octet-stream',
          original_file_name: asString(report.original_file_name),
          stored_file_path: asString(report.stored_file_path),
          file_size_bytes: asNumberOrNull(report.file_size_bytes) ?? 0,
          upload_date: asString(report.upload_date),
          uploaded_by: asString(report.uploaded_by) || 'admin',
          source_url: asString(report.source_url) || null,
          table_or_figure_number: asString(report.table_or_figure_number || report.table_reference) || null,
          related_sdg_indicator: asString(report.related_sdg_indicator) || null,
          processing_status: toStatus(report.status),
          extraction_engine: asString(report.extraction_engine) || null,
          extraction_error: asString(report.extraction_error) || null,
          extraction_started_at: asString(report.extraction_started_at) || null,
          extraction_completed_at: asString(report.extraction_completed_at) || null,
          extraction_summary: asString(report.extraction_summary) || null,
          notes: asString(report.notes) || null
        }))
      : [];

const migrateLegacyTables = (candidate: any): NisrExtractedTableRecord[] =>
  Array.isArray(candidate?.nisr_extracted_tables)
    ? candidate.nisr_extracted_tables
    : Array.isArray(candidate?.extracted_tables)
      ? candidate.extracted_tables.map((table: any) => ({
          id: asString(table.id),
          report_id: asString(table.report_id),
          table_index: asNumberOrNull(table.table_index) ?? 0,
          table_number: asString(table.table_number || table.table_reference) || null,
          table_title: asString(table.table_title),
          page_number: asNumberOrNull(table.page_number),
          sheet_name: asString(table.sheet_name) || null,
          cell_range: asString(table.cell_range) || null,
          headers: Array.isArray(table.headers) ? table.headers.map((value: unknown) => asString(value)) : table.columns || [],
          original_preview: [],
          raw_rows: Array.isArray(table.rows) ? table.rows : [],
          sample_rows: Array.isArray(table.sample_rows) ? table.sample_rows : [],
          suggested_sdg_indicator: asString(table.suggested_sdg_indicator) || null,
          suggestion_confidence_score: asNumberOrNull(table.suggestion_confidence_score) ?? 0,
          suggestion_explanation: asString(table.suggestion_explanation),
          processing_status: toStatus(table.status),
          extraction_warnings: Array.isArray(table.extraction_warnings) ? table.extraction_warnings : [],
          source_kind: ['table', 'figure', 'sheet', 'unknown'].includes(asString(table.source_kind))
            ? asString(table.source_kind as string) as 'table' | 'figure' | 'sheet' | 'unknown'
            : 'unknown',
          extraction_method: asString(table.extraction_method) || null,
          raw_ai_json: asString(table.raw_ai_json) || null,
          extracted_at: asString(table.extracted_at)
        }))
      : [];

const migrateLegacyValues = (candidate: any): NisrExtractedValueRecord[] =>
  Array.isArray(candidate?.nisr_extracted_values)
    ? candidate.nisr_extracted_values
    : Array.isArray(candidate?.indicator_suggestions)
      ? candidate.indicator_suggestions.map((suggestion: any) => {
          const indicatorCode = asString(suggestion.sdg_indicator_code);
          const { goal, target } = inferGoalTarget(indicatorCode);
          return {
            id: asString(suggestion.id),
            report_id: asString(suggestion.report_id),
            extracted_table_id: asString(suggestion.extracted_table_id),
            goal,
            target,
            indicator: asString(suggestion.indicator_name) || null,
            indicator_code: indicatorCode,
            series: asString(suggestion.source_table_name || suggestion.indicator_name),
            series_code: asString(suggestion.series_code || indicatorCode.replaceAll('.', '_')),
            unit: asString(suggestion.unit),
            location: asString(suggestion.district || suggestion.disaggregation || 'Rwanda'),
            province: asString(suggestion.province),
            district: asString(suggestion.district),
            sex: asString(suggestion.sex),
            age_group: asString(suggestion.age_group),
            time_period: suggestion.year ? String(suggestion.year) : '',
            value: asNumberOrNull(suggestion.value),
            data_source: 'NISR',
            report_name: '',
            table_number: asString(suggestion.source_table_reference) || null,
            page_number: asNumberOrNull(suggestion.source_page),
            source_url: null,
            notes: asString(suggestion.review_comment),
            confidence_score: asNumberOrNull(suggestion.confidence_score) ?? 0,
            suggestion_explanation: asString(suggestion.explanation),
            validation_issues: [],
            duplicate_status: 'none',
            duplicate_with_record_id: null,
            change_warning: null,
            overwrite_warning: null,
            review_status:
              toStatus(suggestion.status) === 'approved'
                ? 'approved'
                : toStatus(suggestion.status) === 'rejected'
                  ? 'rejected'
                  : 'pending',
            needs_review: Boolean(suggestion.needs_review),
            ai_payload_json: null,
            original_row_json: '{}',
            last_edited_at: asString(suggestion.updated_at || suggestion.created_at),
            last_edited_by: null
          };
        })
      : [];

const migrateRules = (candidate: any): SdgIndicatorMappingRuleRecord[] =>
  Array.isArray(candidate?.sdg_indicator_mapping_rules) ? candidate.sdg_indicator_mapping_rules : [];

const migrateApprovals = (candidate: any): SdgDataApprovalRecord[] =>
  Array.isArray(candidate?.sdg_data_approvals) ? candidate.sdg_data_approvals : [];

const migrateVersionHistory = (candidate: any): SdgDataVersionHistoryRecord[] =>
  Array.isArray(candidate?.sdg_data_version_history) ? candidate.sdg_data_version_history : [];

const migrateApprovedRecords = (candidate: any): ApprovedSdgDataRecord[] =>
  Array.isArray(candidate?.approved_sdg_data) ? candidate.approved_sdg_data : [];

const migrateSourceLog = (candidate: any): SourceLogRecord[] =>
  Array.isArray(candidate?.source_log) ? candidate.source_log : [];

const migrateAuditLog = (candidate: any): AuditLogRecord[] =>
  Array.isArray(candidate?.audit_log) ? candidate.audit_log : [];

const normalizeDb = (candidate: Partial<AdminDatabase> | Record<string, unknown> | null | undefined): AdminDatabase => ({
  version: Number(candidate?.version ?? 2),
  nisr_reports: migrateLegacyReports(candidate),
  nisr_extracted_tables: migrateLegacyTables(candidate),
  nisr_extracted_values: migrateLegacyValues(candidate),
  sdg_indicator_mapping_rules: migrateRules(candidate),
  sdg_data_approvals: migrateApprovals(candidate),
  sdg_data_version_history: migrateVersionHistory(candidate),
  approved_sdg_data: migrateApprovedRecords(candidate),
  source_log: migrateSourceLog(candidate),
  audit_log: migrateAuditLog(candidate)
});

export const ensureAdminStorage = (): void => {
  fs.mkdirSync(path.dirname(ADMIN_DB_PATH), { recursive: true });
  fs.mkdirSync(ADMIN_EXTRACTED_JSON_DIR, { recursive: true });
  fs.mkdirSync(REPORT_UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_APPROVED_DATA_DIR, { recursive: true });

  if (!fs.existsSync(ADMIN_DB_PATH)) {
    fs.writeFileSync(ADMIN_DB_PATH, `${JSON.stringify(cloneDefaultDb(), null, 2)}\n`, 'utf-8');
  }
};

export const readAdminDb = (): AdminDatabase => {
  ensureAdminStorage();
  try {
    const raw = fs.readFileSync(ADMIN_DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AdminDatabase>;
    return normalizeDb(parsed);
  } catch {
    return cloneDefaultDb();
  }
};

export const writeAdminDb = (db: AdminDatabase): void => {
  ensureAdminStorage();
  fs.writeFileSync(ADMIN_DB_PATH, `${JSON.stringify(db, null, 2)}\n`, 'utf-8');
};

export const updateAdminDb = <T>(mutator: (db: AdminDatabase) => T): T => {
  const db = readAdminDb();
  const result = mutator(db);
  writeAdminDb(db);
  return result;
};

export const updateAdminDbAsync = async <T>(mutator: (db: AdminDatabase) => Promise<T>): Promise<T> => {
  const db = readAdminDb();
  const result = await mutator(db);
  writeAdminDb(db);
  return result;
};

export const createId = (prefix: string): string => {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${randomPart}`;
};

export const appendAuditLog = (
  db: AdminDatabase,
  row: Omit<AuditLogRecord, 'id' | 'created_at'>
): AuditLogRecord => {
  const created: AuditLogRecord = {
    id: createId('audit'),
    created_at: new Date().toISOString(),
    ...row
  };
  db.audit_log.unshift(created);
  if (db.audit_log.length > 5000) {
    db.audit_log = db.audit_log.slice(0, 5000);
  }
  return created;
};
