const DEFAULT_API_BASE = process.env.NEXT_PUBLIC_NISR_AUTOMATION_API_BASE?.trim() || 'http://127.0.0.1:8000/api';
const API_BASE_STORAGE_KEY = 'nisrAutomationApiBase';

const normalizeApiBase = (value: string): string => value.trim().replace(/\/+$/, '');

const getApiBases = (): string[] => {
  const bases = new Set<string>();

  if (typeof window !== 'undefined') {
    const storedBase = window.localStorage.getItem(API_BASE_STORAGE_KEY)?.trim();
    if (storedBase) {
      bases.add(normalizeApiBase(storedBase));
    }
  }

  bases.add(normalizeApiBase(DEFAULT_API_BASE));

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol || 'http:';
    const hostname = window.location.hostname || '127.0.0.1';
    bases.add(`${protocol}//${hostname}:8000/api`);
    bases.add('http://127.0.0.1:8000/api');
    bases.add('http://localhost:8000/api');
  }

  return Array.from(bases);
};

const getPrimaryApiBase = (): string => getApiBases()[0] || normalizeApiBase(DEFAULT_API_BASE);

const backendUnavailableMessage = (): string => {
  const triedBases = getApiBases().join(', ');
  return [
    'NISR automation backend is not reachable.',
    'GitHub Pages is static, so upload, extraction, review, approval, and exports need the FastAPI backend running separately.',
    'For local testing, start the backend with `cd backend && uvicorn app.main:app --reload`, then use `http://127.0.0.1:8000/api` as the Backend API URL on the admin login page.',
    'For live testing, deploy the FastAPI backend on an HTTPS host and enter that `/api` URL on the admin login page.',
    `Tried: ${triedBases}.`
  ].join(' ');
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let lastNetworkError: Error | null = null;

  for (const base of getApiBases()) {
    try {
      const response = await fetch(`${base}${path}`, {
        credentials: 'include',
        ...init
      });
      if (!response.ok) {
        const text = await response.text();
        let message = text || `Request failed with ${response.status}`;
        try {
          const payload = JSON.parse(text) as { detail?: string; error?: string };
          message = payload.detail || payload.error || message;
        } catch {
          // Keep the raw response text.
        }
        if (response.status === 401) {
          message = `${message} Sign in at /admin/login, then retry.`;
        }
        throw new Error(message);
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof TypeError) {
        lastNetworkError = error;
        continue;
      }
      throw error;
    }
  }

  throw new Error(lastNetworkError ? backendUnavailableMessage() : 'Failed to reach the NISR automation backend.');
}

export interface AutomationSummary {
  nisr_indicators: number;
  missing_values: number;
  proposed_updates_waiting_review: number;
  approved_updates: number;
  reports_processed: number;
  extraction_success_rate: number;
}

export interface AutomationReport {
  report_id: string;
  report_name: string;
  report_family?: string | null;
  report_type: string;
  source_institution?: string | null;
  publication_year?: number | null;
  file_path?: string | null;
  original_file_name?: string | null;
  upload_date: string;
  status: string;
  extraction_summary?: string | null;
}

export interface ProposedUpdate {
  update_id: string;
  mapping_id: string;
  indicator: string;
  series_code?: string | null;
  year: number;
  old_value?: number | null;
  new_value?: number | null;
  difference?: number | null;
  unit_code?: string | null;
  source_report?: string | null;
  source_report_id?: string | null;
  table_or_sheet?: string | null;
  evidence_page?: string | null;
  extraction_date: string;
  status: string;
  reviewer_comment?: string | null;
  confidence_score?: number | null;
  confidence_label?: string | null;
  extraction_method?: string | null;
  extraction_note?: string | null;
  source_evidence?: string | null;
  matched_cell?: string | null;
  source_period?: string | null;
  publication_year?: number | null;
  dashboard_year?: number | null;
  mapping_status?: string | null;
  mapping_type?: string | null;
  validation_warnings?: string | null;
  source_year?: number | null;
}

export interface ProposedUpdateEditPayload {
  new_value?: number | null;
  year?: number;
  table_or_sheet?: string | null;
  evidence_page?: string | null;
  extraction_note?: string | null;
  reviewer_comment?: string | null;
}

export interface ExtractionRunResponse {
  report_id: string;
  report_status: string;
  extracted_tables: number;
  proposed_updates: number;
  total_mapping_rows_checked: number;
  extracted_values: number;
  needs_review: number;
  not_found: number;
  missing_mapping: number;
  errors: number;
  message: string;
}

