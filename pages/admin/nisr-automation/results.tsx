import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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

type ConfidenceBand = 'all' | 'high' | 'medium' | 'low' | 'none';

// UI-only classification for helping reviewers triage extracted values.
// Backend validation still decides whether a value is safe to propose/approve.
const CONFIDENCE_OPTIONS: Array<{ value: ConfidenceBand; label: string; description: string }> = [
  { value: 'all', label: 'All confidence', description: 'Show every result' },
  { value: 'high', label: 'High 75%+', description: 'Strong candidate' },
  { value: 'medium', label: 'Medium 50-74%', description: 'Review carefully' },
  { value: 'low', label: 'Low 1-49%', description: 'Weak match' },
  { value: 'none', label: 'No score', description: 'No confidence available' }
];

const confidencePercent = (score?: number | null): number | null => {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return null;
  }
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
};

const confidenceBand = (score?: number | null): Exclude<ConfidenceBand, 'all'> => {
  const percent = confidencePercent(score);
  if (percent === null) return 'none';
  if (percent >= 75) return 'high';
  if (percent >= 50) return 'medium';
  return 'low';
};

const confidenceMeta = (
  score?: number | null
): { label: string; helper: string; badgeClass: string; barClass: string; percent: number | null; band: Exclude<ConfidenceBand, 'all'> } => {
  const percent = confidencePercent(score);
  const band = confidenceBand(score);
  if (band === 'high') {
    return {
      label: 'High confidence',
      helper: '75% and above',
      badgeClass: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
      barClass: 'bg-emerald-500',
      percent,
      band
    };
  }
  if (band === 'medium') {
    return {
      label: 'Medium confidence',
      helper: '50% to 74%',
      badgeClass: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
      barClass: 'bg-amber-500',
      percent,
      band
    };
  }
  if (band === 'low') {
    return {
      label: 'Low confidence',
      helper: 'Below 50%',
      badgeClass: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200',
      barClass: 'bg-rose-500',
      percent,
      band
    };
  }
  return {
    label: 'No confidence score',
    helper: 'Needs manual check',
    badgeClass: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
    barClass: 'bg-slate-300',
    percent,
    band
  };
};

const targetObservationLabel = (result: ExtractionResult): string => result.dimension_summary || 'National / total';

const statusMeta = (
  status: ExtractionResult['status']
): { label: string; badgeClass: string; accentClass: string } => {
  if (status === 'extracted') {
    return {
      label: 'Extracted',
      badgeClass: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
      accentClass: 'border-l-emerald-500'
    };
  }
  if (status === 'ambiguous_match') {
    return {
      label: 'Needs Review',
      badgeClass: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
      accentClass: 'border-l-amber-500'
    };
  }
  if (status === 'not_found') {
    return {
      label: 'Not Found',
      badgeClass: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
      accentClass: 'border-l-slate-400'
    };
  }
  if (status === 'missing_mapping') {
    return {
      label: 'Missing Mapping',
      badgeClass: 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200',
      accentClass: 'border-l-indigo-500'
    };
  }
  return {
    label: 'Error',
    badgeClass: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200',
    accentClass: 'border-l-rose-500'
  };
};

const formatValue = (value?: number | null): string => (value === null || value === undefined ? '-' : String(value));

