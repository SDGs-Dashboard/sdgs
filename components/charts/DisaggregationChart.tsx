import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { DisaggregationData } from '../../utils/types';

export function DisaggregationChart({ data }: { data: DisaggregationData }): JSX.Element {
  return (
    <div className="panel border border-slate-200 p-4">
      <h3 className="font-heading text-base font-semibold text-slate-900">
        Latest breakdown by {data.dimension} ({data.year})
      </h3>
      <div className="mt-3 h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-18} textAnchor="end" height={60} interval={0} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="value" name="Value" fill="#00A651" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

