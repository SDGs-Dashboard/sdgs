// Public indicator explorer.
// Filtering is handled in the browser against a static indicator summary list,
// which keeps the page responsive and deployable without a public API server.
import { useEffect, useMemo, useState } from 'react';

import type { GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import { FiDownload } from 'react-icons/fi';

import { EmptyState } from '../../components/EmptyState';
import { FilterPanel } from '../../components/FilterPanel';
import { IndicatorTable } from '../../components/IndicatorTable';
import { KpiCard } from '../../components/KpiCard';
import { Layout } from '../../components/Layout';
import { publicStatusLabel } from '../../utils/format';
import { getDashboardDataset } from '../../utils/sdgData';
import { IndicatorSummary } from '../../utils/types';

interface IndicatorsPageProps {
  searchItems: Array<{ code: string; slug: string; title: string; goal: number }>;
  years: number[];
  goals: number[];
  indicators: IndicatorSummary[];
  filterOptions: {
    sexes: string[];
    locations: string[];
    ages: string[];
  };
}

interface Filters {
  search: string;
  goal: string;
  status: string;
  year: string;
  sex: string;
  location: string;
  age: string;
}

const DEFAULT_FILTERS: Filters = {
  search: '',
  goal: '',
  status: '',
  year: '',
  sex: '',
  location: '',
  age: ''
};

const toCsvCell = (value: string | number | null): string => `"${String(value ?? '').replaceAll('"', '""')}"`;

export default function IndicatorExplorerPage({
  searchItems,
  years,
  goals,
  indicators,
  filterOptions
}: IndicatorsPageProps): JSX.Element {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  useEffect(() => {
    // Keep filters shareable: URLs like /indicators?goal=1&status=On%20track
    // open with the same filter state after refresh or sharing.
    setFilters({
      search: String(router.query.search ?? ''),
      goal: String(router.query.goal ?? ''),
      status: String(router.query.status ?? ''),
      year: String(router.query.year ?? ''),
      sex: String(router.query.sex ?? ''),
      location: String(router.query.location ?? ''),
      age: String(router.query.age ?? '')
    });
  }, [router.query]);

  const filteredIndicators = useMemo(() => {
    // Apply filters in-memory. The dataset is small enough for this to be faster
    // and simpler than adding a public search endpoint.
    const search = filters.search.trim().toLowerCase();
    const selectedYear = filters.year ? Number(filters.year) : null;

    return indicators.filter((indicator) => {
      if (search) {
        const matchesSearch =
          indicator.code.toLowerCase().includes(search) ||
          indicator.title.toLowerCase().includes(search);
        if (!matchesSearch) {
          return false;
        }
      }

      if (filters.goal && String(indicator.goal) !== filters.goal) {
        return false;
      }

      if (filters.status && indicator.status !== filters.status) {
        return false;
      }

      if (selectedYear && !indicator.yearsWithData.includes(selectedYear)) {
        return false;
      }

      if (filters.sex && !indicator.availableSexes.includes(filters.sex)) {
        return false;
      }

      if (filters.location && !indicator.availableLocations.includes(filters.location)) {
        return false;
      }

      if (filters.age && !indicator.availableAgeGroups.includes(filters.age)) {
        return false;
      }

      return true;
    });
  }, [filters, indicators]);

  const updateFilter = (field: string, value: string) => {
    setFilters((previous) => ({ ...previous, [field]: value }));
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const downloadFiltered = () => {
    // Export only the visible rows so staff/users can preserve their filtered view.
    const headers = [
      'Code',
      'Title',
      'Goal',
      'Latest Value',
      'Latest Year',
      'Target Value',
      'Target Progress (%)',
      'Projected Progress 2030 (%)',
      'Direction',
      'Unit',
      'Source',
      'Status'
    ];
    const rows = filteredIndicators.map((indicator) => [
      indicator.code,
      indicator.title,
      indicator.goal,
      indicator.latestValue ?? '',
      indicator.latestYear ?? '',
      indicator.targetValue ?? '',
      indicator.targetProgressPercent ?? '',
      indicator.projectedProgressPercent ?? '',
      indicator.direction,
      indicator.unit,
      indicator.source,
      publicStatusLabel(indicator.status)
    ]);

    const csv = [headers, ...rows].map((line) => line.map(toCsvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'rwanda_sdg_indicator_explorer.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout title="Indicator Explorer" searchItems={searchItems} years={years} goals={goals}>
      <section className="mb-4 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Indicator records" value={String(indicators.length)} />
        <KpiCard label="Filtered results" value={String(filteredIndicators.length)} accent="blue" />
        <KpiCard
          label="On track in results"
          value={String(filteredIndicators.filter((indicator) => indicator.status === 'On track').length)}
          accent="green"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[300px_1fr]">
        <FilterPanel
          search={filters.search}
          goal={filters.goal}
          status={filters.status}
          year={filters.year}
          sex={filters.sex}
          location={filters.location}
          age={filters.age}
          goals={goals}
          years={years}
          sexes={filterOptions.sexes}
          locations={filterOptions.locations}
          ages={filterOptions.ages}
          onChange={updateFilter}
          onReset={resetFilters}
        />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading text-lg font-semibold text-slate-900">Indicator table</h3>
            <button
              type="button"
              onClick={downloadFiltered}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FiDownload className="h-4 w-4" />
              Download filtered data
            </button>
          </div>

          {filteredIndicators.length ? (
            <IndicatorTable indicators={filteredIndicators} />
          ) : (
            <EmptyState
              title="No indicators match current filters"
              message="Adjust one or more filters to broaden results, or clear all filters to return to the full indicator list."
            />
          )}
        </div>
      </section>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<IndicatorsPageProps> = async () => {
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
      goals: dataset.filters.goals,
      indicators: dataset.indicators,
      filterOptions: {
        sexes: dataset.filters.sexes,
        locations: dataset.filters.locations,
        ages: dataset.filters.ages
      }
    }
  };
};
