import Papa from 'papaparse';
import { isValidTimed } from '../../domain/time';
import type { Dataset } from '../../domain/types';
import { emptyDataset } from '../../domain/types';
import { autoMap, CSV_TEMPLATE } from './fields';
import { importRows, type RowError } from './rows';

export type ParsedFile =
  | { kind: 'rows'; headers: string[]; rows: Record<string, string>[]; errors: RowError[] }
  | { kind: 'dataset'; dataset: Dataset; errors: string[] }
  | { kind: 'error'; message: string };

export function parseCsv(text: string): ParsedFile {
  const res = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
    header: true,
    // Keep blank lines so row numbers match the spreadsheet; the importer skips empty rows.
    skipEmptyLines: false,
    transformHeader: (h) => h.trim(),
  });
  const headers = (res.meta.fields ?? []).filter(Boolean);
  if (!headers.length) return { kind: 'error', message: 'The file has no header row. The first line must name the columns.' };
  const errors = res.errors
    // Short rows are reported by the importer as the specific fields that are empty.
    .filter((e) => e.code !== 'UndetectableDelimiter' && e.code !== 'TooFewFields')
    .map((e) => ({ line: (e.row ?? 0) + 2, message: `Row ${(e.row ?? 0) + 2}: ${e.message}.` }));
  return { kind: 'rows', headers, rows: res.data, errors };
}

export function parseJson(text: string): ParsedFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { kind: 'error', message: `This is not valid JSON: ${(e as Error).message}` };
  }
  if (Array.isArray(data)) {
    if (!data.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      return { kind: 'error', message: 'A JSON array must contain one object per release.' };
    }
    const rows = (data as Record<string, unknown>[]).map((o) =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v)])),
    );
    const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    return { kind: 'rows', headers, rows, errors: [] };
  }
  if (data && typeof data === 'object' && Array.isArray((data as Dataset).releases)) {
    return validateDataset(data as Partial<Dataset>);
  }
  return { kind: 'error', message: 'Expected either an array of releases or a dataset object with a "releases" list.' };
}

export function parseFile(name: string, text: string): ParsedFile {
  if (/\.json$/i.test(name)) return parseJson(text);
  if (/\.(csv|txt)$/i.test(name)) return parseCsv(text);
  return { kind: 'error', message: `"${name}" is not a .csv or .json file.` };
}

/** Structural and referential checks for a full dataset. Bad releases are dropped with a reason. */
export function validateDataset(input: Partial<Dataset>): ParsedFile {
  const ds: Dataset = { ...emptyDataset(), ...input };
  for (const key of Object.keys(emptyDataset()) as (keyof Dataset)[]) {
    if (!Array.isArray(ds[key])) return { kind: 'error', message: `"${key}" must be a list.` };
  }
  const errors: string[] = [];
  const products = new Set(ds.products.map((p) => p.id));
  const envs = new Set(ds.environments.map((e) => e.id));
  const teams = new Set(ds.teams.map((t) => t.id));
  for (const p of ds.products) if (!teams.has(p.teamId)) errors.push(`Product "${p.name}" refers to unknown team "${p.teamId}".`);
  for (const e of ds.environments) {
    if (!['dev', 'staging-uat', 'prod'].includes(e.kind)) errors.push(`Environment "${e.name}" has kind "${e.kind}"; use dev, staging-uat, or prod.`);
  }
  const ids = new Set<string>();
  const releases = ds.releases.filter((r, i) => {
    const where = `releases[${i}]${r?.id ? ` ("${r.id}")` : ''}`;
    const problems: string[] = [];
    if (!r || typeof r !== 'object') problems.push('is not an object');
    else {
      if (!r.id) problems.push('has no id');
      else if (ids.has(r.id)) problems.push('repeats an id');
      if (!r.title) problems.push('has no title');
      if (!products.has(r.productId)) problems.push(`refers to unknown product "${r.productId}"`);
      if (!envs.has(r.environmentId)) problems.push(`refers to unknown environment "${r.environmentId}"`);
      if (!['standard', 'normal', 'emergency'].includes(r.changeClass)) problems.push(`has change class "${r.changeClass}"`);
      if (!['planned', 'approved', 'in-progress', 'completed', 'cancelled'].includes(r.status)) problems.push(`has status "${r.status}"`);
      if (typeof r.startAt !== 'string' || typeof r.endAt !== 'string' || !isValidTimed(r)) problems.push('has an invalid or empty time range');
    }
    if (problems.length) {
      errors.push(`${where} ${problems.join(', ')}.`);
      return false;
    }
    ids.add(r.id);
    return true;
  });
  const windows = ds.windows.filter((w, i) => {
    if (!['blackout', 'freeze', 'maintenance'].includes(w.kind) || !isValidTimed(w)) {
      errors.push(`windows[${i}] ("${w.id ?? '?'}") needs kind blackout, freeze, or maintenance and a valid time range.`);
      return false;
    }
    if (!w.scope) w.scope = {};
    return true;
  });
  const dependencies = ds.dependencies.filter((d) => {
    const ok = ids.has(d.releaseId) && ids.has(d.dependsOnReleaseId);
    if (!ok) errors.push(`Dependency ${d.releaseId} → ${d.dependsOnReleaseId} refers to a missing release.`);
    return ok;
  });
  return {
    kind: 'dataset',
    dataset: { ...ds, releases, windows, dependencies, changeRequests: ds.changeRequests.filter((c) => ids.has(c.releaseId)) },
    errors,
  };
}

/** The CSV template converted to a full dataset, plus example guardrail windows. */
export function jsonTemplate(): Dataset {
  const parsed = parseCsv(CSV_TEMPLATE);
  if (parsed.kind !== 'rows') throw new Error('template');
  const { dataset } = importRows(parsed.rows, autoMap(parsed.headers), emptyDataset(), { timeZone: 'UTC', mode: 'replace' });
  const prod = dataset.environments.find((e) => e.kind === 'prod')!.id;
  dataset.windows = [
    { id: 'win-maint-1', kind: 'maintenance', name: 'Saturday maintenance', scope: { environmentIds: [prod] }, startAt: '2026-03-14T13:00:00.000Z', endAt: '2026-03-14T21:00:00.000Z' },
    { id: 'win-freeze-1', kind: 'freeze', name: 'Code freeze', scope: {}, allDay: true, startAt: '2026-03-23', endAt: '2026-03-25' },
    { id: 'win-blackout-1', kind: 'blackout', name: 'Month-end close', scope: { environmentIds: [prod] }, allDay: true, startAt: '2026-03-30', endAt: '2026-04-01' },
  ];
  return dataset;
}
