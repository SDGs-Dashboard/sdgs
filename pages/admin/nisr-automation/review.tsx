import { useCallback, useEffect, useMemo, useState } from 'react';

import { NisrAdminLayout } from '../../../components/admin/NisrAdminLayout';
import { StatusBadge } from '../../../components/admin/StatusBadge';
import { AutomationReport, ProposedUpdate, ProposedUpdateEditPayload, nisrAutomationApi } from '../../../lib/nisrAutomationApi';

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

  const duplicateKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of updates) {
      const key = `${row.indicator}|${row.series_code || ''}|${row.year}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [updates]);

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
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Review queue</h2>
          </div>
          <div className="overflow-auto">
            <table className="min-w-[1580px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">Indicator</th>
                  <th className="px-4 py-3">Year</th>
                  <th className="px-4 py-3">Old value</th>
                  <th className="px-4 py-3">New value</th>
                  <th className="px-4 py-3">Warnings</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Evidence</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
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

                  return (
                    <tr key={row.update_id} className="border-t border-slate-100 align-top text-slate-700">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{row.indicator}</div>
                        <div className="text-xs text-slate-500">{row.series_code || row.mapping_id}</div>
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            value={editForm.year}
                            onChange={(event) => setEditForm({ ...editForm, year: event.target.value })}
                            className="w-24 rounded-xl border border-slate-200 px-3 py-2"
                          />
                        ) : (
                          row.year
                        )}
                      </td>
                      <td className="px-4 py-3">{row.old_value ?? '-'}</td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            value={editForm.new_value}
                            onChange={(event) => setEditForm({ ...editForm, new_value: event.target.value })}
                            className="w-28 rounded-xl border border-slate-200 px-3 py-2"
                          />
                        ) : (
                          row.new_value ?? '-'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex max-w-xs flex-wrap gap-2">
                          {hasDuplicate ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Duplicate candidate</span> : null}
                          {largeChange ? <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">Large change</span> : null}
                          {(row.confidence_score || 0) < 0.8 ? (
                            <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">Low confidence</span>
                          ) : null}
                          {(row.new_value === null || row.new_value === undefined) && !isEditing ? (
                            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">Empty value</span>
                          ) : null}
                          {rowWarnings.map((warning) => (
                            <span key={warning} className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">
                              {warning}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{row.confidence_score !== null && row.confidence_score !== undefined ? `${Math.round(row.confidence_score * 100)}%` : '-'}</div>
                        <div className="text-xs text-slate-500">{row.confidence_label || ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{row.extraction_method || '-'}</div>
                        {isEditing ? (
                          <textarea
                            value={editForm.extraction_note}
                            onChange={(event) => setEditForm({ ...editForm, extraction_note: event.target.value })}
                            className="mt-2 min-h-24 w-72 rounded-xl border border-slate-200 px-3 py-2 text-xs"
                          />
                        ) : (
                          <div className="mt-1 max-w-xs text-xs text-slate-500">{row.extraction_note || ''}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div>{row.source_report || '-'}</div>
                        {isEditing ? (
                          <input
                            value={editForm.table_or_sheet}
                            onChange={(event) => setEditForm({ ...editForm, table_or_sheet: event.target.value })}
                            className="mt-2 w-72 rounded-xl border border-slate-200 px-3 py-2 text-xs"
                            placeholder="Table / sheet"
                          />
                        ) : (
                          <div className="mt-1 text-xs text-slate-500">{row.table_or_sheet || '-'}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              value={editForm.evidence_page}
                              onChange={(event) => setEditForm({ ...editForm, evidence_page: event.target.value })}
                              className="w-40 rounded-xl border border-slate-200 px-3 py-2 text-xs"
                              placeholder="Page / sheet"
                            />
                            <textarea
                              value={editForm.reviewer_comment}
                              onChange={(event) => setEditForm({ ...editForm, reviewer_comment: event.target.value })}
                              className="min-h-20 w-72 rounded-xl border border-slate-200 px-3 py-2 text-xs"
                              placeholder="Reviewer note"
                            />
                          </div>
                        ) : (
                          <>
                            <div>{row.source_evidence || row.evidence_page || '-'}</div>
                            <div className="mt-1 text-xs text-slate-500">{row.matched_cell || row.reviewer_comment || ''}</div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                disabled={busyUpdateId === row.update_id}
                                onClick={() => void saveEdit(row)}
                                className="rounded-full bg-rwBlue px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                              >
                                {busyUpdateId === row.update_id ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                type="button"
                                disabled={busyUpdateId === row.update_id || editForm.new_value.trim() === ''}
                                onClick={() => void correctAndApprove(row)}
                                className="rounded-full bg-rwGreen px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                              >
                                Correct & Approve
                              </button>
                              <button
                                type="button"
                                disabled={busyUpdateId === row.update_id}
                                onClick={cancelEdit}
                                className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-60"
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
                                className="rounded-full bg-rwBlue px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={busyUpdateId === row.update_id || row.new_value === null || row.new_value === undefined}
                                onClick={() => void reviewUpdate(row.update_id, 'approve', row.reviewer_comment || row.extraction_note || undefined)}
                                className="rounded-full bg-rwGreen px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                              >
                                {busyUpdateId === row.update_id ? 'Working...' : 'Approve'}
                              </button>
                              <button
                                type="button"
                                disabled={busyUpdateId === row.update_id}
                                onClick={() => void reviewUpdate(row.update_id, 'return_for_review', 'Returned for NISR/manual review')}
                                className="rounded-full bg-rwYellow px-3 py-1.5 text-xs font-semibold text-slate-900 disabled:opacity-60"
                              >
                                Return for Review
                              </button>
                              <button
                                type="button"
                                disabled={busyUpdateId === row.update_id}
                                onClick={() => void reviewUpdate(row.update_id, 'reject', 'Rejected during admin review')}
                                className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-60"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!filteredUpdates.length ? (
                  <tr>
                    <td className="px-4 py-5 text-slate-500" colSpan={11}>
                      No proposed updates are available for this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </NisrAdminLayout>
  );
}
