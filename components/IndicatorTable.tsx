import Link from 'next/link';

import { formatNumber, publicStatusLabel, statusClassName } from '../utils/format';
import { IndicatorSummary } from '../utils/types';

interface IndicatorTableProps {
  indicators: IndicatorSummary[];
}

export function IndicatorTable({ indicators }: IndicatorTableProps): JSX.Element {
  return (
    <div className="panel overflow-hidden border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Indicator</th>
              <th className="px-4 py-3">Latest value</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Year</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">View Source</th>
            </tr>
          </thead>
          <tbody>
            {indicators.map((indicator) => (
              <tr key={indicator.code} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-4 py-3 font-semibold text-rwNavy">
                  <Link href={`/indicators/${indicator.slug}`}>{indicator.code}</Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/indicators/${indicator.slug}`} className="text-slate-800 hover:text-rwBlue">
                    {indicator.title}
                  </Link>
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">{formatNumber(indicator.latestValue, 2)}</td>
                <td className="px-4 py-3 text-slate-700">{formatNumber(indicator.targetValue, 2)}</td>
                <td className="px-4 py-3 text-slate-700">
                  {indicator.targetProgressPercent === null
                    ? 'N/A'
                    : `${Math.max(0, Math.min(100, Math.round(indicator.targetProgressPercent)))}%`}
                </td>
                <td className="px-4 py-3 text-slate-700">{indicator.latestYear ?? 'N/A'}</td>
                <td className="max-w-[200px] truncate px-4 py-3 text-slate-700">{indicator.unit}</td>
                <td className="max-w-[260px] truncate px-4 py-3 text-slate-700">{indicator.source}</td>
                <td className="px-4 py-3">
                  <span className={`soft-badge ${statusClassName(indicator.status)}`}>
                    {publicStatusLabel(indicator.status)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/indicators/${indicator.slug}#source`}
                    className="inline-flex rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    View Source
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
