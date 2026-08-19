// File paths and constants for the legacy/local admin API layer.
import path from 'path';

export const ADMIN_DB_PATH = path.join(process.cwd(), 'data', 'admin', 'ingestion_db.json');
export const ADMIN_EXTRACTED_JSON_DIR = path.join(process.cwd(), 'data', 'admin', 'extracted_json');
export const REPORT_UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'reports');
export const NISR_EXTRACTION_SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'extract_nisr_report.py');

export const PUBLIC_APPROVED_DATA_DIR = path.join(process.cwd(), 'data', 'approved');
export const PUBLIC_APPROVED_WORKBOOK_PATH = path.join(PUBLIC_APPROVED_DATA_DIR, '2025_RW-SDG_Data.xlsx');
export const MAIN_WORKBOOK_PATH = path.join(process.cwd(), 'data', '2025_RW-SDG_Data.xlsx');

export const ADMIN_COOKIE_NAME = 'admin_auth';
export const ADMIN_SESSION_DURATION_SECONDS = 60 * 60 * 10;

export const ACCEPTED_FILE_EXTENSIONS = ['.pdf', '.xls', '.xlsx', '.xlsm', '.csv'] as const;
export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'text/csv',
  'application/csv'
] as const;
