// Metadata catalogue page placeholder.
// The detailed metadata panel is available on each indicator page. This route is
// intentionally hidden until a full standalone metadata catalogue is published.
import type { GetStaticProps } from 'next';
import Link from 'next/link';

import { KpiCard } from '../components/KpiCard';
import { Layout } from '../components/Layout';

interface MetadataPageProps {
  searchItems: Array<{ code: string; slug: string; title: string; goal: number }>;
  years: number[];
  goals: number[];
  totalIndicators: number;
  indicatorsWithMetadata: number;
  metadataRows: Array<{
    code: string;
    slug: string;
    title: string;
    targetName: string;
    source: string;
    hasDefinition: boolean;
    hasSourceUrl: boolean;
    metadataLastUpdated: string;
  }>;
}

export default function MetadataPage({
  searchItems,
  years,
  goals,
  totalIndicators,
  indicatorsWithMetadata,
  metadataRows
}: MetadataPageProps): JSX.Element {
  return (
    <Layout title="Metadata Catalogue" searchItems={searchItems} years={years} goals={goals}>
      <section className="mb-4 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Indicators" value={String(totalIndicators)} accent="blue" />
        <KpiCard label="Indicators with metadata" value={String(indicatorsWithMetadata)} accent="green" />
        <KpiCard
          label="Metadata completeness"
          value={totalIndicators ? `${Math.round((indicatorsWithMetadata / totalIndicators) * 100)}%` : '0%'}
          accent="yellow"
        />
      </section>

      <section className="panel border border-slate-200 p-5">
        <h3 className="font-heading text-base font-semibold text-slate-900">Indicator Metadata</h3>
        <p className="mt-1 text-sm text-slate-600">
          Public metadata records sourced from <code>meta/*.md</code>.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-3 py-2">Indicator</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Target name</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Definition</th>
                <th className="px-3 py-2">Source URL</th>
                <th className="px-3 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {metadataRows.map((row) => (
                <tr key={row.code} className="border-t border-slate-100 text-slate-700">
                  <td className="px-3 py-2 font-semibold text-rwNavy">
                    <Link href={`/indicators/${row.slug}`} className="hover:underline">
                      {row.code}
                    </Link>
                  </td>
                  <td className="max-w-[320px] truncate px-3 py-2" title={row.title}>
                    {row.title}
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2" title={row.targetName}>
                    {row.targetName || '-'}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2" title={row.source}>
                    {row.source || '-'}
                  </td>
                  <td className="px-3 py-2">{row.hasDefinition ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2">{row.hasSourceUrl ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2">{row.metadataLastUpdated || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<MetadataPageProps> = async () => {
  // Keep the route out of the static build while preserving the page component
  // for future publication.
  return {
    notFound: true
  };
};
