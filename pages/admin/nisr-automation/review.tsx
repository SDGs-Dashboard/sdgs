import { useCallback, useEffect, useMemo, useState } from 'react';

import { NisrAdminLayout } from '../../../components/admin/NisrAdminLayout';
import { StatusBadge } from '../../../components/admin/StatusBadge';
import { AutomationReport, ProposedUpdate, ProposedUpdateEditPayload, nisrAutomationApi } from '../../../lib/nisrAutomationApi';

// Keep editable values as strings in the UI so admins can clear a value, type a
// correction, and save review notes before the payload is converted to numbers.
type EditableState = {
  new_value: string;
  year: string;
  table_or_sheet: string;
  evidence_page: string;
  extraction_note: string;
  reviewer_comment: string;
};

const toEditableState = (row: ProposedUpdate): EditableState => ({
  new_value: row.new_value !== null && row.new_value !== undefined ? String(row.new_value) : '',
  year: String(row.year),
  table_or_sheet: row.table_or_sheet || '',
  evidence_page: row.evidence_page || '',
  extraction_note: row.extraction_note || '',
  reviewer_comment: row.reviewer_comment || ''
});

// Confidence bands match the Extraction Results page: 75%+ high, 50-74% medium,
// below 50% low. Approval still depends on backend validation and admin review.
const confidencePercent = (row: ProposedUpdate): number | null => {
  if (row.confidence_score === null || row.confidence_score === undefined || Number.isNaN(row.confidence_score)) {
    return null;
  }
  return Math.round(Math.max(0, Math.min(1, row.confidence_score)) * 100);
};

const confidenceStyle = (percent: number | null): { label: string; badgeClass: string; barClass: string; textClass: string } => {
  if (percent === null) {
    return {
      label: 'No score',
      badgeClass: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
      barClass: 'bg-slate-300',
      textClass: 'text-slate-700'
    };
  }
  if (percent >= 75) {
    return {
      label: 'High confidence',
      badgeClass: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
      barClass: 'bg-emerald-500',
      textClass: 'text-emerald-700'
    };
  }
  if (percent >= 50) {
    return {
      label: 'Medium confidence',
      badgeClass: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
      barClass: 'bg-amber-500',
      textClass: 'text-amber-700'
    };
  }
  return {
    label: 'Low confidence',
    badgeClass: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200',
    barClass: 'bg-rose-500',
    textClass: 'text-rose-700'
  };
};

const cleanDimension = (value?: string | null): string => {
  const normalized = String(value || '').trim();
  return ['_T', 'T', 'Total', 'None', 'nan', 'N/A', 'All'].includes(normalized) ? '' : normalized;
};

