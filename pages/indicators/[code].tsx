import { useState } from 'react';

import { useRouter } from 'next/router';
import type { GetStaticPaths, GetStaticProps } from 'next';
import { FiDownload, FiInfo, FiTrendingUp } from 'react-icons/fi';

import { EmptyState } from '../../components/EmptyState';
import { KpiCard } from '../../components/KpiCard';
import { Layout } from '../../components/Layout';
import { MetadataPanel } from '../../components/MetadataPanel';
import { DisaggregationChart } from '../../components/charts/DisaggregationChart';
import { TrendChart } from '../../components/charts/TrendChart';
import { formatNumber, fromIndicatorSlug, publicStatusLabel, statusClassName, toIndicatorSlug } from '../../utils/format';
import { isStaticExport } from '../../utils/site';
import { getDashboardDataset, getIndicatorCodes, getIndicatorDetail } from '../../utils/sdgData';
import { IndicatorDetail } from '../../utils/types';

interface IndicatorDetailPageProps {
  searchItems: Array<{ code: string; slug: string; title: string; goal: number }>;
  years: number[];
  goals: number[];
  detail: IndicatorDetail;
  initialSourceRows: IndicatorSourceRow[];
}

interface IndicatorSourceRow {
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
}

const toCsvCell = (value: string | number | null): string => `"${String(value ?? '').replaceAll('"', '""')}"`;

