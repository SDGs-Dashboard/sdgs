export function LoadingState({ message = 'Loading dashboard data...' }: { message?: string }): JSX.Element {
  return (
    <div className="panel flex items-center gap-3 px-5 py-4">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-rwBlue" />
      <p className="text-sm text-slate-600">{message}</p>
    </div>
  );
}

