import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

import { NisrAdminLayout } from '../../../components/admin/NisrAdminLayout';
import {
  AutomationReport,
  ExtractionResult,
  ExtractionResultsSummary,
  nisrAutomationApi
} from '../../../lib/nisrAutomationApi';

const STATUS_OPTIONS: Array<{ value: 'all' | ExtractionResult['status']; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'extracted', label: 'Extracted' },
  { value: 'ambiguous_match', label: 'Needs Review' },
  { value: 'not_found', label: 'Not Found' },
  { value: 'missing_mapping', label: 'Missing Mapping' },
  { value: 'error', label: 'Errors' }
];

const statusLabel = (status: ExtractionResult['status']): string => {
  if (status === 'ambiguous_match') return 'Needs Review';
  if (status === 'missing_mapping') return 'Missing Mapping';
  if (status === 'not_found') return 'Not Found';
  if (status === 'error') return 'Error';
  return 'Extracted';
};

export default function NisrExtractionResultsPage(): JSX.Element {
  const router = useRouter();
  const [reports, setReports] = useState<AutomationReport[]>([]);
  const [reportId, setReportId] = useState('');
  const [status, setStatus] = useState<'all' | ExtractionResult['status']>('all');
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [summary, setSummary] = useState<ExtractionResultsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initialReportId = typeof router.query.report_id === 'string' ? router.query.report_id : '';
    const initialStatus = typeof router.query.status === 'string' ? (router.query.status as 'all' | ExtractionResult['status']) : 'all';
    if (initialReportId) setReportId(initialReportId);
    if (initialStatus) setStatus(initialStatus);
  }, [router.query.report_id, router.query.status]);

  useEffect(() => {
    void (async () => {
      const payload = await nisrAutomationApi.getReports();
      setReports(payload);
      if (!payload.length) {
        setReportId('');
        return;
      }
      if (!reportId || !payload.some((report) => report.report_id === reportId)) {
        setReportId(payload[0].report_id);
      }
    })().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load reports.'));
  }, [reportId]);

  useEffect(() => {
    if (!reportId) {
      return;
    }
    setLoading(true);
    setError(null);
    void (async () => {
      const [resultsPayload, summaryPayload] = await Promise.all([
        nisrAutomationApi.getExtractionResults({ report_id: reportId, status: status === 'all' ? undefined : status }),
        nisrAutomationApi.getExtractionResultsSummary(reportId)
      ]);
      setResults(resultsPayload);
      setSummary(summaryPayload);
    })()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load extraction results.'))
      .finally(() => setLoading(false));
  }, [reportId, status]);

  const selectedReport = useMemo(() => reports.find((report) => report.report_id === reportId) || null, [reportId, reports]);

  return (
    <NisrAdminLayout
      title="Extraction Results"
      description="Every mapping row is tracked here. Use this screen to see which indicators were extracted, which ones need review, and the exact reason when a mapped row was not found."
    >
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-[280px_200px_minmax(0,1fr)]">
          <label className="panel p-4 text-sm">
            <span className="mb-2 block font-semibold text-slate-800">Report</span>
            <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={reportId} onChange={(event) => setReportId(event.target.value)}>
              {reports.map((report) => (
                <option key={report.report_id} value={report.report_id}>
                  {report.report_name}
                </option>
              ))}
            </select>
          </label>
          <label className="panel p-4 text-sm">
            <span className="mb-2 block font-semibold text-slate-800">Status</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={status}
              onChange={(event) => setStatus(event.target.value as 'all' | ExtractionResult['status'])}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="panel flex flex-col justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">{selectedReport?.report_name || 'No report selected'}</p>
              <p className="mt-1 text-sm text-slate-500">{selectedReport?.extraction_summary || 'Run extraction to generate a full debug report.'}</p>
            </div>
            {reportId ? (
              <div className="mt-3 flex flex-wrap gap-3">
                <a
                  href={nisrAutomationApi.exportUrl('extraction-debug-report', reportId)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-rwBlue px-4 py-2 text-sm font-semibold text-white"
                >
                  Export debug report
                </a>
                <a href={`/admin/nisr-automation/review?report_id=${encodeURIComponent(reportId)}`} className="rounded-full bg-rwGreen px-4 py-2 text-sm font-semibold text-white">
                  Open proposed updates
                </a>
              </div>
            ) : null}
          </div>
        </div>

        {summary ? (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <div className="panel p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checked</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.total_mapping_rows_checked}</p>
            </div>
            <div className="panel p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extracted</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-700">{summary.extracted}</p>
            </div>
            <div className="panel p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Needs Review</p>
              <p className="mt-2 text-2xl font-semibold text-amber-700">{summary.needs_review}</p>
            </div>
            <div className="panel p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Not Found</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.not_found}</p>
            </div>
            <div className="panel p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Missing Mapping</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.missing_mapping}</p>
            </div>
            <div className="panel p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Errors</p>
              <p className="mt-2 text-2xl font-semibold text-rose-700">{summary.errors}</p>
            </div>
          </div>
        ) : null}

        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Mapping row results</h2>
              <p className="text-sm text-slate-500">{loading ? 'Loading results...' : `${results.length} row result(s) shown`}</p>
            </div>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">Indicator</th>
                  <th className="px-4 py-3">Expected table</th>
                  <th className="px-4 py-3">Expected row</th>
                  <th className="px-4 py-3">Expected column/year</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Closest match</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.id} className="border-t border-slate-100 align-top text-slate-700">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{result.indicator}</p>
                      <p className="text-xs text-slate-500">{result.series_code || result.mapping_id}</p>
                    </td>
                    <td className="px-4 py-3">{result.expected_table || '-'}</td>
                    <td className="px-4 py-3">{result.expected_row || '-'}</td>
                    <td className="px-4 py-3">{result.expected_column || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{statusLabel(result.status)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p>{result.reason}</p>
                      {result.debug_message ? <p className="mt-1 text-xs text-slate-500">{result.debug_message}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <p>{result.closest_matched_row || '-'}</p>
                      <p className="text-xs text-slate-500">{result.closest_matched_column || '-'}</p>
                    </td>
                    <td className="px-4 py-3">{typeof result.confidence_score === 'number' ? `${Math.round(result.confidence_score * 100)}%` : '-'}</td>
                    <td className="px-4 py-3">
                      <p>{result.source_sheet_page || '-'}</p>
                      <p className="text-xs text-slate-500">{result.matched_table || result.matched_cell || '-'}</p>
                    </td>
                  </tr>
                ))}
                {!loading && !results.length ? (
                  <tr>
                    <td className="px-4 py-5 text-slate-500" colSpan={9}>
                      No extraction results found for this filter yet.
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