export default function IndicatorDetailPage({
  searchItems,
  years,
  goals,
  detail,
  initialSourceRows
}: IndicatorDetailPageProps): JSX.Element {
  const router = useRouter();
  const [sourceRows, setSourceRows] = useState<IndicatorSourceRow[] | null>(isStaticExport ? initialSourceRows : null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');

  if (router.isFallback) {
    return (
      <Layout title="Indicator Detail" searchItems={searchItems} years={years} goals={goals}>
        <div className="panel p-5 text-sm text-slate-600">Loading indicator details...</div>
      </Layout>
    );
  }

  const { summary, metadata, trend, disaggregation, downloadableRows } = detail;

  const downloadIndicatorData = () => {
    const headers = Object.keys(downloadableRows[0] || {});
    const rows = downloadableRows.map((row) => headers.map((header) => row[header] as string | number | null));
    const csv = [headers, ...rows].map((line) => line.map(toCsvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `indicator_${summary.slug}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const safeProgress =
    summary.targetProgressPercent === null
      ? 'N/A'
      : `${Math.max(0, Math.min(100, Math.round(summary.targetProgressPercent)))}%`;

  const loadSources = async () => {
    if (isStaticExport) {
      setSourceRows(initialSourceRows);
      return;
    }

    setSourceError('');
    setSourceLoading(true);
    try {
      const response = await fetch(`/api/public/source/${summary.slug}`);
      const payload = (await response.json()) as { sources?: IndicatorSourceRow[]; error?: string };
      if (!response.ok) {
        setSourceError(payload.error || 'Failed to load source records.');
        return;
      }
      setSourceRows(payload.sources || []);
    } catch {
      setSourceError('Network error while loading source records.');
    } finally {
      setSourceLoading(false);
    }
  };

  return (
    <Layout title={`Indicator ${summary.code}`} searchItems={searchItems} years={years} goals={goals}>
      <section className="panel border border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Goal {summary.goal} | Target {summary.target}
            </p>
            <h2 className="mt-1 font-heading text-2xl font-semibold text-slate-900">{summary.title}</h2>
            <p className="mt-2 max-w-4xl text-sm text-slate-600">
              {metadata.indicatorDefinition || metadata.graphTitle || 'Indicator definition not available.'}
            </p>
          </div>
          <span className={`soft-badge ${statusClassName(summary.status)}`}>{publicStatusLabel(summary.status)}</span>
        </div>
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Latest value"
          value={formatNumber(summary.latestValue, 2)}
          helper={summary.latestYear ? `Year ${summary.latestYear}` : 'Year pending update'}
          accent="blue"
          icon={<FiTrendingUp />}
        />
        <KpiCard
          label={`Target (${summary.targetYear})`}
          value={formatNumber(summary.targetValue, 2)}
          helper={`Direction: ${summary.direction}`}
          accent="green"
          icon={<FiInfo />}
        />
        <KpiCard
          label="Progress to target"
          value={safeProgress}
          helper={summary.analysisNote}
          accent="yellow"
        />
      </section>

      <section className="mt-4 space-y-4">
        {trend.length ? (
          <TrendChart title="Trend over time" data={trend} />
        ) : (
          <EmptyState
            title="Trend data pending update"
            message="Time-series observations for this indicator are being updated."
          />
        )}

        {disaggregation ? (
          <DisaggregationChart data={disaggregation} />
        ) : (
          <EmptyState
            title="Disaggregation pending update"
            message="Disaggregation details for this indicator are being updated."
          />
        )}
      </section>

      <section className="mt-4 panel border border-slate-200 p-5">
        <h3 className="font-heading text-base font-semibold text-slate-900">Target trajectory analysis</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-100 p-3">
            <p className="text-xs text-slate-500">Baseline</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {formatNumber(summary.baselineValue, 2)} ({summary.baselineYear ?? 'N/A'})
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 p-3">
            <p className="text-xs text-slate-500">Projected value (2030)</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{formatNumber(summary.projectedValue2030, 2)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 p-3">
            <p className="text-xs text-slate-500">Annual change</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{formatNumber(summary.actualAnnualChange, 4)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 p-3">
            <p className="text-xs text-slate-500">Required annual change</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {formatNumber(summary.requiredAnnualChange, 4)}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]" id="source">
        <div className="panel border border-slate-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading text-base font-semibold text-slate-900">Source and downloads</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadSources()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {isStaticExport ? 'Approved Source Log' : 'Refresh Source Log'}
              </button>
              <button
                type="button"
                onClick={downloadIndicatorData}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FiDownload className="h-4 w-4" />
                Download data
              </button>
            </div>
          </div>

          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Primary source</dt>
              <dd className="mt-1 text-slate-700">{summary.source || 'Not available'}</dd>
            </div>
            {metadata.sourceUrl && (
              <div>
                <dt className="font-medium text-slate-500">Source link</dt>
                <dd className="mt-1">
                  <a href={metadata.sourceUrl} target="_blank" rel="noreferrer" className="text-rwBlue hover:underline">
                    {metadata.sourceUrlText || metadata.sourceUrl}
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="font-medium text-slate-500">Indicator code</dt>
              <dd className="mt-1 text-slate-700">{summary.code}</dd>
            </div>
          </dl>

          {sourceLoading ? <p className="mt-4 text-sm text-slate-500">Loading approved source records...</p> : null}
          {sourceError ? <p className="mt-4 text-sm text-rose-700">{sourceError}</p> : null}
          {sourceRows ? (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Report</th>
                    <th className="px-2 py-2">Institution</th>
                    <th className="px-2 py-2">Page</th>
                    <th className="px-2 py-2">Year</th>
                    <th className="px-2 py-2">Value</th>
                    <th className="px-2 py-2">Approved By</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceRows.length ? (
                    sourceRows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-2 py-2 text-slate-700">{row.source_report_name}</td>
                        <td className="px-2 py-2 text-slate-700">{row.institution}</td>
                        <td className="px-2 py-2 text-slate-700">{row.page_number ?? 'N/A'}</td>
                        <td className="px-2 py-2 text-slate-700">{row.year}</td>
                        <td className="px-2 py-2 text-slate-700">{row.value}</td>
                        <td className="px-2 py-2 text-slate-700">{row.approved_by}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-2 py-4 text-center text-slate-500">
                        No approved source records available yet for this indicator.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <MetadataPanel metadata={metadata} />
      </section>
    </Layout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const paths = getIndicatorCodes().map((code) => ({
    params: {
      code: toIndicatorSlug(code)
    }
  }));

  return {
    paths,
    fallback: false
  };
};

export const getStaticProps: GetStaticProps<IndicatorDetailPageProps> = async ({ params }) => {
  const slug = String(params?.code ?? '');
  const code = fromIndicatorSlug(slug);
  const detail = getIndicatorDetail(code);

  if (!detail) {
    return {
      notFound: true
    };
  }

  const dataset = getDashboardDataset();
  const safeDetail = JSON.parse(JSON.stringify(detail)) as IndicatorDetail;

  return {
    props: {
      searchItems: dataset.indicators.map((indicator) => ({
        code: indicator.code,
        slug: indicator.slug,
        title: indicator.title,
        goal: indicator.goal
      })),
      years: dataset.filters.years,
      goals: dataset.filters.goals,
      detail: safeDetail,
      initialSourceRows: []
    }
  };
};
