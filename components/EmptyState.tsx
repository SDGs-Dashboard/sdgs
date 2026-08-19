// Standard empty-state message used when a chart/table has no publishable data yet.
interface EmptyStateProps {
  title: string;
  message: string;
}

export function EmptyState({ title, message }: EmptyStateProps): JSX.Element {
  return (
    <div className="panel border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
      <h3 className="font-heading text-lg font-semibold text-slate-800">{title}</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">{message}</p>
    </div>
  );
}
