// Admin extraction runner.
// It triggers the FastAPI backend to process one uploaded report against the
// metadata mapping workbook and then links to debug/review screens.
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { NisrAdminLayout } from '../../../components/admin/NisrAdminLayout';
import { StatusBadge } from '../../../components/admin/StatusBadge';
import { AutomationReport, ExtractionRunResponse, nisrAutomationApi } from '../../../lib/nisrAutomationApi';

export default function NisrExtractPage(): JSX.Element {
  const [reports, setReports] = useState<AutomationReport[]>([]);
  const [reportId, setReportId] = useState('');
  const [progressMessage, setProgressMessage] = useState('Ready to run extraction.');
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<ExtractionRunResponse | null>(null);

  const loadReports = useCallback(async (): Promise<void> => {
    const payload = await nisrAutomationApi.getReports();
    setReports(payload);
    setReportId((currentReportId) => {
      if (!payload.length) {
        return '';
      }
      return currentReportId && payload.some((report) => report.report_id === currentReportId) ? currentReportId : payload[0].report_id;
    });
  }, []);

  useEffect(() => {
    void loadReports().catch((loadError) => setProgressMessage(loadError instanceof Error ? loadError.message : 'Failed to load reports.'));
  }, [loadReports]);

  const selectedReport = useMemo(() => reports.find((report) => report.report_id === reportId) || null, [reportId, reports]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!reportId) {
      return;
    }

    setBusy(true);
    setProgressMessage('Extraction is running. The system is matching workbook metadata against the uploaded report.');
    try {
      const payload = await nisrAutomationApi.runExtraction(reportId);
      setLastRun(payload);
      setProgressMessage(
        `Extraction finished. Checked ${payload.total_mapping_rows_checked} mapping row(s), created ${payload.proposed_updates} proposed update(s), and found ${payload.needs_review} item(s) that need review.`
      );
      await loadReports();
    } catch (error) {
      setProgressMessage(error instanceof Error ? error.message : 'Extraction failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <NisrAdminLayout
      title="Extract Data"
      description="Run metadata-driven extraction against an uploaded report. The system uses the control workbook mapping sheet as the source of truth instead of relying on indicator names only."
    >
      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <form className="panel p-5" onSubmit={onSubmit}>
          <h2 className="text-lg font-semibold text-slate-900">Run extraction</h2>
          <div className="mt-4 space-y-4 text-sm">
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">Report</span>
              <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={reportId} onChange={(event) => setReportId(event.target.value)}>
                {reports.map((report) => (
                  <option key={report.report_id} value={report.report_id}>
                    {report.report_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" disabled={busy || !reportId} className="mt-5 rounded-full bg-rwGreen px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? 'Extracting...' : 'Run extraction'}
          </button>
        </form>

        <div className="space-y-6">
          <div className="panel p-5">
            <h2 className="text-lg font-semibold text-slate-900">Extraction progress</h2>
            <p className="mt-3 text-sm text-slate-600">{progressMessage}</p>
            {lastRun ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={`/admin/nisr-automation/results?report_id=${encodeURIComponent(lastRun.report_id)}`} className="rounded-full bg-rwBlue px-4 py-2 text-sm font-semibold text-white">
                  Open extraction results
                </Link>
                <a
                  href={nisrAutomationApi.exportUrl('extraction-debug-report', lastRun.report_id)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-white"
                >
                  Export debug report
                </a>
              </div>
            ) : null}
          </div>
          {lastRun ? (
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              <div className="panel p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checked</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{lastRun.total_mapping_rows_checked}</p>
              </div>
              <div className="panel p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extracted</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-700">{lastRun.extracted_values}</p>
              </div>
              <div className="panel p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Needs review</p>
                <p className="mt-2 text-2xl font-semibold text-amber-700">{lastRun.needs_review}</p>
              </div>
              <div className="panel p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Not found</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{lastRun.not_found}</p>
              </div>
              <div className="panel p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Missing mapping</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{lastRun.missing_mapping}</p>
              </div>
              <div className="panel p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Errors</p>
                <p className="mt-2 text-2xl font-semibold text-rose-700">{lastRun.errors}</p>
              </div>
            </div>
          ) : null}
          {selectedReport ? (
            <div className="panel p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{selectedReport.report_name}</h3>
                  <p className="text-sm text-slate-500">
                    {selectedReport.publication_year ?? 'Unknown year'} • {selectedReport.original_file_name || 'Stored locally'}
                  </p>
                </div>
                <StatusBadge status={selectedReport.status} />
              </div>
              <dl className="mt-4 grid gap-4 text-sm text-slate-600 md:grid-cols-2">
                <div>
                  <dt className="font-semibold text-slate-800">Report family</dt>
                  <dd>{selectedReport.report_family || 'Not provided'}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-800">Source institution</dt>
                  <dd>{selectedReport.source_institution || 'NISR'}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-800">Report type</dt>
                  <dd>{selectedReport.report_type}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-800">Extraction summary</dt>
                  <dd>{selectedReport.extraction_summary || 'No extraction summary yet'}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
      </div>
    </NisrAdminLayout>
  );
}
