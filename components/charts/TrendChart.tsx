// Time-series chart for one indicator.
// Receives already-cleaned year/value points from utils/sdgData.
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { TrendPoint } from '../../utils/types';

interface TrendChartProps {
  title?: string;
  data: TrendPoint[];
  lineColor?: string;
}

export function TrendChart({ title = 'Indicator trend', data, lineColor = '#00A1DE' }: TrendChartProps): JSX.Element {
  return (
    <div className="panel border border-slate-200 p-4">
      <h3 className="font-heading text-base font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="value"
              name="Value"
              stroke={lineColor}
              strokeWidth={3}
              dot={{ r: 3, strokeWidth: 2, fill: '#fff' }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
