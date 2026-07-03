import Image from 'next/image';

interface RwandaSdgSummaryCardProps {
  averageTargetProgress: number;
  projectedOnTrackRate: number;
  onTrack: number;
  moderate: number;
  needsAttention: number;
}

export function RwandaSdgSummaryCard({
  averageTargetProgress,
  projectedOnTrackRate,
  onTrack,
  moderate,
  needsAttention
}: RwandaSdgSummaryCardProps): JSX.Element {
  return (
    <div className="panel border border-slate-200 bg-gradient-to-br from-rwNavy to-rwBlue p-5 text-white">
      <div className="flex items-center gap-2">
        <Image
          src="/brand/rwanda-flag.svg"
          alt="Flag of Rwanda"
          width={18}
          height={12}
          className="rounded-[2px] border border-white/30"
        />
        <Image
          src="/brand/sdg-wheel.png"
          alt="United Nations Sustainable Development Goals wheel"
          width={14}
          height={14}
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
        <div className="rounded-xl bg-white/10 p-3">
          <p className="text-xs text-white/75">On track</p>
          <p className="font-heading text-2xl font-semibold">{onTrack}</p>
        </div>
        <div className="rounded-xl bg-white/10 p-3">
          <p className="text-xs text-white/75">Moderate progress</p>
          <p className="font-heading text-2xl font-semibold">{moderate}</p>
        </div>
        <div className="rounded-xl bg-white/10 p-3">
          <p className="text-xs text-white/75">Needs attention</p>
          <p className="font-heading text-2xl font-semibold">{needsAttention}</p>
        </div>
      </div>

      <div className="mt-3 text-xs text-white/80">
        Projected on-track rate by 2030: <span className="font-semibold">{Math.round(projectedOnTrackRate)}%</span>
      </div>
    </div>
  );
}
