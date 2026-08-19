// Reusable dashboard metric card.
// Used for headline counts and rates across the public and admin screens.
import { ReactNode } from 'react';

interface KpiCardProps {
  label: string;
  value: string;
  helper?: string;
  icon?: ReactNode;
  accent?: 'blue' | 'green' | 'yellow' | 'neutral';
}

const accentStyles: Record<NonNullable<KpiCardProps['accent']>, string> = {
  blue: 'border-rwBlue/30 bg-rwBlue/5',
  green: 'border-rwGreen/35 bg-rwGreen/5',
  yellow: 'border-rwYellow/55 bg-rwYellow/15',
  neutral: 'border-slate-200 bg-white'
};

export function KpiCard({ label, value, helper, icon, accent = 'neutral' }: KpiCardProps): JSX.Element {
  return (
    <div className={`panel border px-5 py-4 ${accentStyles[accent]}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        {icon && <span className="text-rwNavy">{icon}</span>}
      </div>
      <p className="font-heading text-3xl font-semibold text-slate-900">{value}</p>
      {helper && <p className="mt-1 text-xs text-slate-600">{helper}</p>}
    </div>
  );
}
