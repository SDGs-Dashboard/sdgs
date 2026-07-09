import Image from 'next/image';
import Link from 'next/link';

import { withBasePath } from '../utils/site';
import type { ProgressStatus } from '../utils/types';

interface RwandaSdgSummaryCardProps {
  averageTargetProgress: number;
  projectedOnTrackRate: number;
  onTrack: number;
  moderate: number;
  needsAttention: number;
}

const progressLinks: Array<{ label: ProgressStatus; valueKey: 'onTrack' | 'moderate' | 'needsAttention' }> = [
  { label: 'On track', valueKey: 'onTrack' },
  { label: 'Moderate progress', valueKey: 'moderate' },
  { label: 'Needs attention', valueKey: 'needsAttention' }
];

export function RwandaSdgSummaryCard({
  averageTargetProgress,
  projectedOnTrackRate,
  onTrack,
  moderate,
  needsAttention
}: RwandaSdgSummaryCardProps): JSX.Element {
  const values = {
    onTrack,
    moderate,
    needsAttention
  };

  return (
    <div className="panel border border-slate-200 bg-gradient-to-br from-rwNavy to-rwBlue p-5 text-white">
      <div className="flex items-center gap-3">
        <Image
          src={withBasePath('/brand/rwanda-flag.svg')}
          alt="Flag of Rwanda"
          width={54}
          height={36}
          className="h-8 w-auto rounded-[3px] border border-white/30 shadow-sm"
        />
        <Image
          src={withBasePath('/brand/sdg-wheel.png')}
          alt="United Nations Sustainable Development Goals wheel"
          width={36}
          height={36}
          className="h-9 w-9"
        />
        <p className="text-xs uppercase tracking-[0.22em] text-white/70">National SDG Progress Snapshot</p>
      </div>
      <h3 className="mt-2 font-heading text-2xl font-semibold">
        {Math.round(averageTargetProgress)}% average target progress
      </h3>
      <p className="mt-1 max-w-lg text-sm text-white/85">
        Trajectory analysis estimates whether current indicator trends are sufficient to reach inferred SDG targets by
        2030.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {progressLinks.map((item) => (
          <Link
            key={item.label}
            href={{ pathname: '/indicators', query: { status: item.label } }}
            className="group rounded-xl bg-white/10 p-3 transition hover:-translate-y-0.5 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/80"
            aria-label={`Explore ${item.label.toLowerCase()} indicators`}
          >
            <p className="text-xs text-white/75">{item.label}</p>
            <p className="font-heading text-2xl font-semibold">{values[item.valueKey]}</p>
            <p className="mt-1 text-[11px] font-medium text-white/70 opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">
              Explore indicators →
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-3 text-xs text-white/80">
        Projected on-track rate by 2030: <span className="font-semibold">{Math.round(projectedOnTrackRate)}%</span>
      </div>
    </div>
  );
}
