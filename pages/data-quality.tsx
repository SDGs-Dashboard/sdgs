import type { GetStaticProps } from 'next';
import Link from 'next/link';

import { DataAvailabilityChart } from '../components/charts/DataAvailabilityChart';
import { EmptyState } from '../components/EmptyState';
import { KpiCard } from '../components/KpiCard';
import { Layout } from '../components/Layout';
import { DashboardDataset, IndicatorSummary } from '../utils/types';

interface DataQualityPageProps {
  searchItems: Array<{ code: string; slug: string; title: string; goal: number }>;
  years: number[];
  goals: number[];
  targetByGoal: DashboardDataset['targetByGoal'];
  insufficientDataIndicators: IndicatorSummary[];
  likelyToMeetTargetIndicators: IndicatorSummary[];
  offTrackIndicators: IndicatorSummary[];
  farFromTargetIndicators: IndicatorSummary[];
}

function IndicatorList({
  title,
  indicators,
  emptyMessage
}: {
  title: string;
  indicators: IndicatorSummary[];
  emptyMessage: string;
}): JSX.Element {
  return (
    <div className="panel border border-slate-200 p-4">
      <h3 className="font-heading text-base font-semibold text-slate-900">{title}</h3>
      {indicators.length ? (
        <ul className="mt-3 space-y-2">
          {indicators.slice(0, 12).map((indicator) => (
            <li key={indicator.code} className="rounded-xl border border-slate-100 p-2 text-sm">
              <Link href={`/indicators/${indicator.slug}`} className="font-semibold text-rwNavy hover:underline">
                {indicator.code}
              </Link>
              <p className="mt-1 line-clamp-2 text-xs text-slate-600">{indicator.title}</p>
              <p className="mt-1 text-[11px] text-slate-500">Latest year: {indicator.latestYear ?? 'N/A'}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-600">{emptyMessage}</p>
      )}
    </div>
  );
}

export default function DataQualityPage({
  searchItems,
  years,
  goals,
  targetByGoal,
  insufficientDataIndicators,
  likelyToMeetTargetIndicators,
  offTrackIndicators,
  farFromTargetIndicators
}: DataQualityPageProps): JSX.Element {
  return (
    <Layout title="Target Analysis" searchItems={searchItems} years={years} goals={goals}>
      <section className="mb-4 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Likely to meet target" value={String(likelyToMeetTargetIndicators.length)} accent="green" />
        <KpiCard label="Off track" value={String(offTrackIndicators.length)} accent="yellow" />
        <KpiCard label="Pending analysis" value={String(insufficientDataIndicators.length)} accent="blue" />
      </section>

      <section className="mb-4">
        <DataAvailabilityChart data={targetByGoal} />
      </section>

      <section className="mb-4 panel border border-slate-200 p-4">
        <h3 className="font-heading text-base font-semibold text-slate-900">Target progress by SDG goal</h3>
        <div className="mt-3 space-y-2">
          {targetByGoal.map((goal) => (
            <div key={goal.goal} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-900">
                  Goal {goal.goal}: {goal.goalName}
                </span>
                <span className="text-slate-700">{goal.targetProgressPercent.toFixed(1)}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-rwBlue" style={{ width: `${goal.targetProgressPercent}%` }} />
              </div>
              <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
                <span>On track: {goal.onTrackCount}</span>
                <span>Needs attention: {goal.needsAttentionCount}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <IndicatorList
          title="Indicators far from target"
          indicators={farFromTargetIndicators}
          emptyMessage="No major target gaps detected under current thresholds."
        />
        <IndicatorList
          title="Likely to meet target"
          indicators={likelyToMeetTargetIndicators}
          emptyMessage="No indicators are currently projected to meet target."
        />
        <IndicatorList
          title="Pending trajectory analysis"
          indicators={insufficientDataIndicators}
          emptyMessage="All indicators currently have trajectory analysis available."
        />
      </section>

      {!insufficientDataIndicators.length && !likelyToMeetTargetIndicators.length && !offTrackIndicators.length && (
        <section className="mt-4">
          <EmptyState
            title="No target analysis records to display"
            message="Target analysis records are being prepared for publication."
          />
        </section>
      )}
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<DataQualityPageProps> = async () => {
  return {
    notFound: true
  };
};