export default function NisrExtractionResultsPage(): JSX.Element {
  const router = useRouter();
  const [reports, setReports] = useState<AutomationReport[]>([]);
  const [reportId, setReportId] = useState('');
  const [status, setStatus] = useState<'all' | ExtractionResult['status']>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceBand>('all');
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

  // The backend filters by extraction status; confidence bands are calculated
  // here so reviewers can quickly focus on strong, weak, or unscored matches.
  const confidenceCounts = useMemo(
    () =>
      results.reduce(
        (counts, result) => {
          counts[confidenceBand(result.confidence_score)] += 1;
          return counts;
        },
        { high: 0, medium: 0, low: 0, none: 0 } as Record<Exclude<ConfidenceBand, 'all'>, number>
      ),
    [results]
  );
  const filteredResults = useMemo(
    () => (confidenceFilter === 'all' ? results : results.filter((result) => confidenceBand(result.confidence_score) === confidenceFilter)),
    [confidenceFilter, results]
  );

  // Status cards double as filters and as the extraction debug summary.
  const statusCards = summary
    ? [
        { value: 'all' as const, label: 'Checked', count: summary.total_mapping_rows_checked, helper: 'All mapping rows', className: 'text-slate-900' },
        { value: 'extracted' as const, label: 'Extracted', count: summary.extracted, helper: 'Candidate values found', className: 'text-emerald-700' },
        { value: 'ambiguous_match' as const, label: 'Needs Review', count: summary.needs_review, helper: 'Admin must verify', className: 'text-amber-700' },
        { value: 'not_found' as const, label: 'Not Found', count: summary.not_found, helper: 'Source not matched', className: 'text-slate-700' },
        { value: 'missing_mapping' as const, label: 'Missing Mapping', count: summary.missing_mapping, helper: 'Mapping incomplete', className: 'text-indigo-700' },
        { value: 'error' as const, label: 'Errors', count: summary.errors, helper: 'Needs technical check', className: 'text-rose-700' }
      ]
    : [];

  return (
    <NisrAdminLayout
      title="Extraction Results"
      description="Every mapping row is tracked here. Use this screen to see which indicators were extracted, which ones need review, and the exact reason when a mapped row was not found."
    >
      <div className="space-y-6">
        <div className="panel overflow-hidden border-rwBlue/20 bg-gradient-to-br from-white via-sky-50/70 to-emerald-50/60">
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rwBlue">Confidence Classification</p>
              <h2 className="mt-2 text-2xl font-semibold text-rwNavy">Review extraction quality before approval</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Results are grouped by confidence: high is 75% and above, medium is 50-74%, low is below 50%, and rows with no score stay in manual review.
                This keeps fast wins visible while protecting the dashboard from uncertain values.
              </p>
            </div>
            {reportId ? (
              <div className="flex flex-wrap gap-3 lg:justify-end">
                <a
                  href={nisrAutomationApi.exportUrl('extraction-debug-report', reportId)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-rwBlue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rwNavy"
                >
                  Export debug report
                </a>
                <Link
                  href={`/admin/nisr-automation/review?report_id=${encodeURIComponent(reportId)}`}
                  className="rounded-full bg-rwGreen px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  Open approval queue
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_240px]">
          <label className="panel p-4 text-sm">
            <span className="mb-2 block font-semibold text-slate-800">Report</span>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none transition focus:border-rwBlue focus:ring-2 focus:ring-rwBlue/15"
              value={reportId}
              onChange={(event) => setReportId(event.target.value)}
            >
              {!reports.length ? <option value="">No reports uploaded</option> : null}
              {reports.map((report) => (
                <option key={report.report_id} value={report.report_id}>
                  {report.report_name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">{selectedReport?.extraction_summary || 'Select a processed report to inspect extraction quality.'}</p>
          </label>
          <label className="panel p-4 text-sm">
            <span className="mb-2 block font-semibold text-slate-800">Result status</span>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none transition focus:border-rwBlue focus:ring-2 focus:ring-rwBlue/15"
              value={status}
              onChange={(event) => setStatus(event.target.value as 'all' | ExtractionResult['status'])}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">Filter by extraction outcome.</p>
          </label>
          <label className="panel p-4 text-sm">
            <span className="mb-2 block font-semibold text-slate-800">Confidence band</span>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none transition focus:border-rwBlue focus:ring-2 focus:ring-rwBlue/15"
              value={confidenceFilter}
              onChange={(event) => setConfidenceFilter(event.target.value as ConfidenceBand)}
            >
              {CONFIDENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">Filter by confidence threshold.</p>
          </label>
        </div>

        {summary ? (
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {statusCards.map((card) => (
              <button
                key={card.value}
                type="button"
                onClick={() => setStatus(card.value)}
                className={`panel p-4 text-left transition hover:-translate-y-0.5 hover:border-rwBlue/50 hover:shadow-lg ${
                  status === card.value ? 'border-rwBlue ring-2 ring-rwBlue/15' : ''
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className={`mt-2 text-3xl font-semibold ${card.className}`}>{card.count}</p>
                <p className="mt-1 text-xs text-slate-500">{card.helper}</p>
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {CONFIDENCE_OPTIONS.map((option) => {
            const count = option.value === 'all' ? results.length : confidenceCounts[option.value];
            const active = confidenceFilter === option.value;
            const tone =
              option.value === 'high'
                ? 'text-emerald-700'
                : option.value === 'medium'
                  ? 'text-amber-700'
                  : option.value === 'low'
                    ? 'text-rose-700'
                    : option.value === 'none'
                      ? 'text-slate-600'
                      : 'text-rwNavy';
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setConfidenceFilter(option.value)}
                className={`panel p-4 text-left transition hover:-translate-y-0.5 hover:border-rwBlue/50 hover:shadow-lg ${
                  active ? 'border-rwBlue ring-2 ring-rwBlue/15' : ''
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{option.label}</p>
                <p className={`mt-2 text-3xl font-semibold ${tone}`}>{count}</p>
                <p className="mt-1 text-xs text-slate-500">{option.description}</p>
              </button>
            );
          })}
        </div>

        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <div className="panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Mapping row results</h2>
              <p className="text-sm text-slate-500">
                {loading ? 'Loading results...' : `${filteredResults.length} row result(s) shown from ${results.length} loaded result(s)`}
              </p>
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
              High confidence starts at 75%
            </div>
          </div>
          <div className="space-y-4 p-4">
            {filteredResults.map((result) => {
              const resultStatus = statusMeta(result.status);
              const confidence = confidenceMeta(result.confidence_score);
              return (
                <article
                  key={result.id}
                  className={`rounded-3xl border border-slate-200 border-l-4 ${resultStatus.accentClass} bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${resultStatus.badgeClass}`}>{resultStatus.label}</span>
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${confidence.badgeClass}`}>
                          {confidence.percent !== null ? `${confidence.percent}% confidence` : 'No confidence score'}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-slate-950">{result.indicator}</h3>
                      <p className="mt-1 text-sm font-medium text-slate-500">{result.series_code || result.mapping_id}</p>
                      <p className="mt-2 inline-flex max-w-full rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-100">
                        Target: {targetObservationLabel(result)}
                      </p>
                    </div>
                    {result.proposed_update_id ? (
                      <Link
                        href={`/admin/nisr-automation/review?report_id=${encodeURIComponent(result.report_id)}`}
                        className="inline-flex shrink-0 justify-center rounded-full bg-rwGreen px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      >
                        Review proposal
                      </Link>
                    ) : (
                      <span className="inline-flex shrink-0 justify-center rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">No proposal</span>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-rwBlue/15 bg-rwBlue/5 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-rwBlue">Current extracted value</p>
                      <p className="mt-1 text-3xl font-semibold text-rwNavy">{formatValue(result.extracted_value)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{result.previous_year ? `Previous value - ${result.previous_year}` : 'Previous value'}</p>
                      <p className="mt-1 text-3xl font-semibold text-slate-900">{formatValue(result.previous_value)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{confidence.label}</p>
                        <p className="text-sm font-semibold text-slate-900">{confidence.percent !== null ? `${confidence.percent}%` : '-'}</p>
                      </div>
                      <div className="mt-3 h-2.5 rounded-full bg-slate-100">
                        <div className={`h-2.5 rounded-full ${confidence.barClass}`} style={{ width: `${confidence.percent || 0}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{confidence.helper}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expected mapping</p>
                      <dl className="mt-3 space-y-3 text-sm">
                        <div>
                          <dt className="font-semibold text-slate-700">Table / source</dt>
                          <dd className="mt-1 break-words text-slate-600">{result.expected_table || '-'}</dd>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <dt className="font-semibold text-slate-700">Target observation</dt>
                            <dd className="mt-1 break-words text-slate-600">{targetObservationLabel(result)}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-slate-700">Row label</dt>
                            <dd className="mt-1 break-words text-slate-600">{result.expected_row || '-'}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-slate-700">Column / year</dt>
                            <dd className="mt-1 break-words text-slate-600">{result.expected_column || '-'}</dd>
                          </div>
                        </div>
                      </dl>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extraction evidence</p>
                      <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                        <div>
                          <dt className="font-semibold text-slate-700">Closest row</dt>
                          <dd className="mt-1 break-words text-slate-600">{result.closest_matched_row || '-'}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-700">Closest column</dt>
                          <dd className="mt-1 break-words text-slate-600">{result.closest_matched_column || '-'}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-700">Source sheet/page</dt>
                          <dd className="mt-1 break-words text-slate-600">{result.source_sheet_page || '-'}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-700">Matched cell/table</dt>
                          <dd className="mt-1 break-words text-slate-600">{result.matched_cell || result.matched_table || '-'}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</p>
                    <p className="mt-2 text-sm font-medium text-slate-800">{result.reason || '-'}</p>
                    {result.debug_message ? <p className="mt-2 text-sm leading-6 text-slate-500">{result.debug_message}</p> : null}
                  </div>
                </article>
              );
            })}
            {!loading && !filteredResults.length ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                No extraction results found for this filter yet.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </NisrAdminLayout>
  );
}
