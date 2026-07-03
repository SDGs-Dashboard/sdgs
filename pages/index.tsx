import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { FiCalendar, FiCheckCircle, FiFlag, FiTarget, FiTrendingDown } from 'react-icons/fi';

import { DataAvailabilityChart } from '../components/charts/DataAvailabilityChart';
import { KpiCard } from '../components/KpiCard';
import { Layout } from '../components/Layout';
import { RwandaMapSummary } from '../components/RwandaMapSummary';
import { RwandaSdgSummaryCard } from '../components/RwandaSdgSummaryCard';
import { SdgOfficialOverviewCard } from '../components/SdgOfficialOverviewCard';
import { formatDateLabel } from '../utils/format';
import { getDashboardDataset } from '../utils/sdgData';
import { DashboardDataset } from '../utils/types';

interface HomePageProps {
  searchItems: Array<{ code: string; slug: string; title: string; goal: number }>;
  years: number[];
  goals: number[];
  totals: DashboardDataset['totals'];
  lastUpdated: string | null;
  overallProgress: DashboardDataset['overallProgress'];
  targetByGoal: DashboardDataset['targetByGoal'];
  overviewGoals: DashboardDataset['goals'];
  provinceCoverage: DashboardDataset['provinceCoverage'];
}

export default function HomePage(props: HomePageProps): JSX.Element {
  const {
    searchItems,
    years,
    goals,
    totals,
    lastUpdated,
    overallProgress,
    targetByGoal,
    overviewGoals,
    provinceCoverage
  } = props;

  return (
    <Layout title="National SDG Performance Overview" searchItems={searchItems} years={years} goals={goals}>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total SDGs" value={String(totals.sdgs)} accent="blue" icon={<FiFlag />} />
        <KpiCard label="Total indicators" value={String(totals.indicators)} accent="green" icon={<FiTarget />} />
        <KpiCard
          label="Indicators on track"
          value={String(overallProgress.onTrack)}
          helper={`${Math.round(overallProgress.projectedOnTrackRate)}% projected on-track rate`}
          accent="green"
          icon={<FiCheckCircle />}
        />
        <KpiCard
          label="Needs attention"
          value={String(overallProgress.needsAttention)}
          accent="yellow"
          icon={<FiTrendingDown />}
        />
        <KpiCard label="Last updated" value={formatDateLabel(lastUpdated)} accent="blue" icon={<FiCalendar />} />
      </section>

      <section className="mt-5">
        <RwandaSdgSummaryCard
          averageTargetProgress={overallProgress.averageTargetProgress}
          projectedOnTrackRate={overallProgress.projectedOnTrackRate}
          onTrack={overallProgress.onTrack}
          moderate={overallProgress.moderate}
          needsAttention={overallProgress.needsAttention}
        />
      </section>

      <section className="mt-5 panel border border-slate-200 p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-base font-semibold text-slate-900">National SDG Goal Performance Overview</h3>
            <p className="mt-1 text-xs text-slate-600">
              Each card summarizes goal-level status, indicator coverage, and measured progress.
            </p>
          </div>
          <Link href="/goals" className="mt-0.5 text-xs font-semibold text-rwBlue hover:underline">
            View all SDG goals
          </Link>
        </div>

        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          {overviewGoals.map((goal) => (
            <SdgOfficialOverviewCard key={goal.goal} goal={goal} />
          ))}
        </div>
      </section>

      <section className="mt-5">
        <DataAvailabilityChart data={targetByGoal} />
      </section>

      <section className="mt-5">
        <RwandaMapSummary coverage={provinceCoverage} />
      </section>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<HomePageProps> = async () => {
  const dataset = getDashboardDataset();
  const overviewGoals = [...dataset.goals].sort((a, b) => a.goal - b.goal);

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
      totals: dataset.totals,
      lastUpdated: dataset.lastUpdated,
      overallProgress: dataset.overallProgress,
      targetByGoal: dataset.targetByGoal,
      overviewGoals,
      provinceCoverage: dataset.provinceCoverage
    }
  };
};
