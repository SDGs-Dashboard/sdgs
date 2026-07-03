import type { GetStaticProps } from 'next';

import { DataAvailabilityChart } from '../components/charts/DataAvailabilityChart';
import { KpiCard } from '../components/KpiCard';
import { Layout } from '../components/Layout';
import { DashboardDataset } from '../utils/types';

interface DataAvailabilityPageProps {
  searchItems: Array<{ code: string; slug: string; title: string; goal: number }>;
  years: number[];
  goals: number[];
  indicatorsWithData: number;
  indicatorsMissingData: number;
  totalIndicators: number;
  targetByGoal: DashboardDataset['targetByGoal'];
  lowCoverageIndicators: Array<{
    code: string;
    title: string;
    availabilityRatio: number;
    latestYear: number | null;
  }>;
}

export default function DataAvailabilityPage({
  searchItems,
  years,
  goals,
  indicatorsWithData,
  indicatorsMissingData,
  totalIndicators,
  targetByGoal,
  lowCoverageIndicators
}: DataAvailabilityPageProps): JSX.Element {
  const asPercent = (value: number): string => `${Math.round(value * 1000) / 10}%`;

  return (
    <Layout title="Coverage Overview" searchItems={searchItems} years={years} goals={goals}>
      <section className="mb-4 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Indicators reported" value={String(indicatorsWithData)} accent="green" />
        <KpiCard label="Indicators pending update" value={String(indicatorsMissingData)} accent="yellow" />
        <KpiCard
          label="Coverage rate"
          value={totalIndicators ? asPercent(indicatorsWithData / totalIndicators) : '0%'}
          accent="blue"
        />
      </section>

      <section className="mb-4">
        <DataAvailabilityChart data={targetByGoal} />
      </section>

      <section className="panel border border-slate-200 p-5">
        <h3 className="font-heading text-base font-semibold text-slate-900">Indicators with limited time coverage</h3>
        <p className="mt-1 text-sm text-slate-600">
          Indicators currently reporting under 40% annual coverage across available reporting years.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-3 py-2">Indicator</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Coverage</th>
                <th className="px-3 py-2">Latest year</th>
              </tr>
            </thead>
            <tbody>
              {lowCoverageIndicators.length ? (
                lowCoverageIndicators.map((indicator) => (
                  <tr key={indicator.code} className="border-t border-slate-100 text-slate-700">
                    <td className="px-3 py-2 font-semibold text-rwNavy">{indicator.code}</td>
                    <td className="max-w-[380px] truncate px-3 py-2" title={indicator.title}>
                      {indicator.title}
                    </td>
                    <td className="px-3 py-2">{asPercent(indicator.availabilityRatio)}</td>
                    <td className="px-3 py-2">{indicator.latestYear ?? '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-3 py-5 text-center text-slate-500">
                    All indicators are currently above the configured coverage threshold.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<DataAvailabilityPageProps> = async () => {
  return {
    notFound: true
  };
};
