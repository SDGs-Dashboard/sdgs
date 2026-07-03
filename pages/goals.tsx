import type { GetStaticProps } from 'next';

import { Layout } from '../components/Layout';
import { SdgGoalCard } from '../components/SdgGoalCard';
import { getDashboardDataset } from '../utils/sdgData';
import { GoalSummary } from '../utils/types';

interface GoalsPageProps {
  searchItems: Array<{ code: string; slug: string; title: string; goal: number }>;
  years: number[];
  goalsFilter: number[];
  goals: GoalSummary[];
}

export default function GoalsPage({ searchItems, years, goalsFilter, goals }: GoalsPageProps): JSX.Element {
  return (
    <Layout title="SDG Goals" searchItems={searchItems} years={years} goals={goalsFilter}>
      <section className="mb-5 panel border border-slate-200 p-5">
        <h3 className="font-heading text-xl font-semibold text-slate-900">Rwanda SDG Goal Performance</h3>
        <p className="mt-2 max-w-4xl text-sm text-slate-600">
          Review all 17 SDG goals. Each card presents goal-level status, indicator coverage, and progress toward 2030.
        </p>
      </section>

      <section aria-label="SDG goals list" className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
        {goals.map((goal) => (
          <SdgGoalCard key={goal.goal} goal={goal} />
        ))}
      </section>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<GoalsPageProps> = async () => {
  const dataset = getDashboardDataset();

  return {
    props: {
      searchItems: dataset.indicators.map((indicator) => ({
        code: indicator.code,
        slug: indicator.slug,
        title: indicator.title,
        goal: indicator.goal
      })),
      years: dataset.filters.years,
      goalsFilter: dataset.filters.goals,
      goals: dataset.goals
    }
  };
};
