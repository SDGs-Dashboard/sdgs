import { formatDateLabel } from '../utils/format';
import { IndicatorMetadata } from '../utils/types';

interface MetadataPanelProps {
  metadata: IndicatorMetadata;
}

export function MetadataPanel({ metadata }: MetadataPanelProps): JSX.Element {
  return (
    <div className="panel border border-slate-200 p-5">
      <h3 className="font-heading text-lg font-semibold text-slate-900">Metadata</h3>

      <dl className="mt-3 space-y-3 text-sm">
        <div>
          <dt className="font-medium text-slate-500">Indicator definition</dt>
          <dd className="mt-1 text-slate-700">{metadata.indicatorDefinition ?? 'Not available'}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Target</dt>
          <dd className="mt-1 text-slate-700">{metadata.targetName ?? 'Not available'}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Computation units</dt>
          <dd className="mt-1 text-slate-700">{metadata.computationUnits ?? 'Not available'}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Data last updated</dt>
          <dd className="mt-1 text-slate-700">{formatDateLabel(metadata.dataLastUpdated ?? null)}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Metadata last updated</dt>
          <dd className="mt-1 text-slate-700">{formatDateLabel(metadata.metadataLastUpdated ?? null)}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Source</dt>
          <dd className="mt-1 text-slate-700">{metadata.sourceOrganisation ?? 'Not available'}</dd>
          {metadata.sourceUrl && (
            <a
              href={metadata.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-rwBlue hover:underline"
            >
              {metadata.sourceUrlText || 'Open source link'}
            </a>
          )}
        </div>
      </dl>

      {metadata.body && (
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
          {metadata.body}
        </div>
      )}
    </div>
  );
}

