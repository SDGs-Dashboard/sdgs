import Image from 'next/image';
import Link from 'next/link';

import { formatPercent, publicStatusLabel, statusClassName } from '../utils/format';
import { GoalSummary } from '../utils/types';

interface SdgGoalCardProps {
  goal: GoalSummary;
}

export function SdgGoalCard({ goal }: SdgGoalCardProps): JSX.Element {
  const safeProgress = Math.max(0, Math.min(100, goal.targetProgressPercent));
  const visibleStatus = publicStatusLabel(goal.status);

  return (
    <Link
      href={`/indicators?goal=${goal.goal}`}
      className="panel block overflow-hidden border border-slate-200 bg-white transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-card"
    >
      <div className="p-3">
        <div className="relative h-28 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 sm:h-32">
          <Image
            src={`/sdg-goals/en/${goal.goal}.png`}
            alt={`United Nations SDG Goal ${goal.goal}: ${goal.name}`}
            fill
            className="object-contain p-1"
            sizes="(max-width: 768px) 92vw, (max-width: 1280px) 46vw, 24vw"
          />
        </div>

        <div className="mb-2 mt-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">SDG Goal {goal.goal}</p>
            <h3 className="mt-1 font-heading text-base font-semibold text-slate-900">{goal.name}</h3>
          </div>
          <span
            className={`soft-badge max-w-[120px] px-2 py-1 text-center text-[11px] leading-tight ${statusClassName(goal.status)}`}
          >
            {visibleStatus}
          </span>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between text-slate-600">
            <span>Indicators</span>
            <span className="font-semibold text-slate-900">{goal.indicatorCount}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>Target progress</span>
            <span className="font-semibold text-slate-900">{formatPercent(goal.targetProgressPercent)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>Analyzable indicators</span>
            <span className="font-semibold text-slate-900">{goal.analyzableCount}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${safeProgress}%`, backgroundColor: goal.color }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
