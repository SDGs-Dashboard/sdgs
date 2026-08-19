// Admin approved-data screen.
// Shows values that have passed staff approval plus audit/version history exports.
import { useEffect, useMemo, useState } from 'react';

import { NisrAdminLayout } from '../../../components/admin/NisrAdminLayout';
import { ApprovedUpdate, AuditLogEntry, VersionHistoryEntry, nisrAutomationApi } from '../../../lib/nisrAutomationApi';

export default function ApprovedDataPage(): JSX.Element {
  const [rows, setRows] = useState<ApprovedUpdate[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [versionHistory, setVersionHistory] = useState<VersionHistoryEntry[]>([]);
  const [indicatorFilter, setIndicatorFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadData = async (): Promise<void> => {
    setError(null);
    const [approvedPayload, auditPayload, versionHistoryPayload] = await Promise.all([
      nisrAutomationApi.getApprovedUpdates(),
      nisrAutomationApi.getAuditLog(),
      nisrAutomationApi.getVersionHistory()
    ]);
    setRows(approvedPayload);
    setAuditLog(auditPayload);
    setVersionHistory(versionHistoryPayload);
  };

  useEffect(() => {
    void loadData().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load approved data.'));
  }, []);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (indicatorFilter && row.indicator !== indicatorFilter) {
          return false;
        }
        if (yearFilter && String(row.year) !== yearFilter) {
          return false;
        }
        return true;
      }),
    [rows, indicatorFilter, yearFilter]
  );

  const indicators = useMemo(() => Array.from(new Set(rows.map((row) => row.indicator))).sort(), [rows]);
  const years = useMemo(() => Array.from(new Set(rows.map((row) => String(row.year)))).sort(), [rows]);

  return (
    <NisrAdminLayout
      title="Approved Data"
      description="Only approved updates appear here. These are the values already written back into the SDG dashboard data and ready for export."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3">
          <a href={nisrAutomationApi.exportUrl('dashboard')} target="_blank" rel="noreferrer" className="rounded-full bg-rwGreen px-4 py-2 text-sm font-semibold text-white">
            Export updated dashboard
          </a>
          <a href={nisrAutomationApi.exportUrl('approved-updates')} target="_blank" rel="noreferrer" className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-white">
            Export approved updates
          </a>
          <a href={nisrAutomationApi.exportUrl('audit-log')} target="_blank" rel="noreferrer" className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-white">
            Export audit log
          </a>
        </div>

        <div className="panel p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={indicatorFilter} onChange={(event) => setIndicatorFilter(event.target.value)}>
              <option value="">All indicators</option>
              {indicators.map((indicator) => (
                <option key={indicator} value={indicator}>
                  {indicator}
                </option>
              ))}
            </select>
            <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
              <option value="">All years</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approved rows</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{filteredRows.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audit events</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{auditLog.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Version history</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{versionHistory.length}</p>
            </div>
          </div>
        </div>
        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <div className="panel overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Approved updates</h2>
          </div>
          <div className="overflow-auto">
            <table className="min-w-[1200px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">Indicator</th>
                  <th className="px-4 py-3">Series Code</th>
                  <th className="px-4 py-3">Year</th>
                  <th className="px-4 py-3">Old Value</th>
                  <th className="px-4 py-3">New Value</th>
                  <th className="px-4 py-3">Report</th>
                  <th className="px-4 py-3">Table / Sheet</th>
                  <th className="px-4 py-3">Approved By</th>
                  <th className="px-4 py-3">Approved At</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 text-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.indicator}</td>
                    <td className="px-4 py-3">{row.series_code || '-'}</td>
                    <td className="px-4 py-3">{row.year}</td>
                    <td className="px-4 py-3">{row.old_value ?? '-'}</td>
                    <td className="px-4 py-3">{row.new_value ?? '-'}</td>
                    <td className="px-4 py-3">{row.source_report || '-'}</td>
                    <td className="px-4 py-3">{row.table_or_sheet || '-'}</td>
                    <td className="px-4 py-3">{row.approved_by}</td>
                    <td className="px-4 py-3">{new Date(row.approved_at).toLocaleString('en-RW')}</td>
                  </tr>
                ))}
                {!filteredRows.length ? (
                  <tr>
                    <td className="px-4 py-5 text-slate-500" colSpan={9}>
                      No approved values match the current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Version history</h2>
          </div>
          <div className="overflow-auto">
            <table className="min-w-[1100px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Indicator</th>
                  <th className="px-4 py-3">Year</th>
                  <th className="px-4 py-3">Old Value</th>
                  <th className="px-4 py-3">New Value</th>
                  <th className="px-4 py-3">Changed By</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {versionHistory.slice(0, 20).map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-100 text-slate-700">
                    <td className="px-4 py-3">{new Date(entry.created_at).toLocaleString('en-RW')}</td>
                    <td className="px-4 py-3">{entry.indicator}{entry.series_code ? ` / ${entry.series_code}` : ''}</td>
                    <td className="px-4 py-3">{entry.year}</td>
                    <td className="px-4 py-3">{entry.old_value ?? '-'}</td>
                    <td className="px-4 py-3">{entry.new_value ?? '-'}</td>
                    <td className="px-4 py-3">{entry.changed_by}</td>
                    <td className="px-4 py-3">{entry.source_evidence || entry.source_report || '-'}</td>
                  </tr>
                ))}
                {!versionHistory.length ? (
                  <tr>
                    <td className="px-4 py-5 text-slate-500" colSpan={7}>
                      No version history entries are available yet.
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
