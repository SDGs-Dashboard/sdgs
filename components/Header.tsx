import { FormEvent, useMemo, useState } from 'react';

import Image from 'next/image';
import { useRouter } from 'next/router';
import { FiFilter, FiMenu, FiSearch } from 'react-icons/fi';

interface SearchItem {
  code: string;
  slug: string;
  title: string;
  goal: number;
}

interface HeaderProps {
  title: string;
  onOpenSidebar: () => void;
  searchItems: SearchItem[];
  years: number[];
  goals: number[];
}

export function Header({ title, onOpenSidebar, searchItems, years, goals }: HeaderProps): JSX.Element {
  const router = useRouter();
  const [searchText, setSearchText] = useState(String(router.query.search ?? ''));

  const goalQuery = String(router.query.goal ?? '');
  const yearQuery = String(router.query.year ?? '');

  const suggestions = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query || query.length < 2) {
      return [];
    }

    return searchItems
      .filter(
        (item) =>
          item.code.toLowerCase().includes(query) ||
          item.title.toLowerCase().includes(query)
      )
      .slice(0, 6);
  }, [searchItems, searchText]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = searchText.trim();
    router.push({
      pathname: '/indicators',
      query: {
        ...(query ? { search: query } : {}),
        ...(goalQuery ? { goal: goalQuery } : {}),
        ...(yearQuery ? { year: yearQuery } : {})
      }
    });
  };

  const updateQueryValue = (key: 'goal' | 'year', value: string) => {
    const nextQuery = {
      ...router.query,
      [key]: value || undefined
    };

    if (!value) {
      delete nextQuery[key];
    }

    router.push(
      {
        pathname: router.pathname,
        query: nextQuery
      },
      undefined,
      { shallow: true }
    );
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="inline-flex rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
            aria-label="Open navigation"
          >
            <FiMenu />
          </button>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <div className="rounded-md border border-slate-200 bg-white p-1">
                <Image src="/brand/rwanda-flag.svg" alt="Flag of Rwanda" width={24} height={16} className="h-[14px] w-auto rounded-[2px]" />
              </div>
              <div className="rounded-full border border-slate-200 bg-white p-1">
                <Image
                  src="/brand/sdg-wheel.png"
                  alt="United Nations Sustainable Development Goals wheel"
                  width={18}
                  height={18}
                  className="h-[16px] w-[16px]"
                />
              </div>
            </div>
            <h2 className="font-heading text-xl font-semibold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">National Sustainable Development Goal monitoring and reporting</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:w-[700px] lg:flex-row lg:items-center lg:justify-end">
          <form onSubmit={submitSearch} className="relative flex-1">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search by indicator code or title"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none ring-rwBlue/25 transition focus:border-rwBlue focus:ring"
            />

            {suggestions.length > 0 && (
              <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-full rounded-xl border border-slate-200 bg-white shadow-card">
                {suggestions.map((item) => (
                  <button
                    type="button"
                    key={item.code}
                    className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-slate-50"
                    onClick={() => {
                      setSearchText(item.code);
                      router.push(`/indicators/${item.slug}`);
                    }}
                  >
                    <span className="font-semibold text-rwNavy">{item.code}</span>{' '}
                    <span className="text-slate-600">{item.title}</span>
                  </button>
                ))}
              </div>
            )}
          </form>

          <div className="flex items-center gap-2">
            <FiFilter className="h-4 w-4 text-slate-400" />
            <select
              value={goalQuery}
              onChange={(event) => updateQueryValue('goal', event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 outline-none transition focus:border-rwBlue"
            >
              <option value="">All SDGs</option>
              {goals.map((goal) => (
                <option key={goal} value={goal}>
                  Goal {goal}
                </option>
              ))}
            </select>
            <select
              value={yearQuery}
              onChange={(event) => updateQueryValue('year', event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 outline-none transition focus:border-rwBlue"
            >
              <option value="">All years</option>
              {[...years].reverse().map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}
