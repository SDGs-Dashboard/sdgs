const CLASS_MAP: Record<string, string> = {
  uploaded: 'bg-sky-100 text-sky-800',
  processing: 'bg-amber-100 text-amber-800',
  extracted: 'bg-emerald-100 text-emerald-800',
  needs_review: 'bg-rose-100 text-rose-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-slate-200 text-slate-700',
  failed: 'bg-rose-100 text-rose-800',
  draft: 'bg-violet-100 text-violet-800',
  pending: 'bg-amber-100 text-amber-800',
  ready: 'bg-emerald-100 text-emerald-800',
  processed: 'bg-emerald-100 text-emerald-800',
  'pending review': 'bg-amber-100 text-amber-800',
  'not started': 'bg-slate-200 text-slate-700'
};

export function StatusBadge({ status }: { status: string }): JSX.Element {
  const normalized = String(status || '').trim().toLowerCase().replaceAll('-', ' ').replaceAll('_', ' ');
  return <span className={`soft-badge ${CLASS_MAP[normalized] || 'bg-slate-100 text-slate-700'}`}>{normalized || 'unknown'}</span>;
}
