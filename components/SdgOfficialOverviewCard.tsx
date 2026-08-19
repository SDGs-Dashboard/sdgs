// Compact SDG goal card used on the National Overview page.
// It keeps official SDG imagery prominent while showing a lightweight progress summary.
import Image from 'next/image';
import Link from 'next/link';

import { goalProgressLabel, progressStatusColor, publicStatusLabel, statusClassName } from '../utils/format';
import { withBasePath } from '../utils/site';
import { GoalSummary } from '../utils/types';

interface SdgOfficialOverviewCardProps {
  goal: GoalSummary;
}

export function SdgOfficialOverviewCard({ goal }: SdgOfficialOverviewCardProps): JSX.Element {
  // Clamp visual progress to avoid overflowing the card if a goal exceeds 100%.
  const safeProgress = Math.max(0, Math.min(100, goal.targetProgressPercent));
  const visibleStatus = publicStatusLabel(goal.status);

  return (
    <Link
      href={`/indicators?goal=${goal.goal}`}
      className="panel group block border border-slate-200 p-2.5 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-card"
    >
      <div className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <Image
          src={withBasePath(`/sdg-goals/en/${goal.goal}.png`)}
          alt={`SDG ${goal.goal}: ${goal.name}`}
          fill
          className="object-contain p-1 transition-transform duration-200 group-hover:scale-[1.01]"
          sizes="(max-width: 768px) 46vw, (max-width: 1280px) 30vw, 16vw"
        />
      </div>

      <div className="mt-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">SDG {goal.goal}</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{goal.shortName}</p>
        </div>
        <span
          className={`soft-badge max-w-[115px] px-2 py-1 text-center text-[11px] leading-tight ${statusClassName(goal.status)}`}
        >
          {visibleStatus}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
        <span>{goal.indicatorCount} indicators</span>
        <span className="max-w-[120px] text-right text-[11px] font-semibold leading-tight text-slate-700">
          {goalProgressLabel(goal)}
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${safeProgress}%`, backgroundColor: progressStatusColor(goal.status) }}
        />
      </div>
    </Link>
  );
}