export interface ExtractionResult {
  id: number;
  report_id: string;
  mapping_id: string;
  indicator: string;
  series_code?: string | null;
  expected_report?: string | null;
  expected_table?: string | null;
  expected_row?: string | null;
  expected_column?: string | null;
  status: 'extracted' | 'not_found' | 'missing_mapping' | 'ambiguous_match' | 'error';
  reason: string;
  closest_matched_row?: string | null;
  closest_matched_column?: string | null;
  confidence_score?: number | null;
  source_sheet_page?: string | null;
  extracted_value?: number | null;
  matched_table?: string | null;
  matched_cell?: string | null;
  debug_message?: string | null;
  proposed_update_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExtractionResultsSummary {
  total_mapping_rows_checked: number;
  extracted: number;
  needs_review: number;
  not_found: number;
  missing_mapping: number;
  errors: number;
}

export interface ApprovedUpdate {
  id: number;
  proposed_update_id: string;
  mapping_id: string;
  indicator: string;
  series_code?: string | null;
  year: number;
  old_value?: number | null;
  new_value?: number | null;
  unit_code?: string | null;
  source_report?: string | null;
  table_or_sheet?: string | null;
  evidence_page?: string | null;
  approved_by: string;
  approved_at: string;
  source_evidence?: string | null;
  source_period?: string | null;
  publication_year?: number | null;
  dashboard_year?: number | null;
  mapping_status?: string | null;
  mapping_type?: string | null;
  validation_warnings?: string | null;
  approval_action?: string | null;
}

export interface AuditLogEntry {
  id: number;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value?: string | null;
  new_value?: string | null;
  source_file?: string | null;
  source_evidence?: string | null;
  created_at: string;
  details_json?: string | null;
}

export interface VersionHistoryEntry {
  id: number;
  proposed_update_id?: string | null;
  dashboard_data_id?: number | null;
  indicator: string;
  series_code?: string | null;
  year: number;
  old_value?: number | null;
  new_value?: number | null;
  changed_by: string;
  approval_action: string;
  source_report?: string | null;
  source_evidence?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface AdminSessionResponse {
  authenticated: boolean;
  username?: string;
  expires_at?: number;
}

export const nisrAutomationApi = {
  apiBase: DEFAULT_API_BASE,
  getStoredApiBase: (): string => {
    if (typeof window === 'undefined') {
      return DEFAULT_API_BASE;
    }
    return window.localStorage.getItem(API_BASE_STORAGE_KEY) || DEFAULT_API_BASE;
  },
  setStoredApiBase: (value: string): void => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(API_BASE_STORAGE_KEY, normalizeApiBase(value));
    }
  },
  login: (username: string, password: string): Promise<{ ok: boolean; username: string }> =>
    request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    }),
  logout: (): Promise<{ ok: boolean }> =>
    request('/auth/logout', {
      method: 'POST'
    }),
  getSession: (): Promise<AdminSessionResponse> => request('/auth/session'),
  getSummary: (): Promise<AutomationSummary> => request('/reports/dashboard/summary'),
  getReports: (): Promise<AutomationReport[]> => request('/reports'),
  uploadReport: (formData: FormData): Promise<{ report: AutomationReport }> =>
    request('/upload', {
      method: 'POST',
      body: formData
    }),
  importControlWorkbook: (): Promise<unknown> =>
    request('/import-control-workbook', {
      method: 'POST'
    }),
  runExtraction: (reportId: string): Promise<ExtractionRunResponse> =>
    request(`/extraction/reports/${reportId}/run`, {
      method: 'POST'
    }),
  getExtractionResults: (params?: { report_id?: string; status?: ExtractionResult['status'] }): Promise<ExtractionResult[]> => {
    const search = new URLSearchParams();
    if (params?.report_id) search.set('report_id', params.report_id);
    if (params?.status) search.set('status', params.status);
    return request(`/extraction-results${search.toString() ? `?${search.toString()}` : ''}`);
  },
  getExtractionResultsSummary: (reportId: string): Promise<ExtractionResultsSummary> =>
    request(`/extraction-results/summary?report_id=${encodeURIComponent(reportId)}`),
  getProposedUpdates: (params?: { status?: string; report_id?: string }): Promise<ProposedUpdate[]> => {
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.report_id) search.set('report_id', params.report_id);
    return request(`/proposed-updates${search.toString() ? `?${search.toString()}` : ''}`);
  },
  updateProposedUpdate: (updateId: string, payload: ProposedUpdateEditPayload): Promise<ProposedUpdate> =>
    request(`/proposed-updates/${updateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
  reviewUpdate: (
    updateId: string,
    action: 'approve' | 'correct_approve' | 'reject' | 'needs_review' | 'return_for_review',
    reviewer = 'admin',
    comment?: string
  ): Promise<{ message: string }> =>
    request(`/approvals/${updateId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        reviewer,
        comment: comment || null
      })
    }),
  getApprovedUpdates: (): Promise<ApprovedUpdate[]> => request('/approved-updates'),
  getAuditLog: (): Promise<AuditLogEntry[]> => request('/audit-log'),
  getVersionHistory: (): Promise<VersionHistoryEntry[]> => request('/version-history'),
  exportUrl: (kind: 'dashboard' | 'proposed-updates' | 'approved-updates' | 'audit-log' | 'extraction-debug-report', reportId?: string): string => {
    const base = `${getPrimaryApiBase()}/exports/${kind}`;
    if (kind === 'extraction-debug-report' && reportId) {
      return `${base}?report_id=${encodeURIComponent(reportId)}`;
    }
    return base;
  }
};
