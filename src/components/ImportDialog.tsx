import { useMemo, useState } from 'react';
import { autoMap, CSV_TEMPLATE, FIELDS, missingRequired, type Mapping } from '../data/import/fields';
import { jsonTemplate, parseFile, type ParsedFile } from '../data/import/parse';
import { importRows, type ImportMode } from '../data/import/rows';
import type { Dataset } from '../domain/types';
import { downloadText } from '../export/download';
import { Modal } from './Modal';

interface Props {
  current: Dataset;
  timeZone: string;
  onClose: () => void;
  onImport: (dataset: Dataset, label: string, mode: ImportMode) => void;
}

export function ImportDialog({ current, timeZone, onClose, onImport }: Props) {
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [mode, setMode] = useState<ImportMode>('add');

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const p = parseFile(file.name, text);
    setFileName(file.name);
    setParsed(p);
    setMapping(p.kind === 'rows' ? autoMap(p.headers) : null);
    if (p.kind === 'dataset') setMode('replace');
  };

  const missing = mapping ? missingRequired(mapping) : [];
  const dataRows = parsed?.kind === 'rows' ? parsed.rows.filter((r) => Object.values(r).some((v) => String(v ?? '').trim())).length : 0;
  const result = useMemo(() => {
    if (parsed?.kind !== 'rows' || !mapping || missing.length) return null;
    const res = importRows(parsed.rows, mapping, current, { timeZone, mode });
    return { ...res, errors: [...parsed.errors, ...res.errors].sort((a, b) => a.line - b.line) };
  }, [parsed, mapping, current, timeZone, mode, missing.length]);

  const rejectedRows = result ? new Set(result.errors.map((e) => e.line)).size : 0;
  const canImport = (result && result.imported > 0) || (parsed?.kind === 'dataset' && parsed.dataset.releases.length > 0);
  const doImport = () => {
    if (result) onImport(result.dataset, `Import ${result.imported} release${result.imported === 1 ? '' : 's'} from ${fileName}`, mode);
    else if (parsed?.kind === 'dataset') onImport(parsed.dataset, `Import ${fileName}`, 'replace');
    onClose();
  };
  const sample = (header: string | null) => (header && parsed?.kind === 'rows' ? (parsed.rows.find((r) => r[header]?.trim())?.[header] ?? '') : '');

  return (
    <Modal
      title="Import a schedule"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!canImport} onClick={doImport}>
            {result ? `Import ${result.imported} release${result.imported === 1 ? '' : 's'}` : 'Import'}
          </button>
        </>
      }
    >
      <ol className="space-y-6">
        <li>
          <h3 className="font-cond text-lg font-semibold">1. Choose a CSV or JSON file</h3>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">
            One row per release. Times without an offset are read in {timeZone.replace(/_/g, ' ')}. Start from a template if you are unsure of the
            columns.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="btn btn-primary cursor-pointer">
              Choose file
              <input type="file" accept=".csv,.json,text/csv,application/json" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <button type="button" className="btn" onClick={() => downloadText('release-schedule-template.csv', 'text/csv', CSV_TEMPLATE)}>
              Download CSV template
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => downloadText('release-schedule-template.json', 'application/json', JSON.stringify(jsonTemplate(), null, 2))}
            >
              Download JSON template
            </button>
          </div>
          {fileName && <p className="mt-2 text-sm">Selected: {fileName}</p>}
          {parsed?.kind === 'error' && (
            <p role="alert" className="mt-2 rounded border border-alert/50 bg-alert-tint p-2 text-sm text-alert">
              {parsed.message}
            </p>
          )}
        </li>

        {parsed?.kind === 'rows' && mapping && (
          <li>
            <h3 className="font-cond text-lg font-semibold">2. Match your columns</h3>
            <p className="mt-1 text-sm text-ink-soft">
              {dataRows} row{dataRows === 1 ? '' : 's'} found. Columns were matched by name; change any that are wrong.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`map-${f.key}`} className="label">
                    {f.label}
                    {f.required && <span className="ml-1 text-alert">(required)</span>}
                  </label>
                  <select
                    id={`map-${f.key}`}
                    className="field"
                    value={mapping[f.key] ?? ''}
                    aria-describedby={`map-${f.key}-help`}
                    onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}
                  >
                    <option value="">Not in file</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  <p id={`map-${f.key}-help`} className="mt-0.5 truncate text-xs text-ink-soft">
                    {mapping[f.key] ? `e.g. ${sample(mapping[f.key]) || '(empty)'}` : f.help}
                  </p>
                </div>
              ))}
            </div>
            {missing.length > 0 && (
              <p role="alert" className="mt-3 text-sm text-alert">
                Match a column to {missing.join(', ')} to continue.
              </p>
            )}
          </li>
        )}

        {(result || parsed?.kind === 'dataset') && (
          <li>
            <h3 className="font-cond text-lg font-semibold">3. Review</h3>
            {parsed?.kind === 'rows' ? (
              <fieldset className="mt-2 flex flex-wrap gap-4 text-sm">
                <legend className="sr-only">Import mode</legend>
                <label className="flex min-h-[44px] items-center gap-2">
                  <input type="radio" name="mode" checked={mode === 'add'} onChange={() => setMode('add')} className="h-5 w-5" />
                  Add to current data (rows with a matching ID are updated)
                </label>
                <label className="flex min-h-[44px] items-center gap-2">
                  <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} className="h-5 w-5" />
                  Replace current data
                </label>
              </fieldset>
            ) : (
              <p className="mt-2 text-sm">This file is a full schedule. Importing it replaces the current data. You can undo afterwards.</p>
            )}
            {result && (
              <p className="mt-2 text-sm" aria-live="polite">
                <strong>{result.imported}</strong> row{result.imported === 1 ? '' : 's'} ready to import
                {rejectedRows > 0 && (
                  <>
                    , <strong className="text-alert">{rejectedRows}</strong> rejected
                  </>
                )}
                .
              </p>
            )}
            {parsed?.kind === 'dataset' && (
              <p className="mt-2 text-sm">
                <strong>{parsed.dataset.releases.length}</strong> releases, {parsed.dataset.windows.length} windows, {parsed.dataset.teams.length} teams.
              </p>
            )}
            {(result?.errors.length || (parsed?.kind === 'dataset' && parsed.errors.length)) ? (
              <div className="mt-2 rounded border border-alert/40 bg-alert-tint p-3">
                <h4 className="text-sm font-semibold text-alert">Rejected rows</h4>
                <ul className="mt-1 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm">
                  {(result ? result.errors.map((e) => e.message) : parsed?.kind === 'dataset' ? parsed.errors : []).map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </li>
        )}
      </ol>
    </Modal>
  );
}
