interface TablePreviewProps {
  title: string;
  grid: string[][];
}

export function TablePreview({ title, grid }: TablePreviewProps): JSX.Element {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-xs text-slate-700">
          <tbody>
            {grid.length ? (
              grid.map((row, rowIndex) => (
                <tr key={`${title}-${rowIndex}`} className="border-t border-slate-100">
                  {row.map((cell, cellIndex) => (
                    <td key={`${title}-${rowIndex}-${cellIndex}`} className="whitespace-nowrap px-3 py-2">
                      {cell || '-'}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-4 text-slate-500">No raw preview available for this table.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
