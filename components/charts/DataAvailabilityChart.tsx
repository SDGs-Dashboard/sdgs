// Goal-level progress chart.
// Despite the historical component name, this now displays target progress by SDG goal.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { GoalTargetPoint } from '../../utils/types';

interface DataAvailabilityChartProps {
  data: GoalTargetPoint[];
}

const COLORS = ['#00A1DE', '#00A651', '#FAD201', '#00457C'];

export function DataAvailabilityChart({ data }: DataAvailabilityChartProps): JSX.Element {
  return (
    <div className="panel border border-slate-200 p-4">
      <h3 className="font-heading text-base font-semibold text-slate-900">SDG Target Progress by Goal (%)</h3>
      <div className="mt-3 h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={6}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="goalName" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
            <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
            <Tooltip formatter={(value) => [`${value}%`, 'Target progress']} />
            <Bar dataKey="targetProgressPercent" name="Target progress (%)" radius={[6, 6, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.goal} fill={COLORS[entry.goal % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