const targetObservationLabel = (row: ProposedUpdate): string => {
  const parts = [
    ['Province', cleanDimension(row.province)],
    ['District', cleanDimension(row.district)],
    ['Urbanization', cleanDimension(row.urbanization)],
    ['Education', cleanDimension(row.education)],
    ['Occupation', cleanDimension(row.occupation)],
    ['Age', cleanDimension(row.age)],
    ['Sex', cleanDimension(row.sex)]
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`);
  const area = cleanDimension(row.ref_area);
  if (area && !['RW', 'RWA', 'Rwanda'].includes(area)) {
    parts.unshift(`Area: ${area}`);
  }
  return parts.length ? parts.join(' | ') : 'National / total';
};

export default function NisrReviewPage(): JSX.Element {
  const [reports, setReports] = useState<AutomationReport[]>([]);
  const [updates, setUpdates] = useState<ProposedUpdate[]>([]);
  const [reportId, setReportId] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUpdateId, setBusyUpdateId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditableState | null>(null);

  // Load reports and proposed updates together so the report selector and queue
  // stay in sync after upload, extraction, approval, rejection, or correction.
  const loadData = useCallback(async (nextReportId = ''): Promise<void> => {
    setError(null);
    const [reportsPayload, updatesPayload] = await Promise.all([
      nisrAutomationApi.getReports(),
      nisrAutomationApi.getProposedUpdates(nextReportId ? { report_id: nextReportId } : undefined)
    ]);
    setReports(reportsPayload);
    setUpdates(updatesPayload);
    if (!reportsPayload.length) {
      setReportId('');
      return;
    }
    if (!nextReportId || !reportsPayload.some((report) => report.report_id === nextReportId)) {
      setReportId(reportsPayload[0].report_id);
    }
  }, []);

  useEffect(() => {
    void loadData().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load review queue.'));
  }, [loadData]);

  useEffect(() => {
    if (reportId) {
      void loadData(reportId).catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to refresh review queue.'));
    }
  }, [loadData, reportId]);

  const selectedReport = useMemo(() => reports.find((report) => report.report_id === reportId) || null, [reportId, reports]);

  // Duplicate detection is intentionally UI-visible before approval, because the
  // backend must not overwrite an approved observation without staff confirmation.
  const duplicateKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of updates) {
      const key = `${row.indicator}|${row.series_code || ''}|${row.year}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [updates]);

  // Review filters are client-side because the page needs fast switching between
  // open, needs-review, approved, and all statuses from the same loaded report.
  const filteredUpdates = useMemo(() => {
    if (statusFilter === 'all') {
      return updates;
    }
    if (statusFilter === 'approved') {
      return updates.filter((row) => row.status === 'Approved' || row.status === 'Corrected and Approved');
    }
    if (statusFilter === 'needs-review') {
      return updates.filter((row) => row.status === 'Needs Review');
    }
    return updates.filter((row) => row.status !== 'Approved' && row.status !== 'Corrected and Approved' && row.status !== 'Rejected');
  }, [statusFilter, updates]);

  const counts = useMemo(
    () => ({
      pending: updates.filter((row) => row.status === 'Pending Review' || row.status === 'Ready' || row.status === 'Needs Review').length,
      approved: updates.filter((row) => row.status === 'Approved' || row.status === 'Corrected and Approved').length,
      lowConfidence: updates.filter((row) => (row.confidence_score || 0) < 0.9).length
    }),
    [updates]
  );

  const startEdit = (row: ProposedUpdate): void => {
    setEditingId(row.update_id);
    setEditForm(toEditableState(row));
    setMessage(null);
  };

  const startApprovalCorrection = (row: ProposedUpdate): void => {
    startEdit(row);
    setMessage(`Enter the admin-confirmed value for ${row.update_id}, then click Correct & Approve.`);
  };

  const cancelEdit = (): void => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEdit = async (row: ProposedUpdate): Promise<void> => {
    if (!editForm) {
      return;
    }
    setBusyUpdateId(row.update_id);
    setMessage(null);
    try {
      const payload: ProposedUpdateEditPayload = {
        new_value: editForm.new_value.trim() === '' ? null : Number(editForm.new_value),
        year: Number(editForm.year),
        table_or_sheet: editForm.table_or_sheet || null,
        evidence_page: editForm.evidence_page || null,
        extraction_note: editForm.extraction_note || null,
        reviewer_comment: editForm.reviewer_comment || null
      };
      await nisrAutomationApi.updateProposedUpdate(row.update_id, payload);
      setMessage(`Saved changes for ${row.update_id}.`);
      await loadData(reportId);
      cancelEdit();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save review changes.');
    } finally {
      setBusyUpdateId(null);
    }
  };

  const reviewUpdate = async (
    updateId: string,
    action: 'approve' | 'correct_approve' | 'reject' | 'needs_review' | 'return_for_review',
    comment?: string
  ): Promise<void> => {
    setBusyUpdateId(updateId);
    setMessage(null);
    try {
      const payload = await nisrAutomationApi.reviewUpdate(updateId, action, 'admin', comment);
      setMessage(payload.message);
      await loadData(reportId);
      if (editingId === updateId) {
        cancelEdit();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Review action failed.');
    } finally {
      setBusyUpdateId(null);
    }
  };

  const correctAndApprove = async (row: ProposedUpdate): Promise<void> => {
    if (!editForm) {
      return;
    }
    if (editForm.new_value.trim() === '' || !Number.isFinite(Number(editForm.new_value))) {
      setError('Enter the admin-confirmed numeric value before approving.');
      return;
    }
    setBusyUpdateId(row.update_id);
    setMessage(null);
    try {
      const payload: ProposedUpdateEditPayload = {
        new_value: editForm.new_value.trim() === '' ? null : Number(editForm.new_value),
        year: Number(editForm.year),
        table_or_sheet: editForm.table_or_sheet || null,
        evidence_page: editForm.evidence_page || null,
        extraction_note: editForm.extraction_note || null,
        reviewer_comment: editForm.reviewer_comment || null
      };
      await nisrAutomationApi.updateProposedUpdate(row.update_id, payload);
      const reviewPayload = await nisrAutomationApi.reviewUpdate(row.update_id, 'correct_approve', 'admin', editForm.reviewer_comment || 'Corrected and approved by admin');
      setMessage(reviewPayload.message);
      await loadData(reportId);
      cancelEdit();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Correct and approve failed.');
    } finally {
      setBusyUpdateId(null);
    }
  };

  const validationWarnings = (row: ProposedUpdate): string[] => {
    if (!row.validation_warnings) {
      return [];
    }
    try {
      const parsed = JSON.parse(row.validation_warnings) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [row.validation_warnings];
    } catch {
      return [row.validation_warnings];
    }
  };

  return (
    <NisrAdminLayout
      title="Review Proposed Updates"
      description="Edit extracted values, check warnings, and approve only after the source evidence, year, and indicator mapping look correct."
    >
      <div className="space-y-6">
        <div className="panel p-5">
          <div className="grid gap-4 md:grid-cols-5">
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block font-medium text-slate-700">Report</span>
              <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={reportId} onChange={(event) => setReportId(event.target.value)}>
                <option value="">All reports</option>
                {reports.map((report) => (
                  <option key={report.report_id} value={report.report_id}>
                    {report.report_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">View</span>
              <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="open">Open review queue</option>
                <option value="needs-review">Needs review only</option>
                <option value="approved">Approved only</option>
                <option value="all">All statuses</option>
              </select>
            </label>
            <div className="rounded-2xl bg-slate-50 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Waiting review</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{counts.pending}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Low confidence</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{counts.lowConfidence}</p>
            </div>
          </div>
          {selectedReport ? (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">{selectedReport.report_name}</p>
              <p className="mt-1">{selectedReport.extraction_summary || 'No extraction summary yet.'}</p>
            </div>
          ) : null}
          {message ? <p className="mt-4 text-sm text-slate-700">{message}</p> : null}
          {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        </div>

        <div className="panel overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/70 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Review queue</h2>
              <p className="text-sm text-slate-500">{filteredUpdates.length} proposed update(s) ready for staff decision.</p>
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
              Approve only after checking value, year, and evidence
            </div>
          </div>

          <div className="space-y-4 bg-slate-50/40 p-4">
            {filteredUpdates.map((row) => {
              const key = `${row.indicator}|${row.series_code || ''}|${row.year}`;
              const hasDuplicate = (duplicateKeys.get(key) || 0) > 1;
              const changeRatio =
                row.old_value !== null && row.old_value !== undefined && row.old_value !== 0 && row.new_value !== null && row.new_value !== undefined
                  ? Math.abs((row.new_value - row.old_value) / row.old_value)
                  : null;
              const largeChange = changeRatio !== null && changeRatio >= 0.25;
              const isEditing = editingId === row.update_id && editForm !== null;
              const rowWarnings = validationWarnings(row);
              const percent = confidencePercent(row);
              const confidence = confidenceStyle(percent);

              // Merge backend validation warnings with UI-only review cues so
              // reviewers see all risk signals in one compact area.
              const visibleWarnings = [
                ...(hasDuplicate ? ['Duplicate candidate'] : []),
                ...(largeChange ? ['Large change'] : []),
                ...((row.confidence_score || 0) < 0.8 ? ['Low confidence'] : []),
                ...((row.new_value === null || row.new_value === undefined) && !isEditing ? ['Empty value'] : []),
                ...rowWarnings
              ];

              return (
                <article key={row.update_id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-rwBlue/30 hover:shadow-lg">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={row.status} />
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${confidence.badgeClass}`}>
                          {percent !== null ? `${percent}%` : 'No score'} · {confidence.label}
                        </span>
                        {row.mapping_status ? (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{row.mapping_status}</span>
                        ) : null}
                      </div>
                      <h3 className="mt-3 text-xl font-semibold text-rwNavy">{row.indicator}</h3>
                      <p className="mt-1 text-sm font-medium text-slate-500">{row.series_code || row.mapping_id}</p>
                      <p className="mt-2 inline-flex max-w-full rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-100">
                        Target: {targetObservationLabel(row)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            disabled={busyUpdateId === row.update_id}
                            onClick={() => void saveEdit(row)}
                            className="rounded-full bg-rwBlue px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                          >
                            {busyUpdateId === row.update_id ? 'Saving...' : 'Save draft'}
                          </button>
                          <button
                            type="button"
                            disabled={busyUpdateId === row.update_id}
                            onClick={() => void correctAndApprove(row)}
                            className="rounded-full bg-rwGreen px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                          >
                            Correct & Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyUpdateId === row.update_id}
                            onClick={cancelEdit}
                            className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busyUpdateId === row.update_id}
                            onClick={() => startEdit(row)}
                            className="rounded-full bg-rwBlue px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busyUpdateId === row.update_id}
                            onClick={() =>
                              row.new_value === null || row.new_value === undefined
                                ? startApprovalCorrection(row)
                                : void reviewUpdate(row.update_id, 'approve', row.reviewer_comment || row.extraction_note || undefined)
                            }
                            className="rounded-full bg-rwGreen px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                          >
                            {busyUpdateId === row.update_id ? 'Working...' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            disabled={busyUpdateId === row.update_id}
                            onClick={() => void reviewUpdate(row.update_id, 'return_for_review', 'Returned for NISR/manual review')}
                            className="rounded-full bg-rwYellow px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm disabled:opacity-60"
                          >
                            Return
                          </button>
                          <button
                            type="button"
                            disabled={busyUpdateId === row.update_id}
                            onClick={() => void reviewUpdate(row.update_id, 'reject', 'Rejected during admin review')}
                            className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 lg:grid-cols-[1.1fr_1.1fr_1fr]">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Year</p>
                        {isEditing ? (
                          <input
                            value={editForm.year}
                            onChange={(event) => setEditForm({ ...editForm, year: event.target.value })}
                            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          />
                        ) : (
                          <p className="mt-1 text-2xl font-semibold text-slate-900">{row.year}</p>
                        )}
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Old value</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-900">{row.old_value ?? '-'}</p>
                      </div>
                      <div className="rounded-2xl border border-rwBlue/20 bg-rwBlue/5 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-rwBlue">New value</p>
                        {isEditing ? (
                          <input
                            value={editForm.new_value}
                            onChange={(event) => setEditForm({ ...editForm, new_value: event.target.value })}
                            className="mt-2 w-full rounded-xl border border-rwBlue/20 px-3 py-2 text-sm font-semibold"
                          />
                        ) : (
                          <p className="mt-1 text-2xl font-semibold text-rwNavy">{row.new_value ?? '-'}</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confidence</p>
                        <p className={`text-sm font-semibold ${confidence.textClass}`}>{percent !== null ? `${percent}%` : '-'}</p>
                      </div>
                      <div className="mt-3 h-2.5 rounded-full bg-slate-100">
                        <div className={`h-2.5 rounded-full ${confidence.barClass}`} style={{ width: `${percent || 0}%` }} />
                      </div>
                      <p className="mt-2 text-sm font-medium text-slate-700">{row.confidence_label || confidence.label}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.extraction_method || 'No extraction method recorded.'}</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Warnings</p>
                      {visibleWarnings.length ? (
                        <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1">
                          {visibleWarnings.map((warning) => (
                            <span key={warning} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-100">
                              {warning}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-emerald-700">No validation warnings.</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source</p>
                      <p className="mt-2 break-words text-sm font-semibold text-slate-800">{row.source_report || '-'}</p>
                      <p className="mt-1 text-sm text-slate-600">{targetObservationLabel(row)}</p>
                      {isEditing ? (
                        <input
                          value={editForm.table_or_sheet}
                          onChange={(event) => setEditForm({ ...editForm, table_or_sheet: event.target.value })}
                          className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          placeholder="Table / sheet"
                        />
                      ) : (
                        <p className="mt-1 text-sm text-slate-500">{row.table_or_sheet || '-'}</p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</p>
                      {isEditing ? (
                        <div className="mt-3 grid gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
                          <input
                            value={editForm.evidence_page}
                            onChange={(event) => setEditForm({ ...editForm, evidence_page: event.target.value })}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Page / sheet"
                          />
                          <textarea
                            value={editForm.reviewer_comment}
                            onChange={(event) => setEditForm({ ...editForm, reviewer_comment: event.target.value })}
                            className="min-h-20 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Reviewer note"
                          />
                        </div>
                      ) : (
                        <>
                          <p className="mt-2 break-words text-sm font-medium text-slate-800">{row.source_evidence || row.evidence_page || '-'}</p>
                          <p className="mt-1 break-words text-sm text-slate-500">{row.matched_cell || row.reviewer_comment || ''}</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extraction note</p>
                    {isEditing ? (
                      <textarea
                        value={editForm.extraction_note}
                        onChange={(event) => setEditForm({ ...editForm, extraction_note: event.target.value })}
                        className="mt-3 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-slate-600">{row.extraction_note || 'No extraction note recorded.'}</p>
                    )}
                  </div>
                </article>
              );
            })}

            {!filteredUpdates.length ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
                No proposed updates are available for this filter.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </NisrAdminLayout>
  );
}
