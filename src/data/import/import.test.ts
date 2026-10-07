import { describe, expect, it } from 'vitest';
import { emptyDataset } from '../../domain/types';
import { evaluate } from '../../engine/evaluate';
import { generateSeed } from '../seed/generate';
import { autoMap, CSV_TEMPLATE, FIELDS, missingRequired } from './fields';
import { jsonTemplate, parseCsv, parseFile, parseJson } from './parse';
import { importRows, parseWhen } from './rows';

const NY = 'America/New_York';

function runCsv(csv: string, opts: { mode?: 'add' | 'replace'; base?: ReturnType<typeof emptyDataset>; timeZone?: string } = {}) {
  const parsed = parseCsv(csv);
  if (parsed.kind !== 'rows') throw new Error(parsed.kind);
  return importRows(parsed.rows, autoMap(parsed.headers), opts.base ?? emptyDataset(), { timeZone: opts.timeZone ?? NY, mode: opts.mode ?? 'replace' });
}

const HEAD = 'title,team,product,environment,start,end,change_class,rollback_plan,test_plan';

describe('import: template', () => {
  it('the downloadable CSV template auto-maps every field and imports cleanly', () => {
    const parsed = parseCsv(CSV_TEMPLATE);
    expect(parsed.kind).toBe('rows');
    if (parsed.kind !== 'rows') return;
    const mapping = autoMap(parsed.headers);
    expect(Object.values(mapping).every(Boolean)).toBe(true);
    expect(Object.keys(mapping)).toHaveLength(FIELDS.length);
    const res = importRows(parsed.rows, mapping, emptyDataset(), { timeZone: NY, mode: 'replace' });
    expect(res.errors).toEqual([]);
    expect(res.imported).toBe(3);
    expect(res.dataset.teams.map((t) => t.name).sort()).toEqual(['Order Management', 'Web']);
    expect(res.dataset.environments.map((e) => e.kind).sort()).toEqual(['prod', 'staging-uat']);
    expect(res.dataset.dependencies).toEqual([{ releaseId: 'REL-102', dependsOnReleaseId: 'REL-101' }]);
  });

  it('interprets local times in the chosen zone, keeps explicit offsets, and makes all-day ends exclusive', () => {
    const { dataset } = runCsv(CSV_TEMPLATE);
    const r = (id: string) => dataset.releases.find((x) => x.id === id)!;
    expect(r('REL-101').startAt).toBe('2026-03-10T13:00:00.000Z'); // 09:00 New York (EDT) = 13:00Z
    expect(r('REL-102').startAt).toBe('2026-03-14T14:00:00.000Z');
    expect(r('REL-103')).toMatchObject({ allDay: true, startAt: '2026-03-16', endAt: '2026-03-17' });
  });

  it('the JSON template is a valid dataset with windows', () => {
    const t = jsonTemplate();
    const parsed = parseJson(JSON.stringify(t));
    expect(parsed).toMatchObject({ kind: 'dataset', errors: [] });
    expect(t.windows.map((w) => w.kind).sort()).toEqual(['blackout', 'freeze', 'maintenance']);
    expect(() => evaluate(t, { timeZone: NY })).not.toThrow();
  });
});

describe('import: bad rows are rejected with clear messages', () => {
  const csv = [
    HEAD,
    'Good one,Web,Storefront,prod,2026-03-10 09:00,2026-03-10 10:00,standard,,',
    ',Web,Storefront,prod,2026-03-10 09:00,2026-03-10 10:00,standard,,',
    'Bad env,Web,Storefront,moon,2026-03-10 09:00,2026-03-10 10:00,standard,,',
    'Bad date,Web,Storefront,dev,10/03/2026,2026-03-10 10:00,standard,,',
    'Backwards,Web,Storefront,dev,2026-03-10 12:00,2026-03-10 10:00,standard,,',
    'Bad class,Web,Storefront,dev,2026-03-10 09:00,2026-03-10 10:00,urgent,,',
    'Impossible day,Web,Storefront,dev,2026-02-30,2026-03-01,standard,,',
  ].join('\n');
  const res = runCsv(csv);

  it('imports the valid row and rejects each bad row', () => {
    expect(res.imported).toBe(1);
    expect(res.dataset.releases.map((r) => r.title)).toEqual(['Good one']);
  });

  it('names the line and the exact problem', () => {
    expect(res.errors.map((e) => e.message)).toEqual([
      'Row 3: title is empty.',
      'Row 4: environment "moon" is not dev, staging/UAT, or prod.',
      'Row 5: start "10/03/2026" is not a date (use 2026-03-10T14:00Z, 2026-03-10 09:00, or 2026-03-10).',
      'Row 6: end "2026-03-10 10:00" is not after start "2026-03-10 12:00".',
      'Row 7: change class "urgent" is not standard, normal, or emergency.',
      'Row 8: start "2026-02-30" is not a date (use 2026-03-10T14:00Z, 2026-03-10 09:00, or 2026-03-10).',
    ]);
  });

  it('rejects unknown dependencies and duplicate IDs', () => {
    const r = runCsv(
      [
        'id,' + HEAD,
        'A,One,Web,Storefront,dev,2026-03-10 09:00,2026-03-10 10:00,standard,,',
        'A,Two,Web,Storefront,dev,2026-03-11 09:00,2026-03-11 10:00,standard,,',
      ].join('\n') + '\n',
    );
    expect(r.errors.map((e) => e.message)).toEqual(['Row 3: ID "A" appears on more than one row.']);
    const parsed = parseCsv('title,team,product,environment,start,end,depends_on\nX,Web,S,dev,2026-03-10 09:00,2026-03-10 10:00,Ghost\n');
    if (parsed.kind !== 'rows') throw new Error();
    const d = importRows(parsed.rows, autoMap(parsed.headers), emptyDataset(), { timeZone: NY, mode: 'replace' });
    expect(d.errors[0]!.message).toBe('Row 2: depends on "Ghost", which is not in the file or the current data.');
  });

  it('reports every problem on a row at once', () => {
    const r = runCsv(`${HEAD}\n,,,,,,,,\nx,,p,dev,2026-03-10 09:00,2026-03-10 10:00,,,\n`);
    // A fully blank row is skipped but still counted, so row numbers match the spreadsheet.
    expect(r.errors.map((e) => e.message)).toEqual(['Row 3: team is empty.']);
    const multi = runCsv(`${HEAD}\n,,,moon,soon,later,odd,,\n`);
    expect(multi.errors.map((e) => e.message)).toEqual([
      'Row 2: title is empty; team is empty; product is empty; environment "moon" is not dev, staging/UAT, or prod; start "soon" is not a date (use 2026-03-10T14:00Z, 2026-03-10 09:00, or 2026-03-10); end "later" is not a date (use 2026-03-10T14:00Z, 2026-03-10 09:00, or 2026-03-10); change class "odd" is not standard, normal, or emergency.',
    ]);
  });
});

describe('import: mapping and modes', () => {
  it('auto-maps common header spellings and lists unmapped required fields', () => {
    const m = autoMap(['Release Name', 'Squad', 'Service', 'Env', 'Start Time', 'End Time', 'Backout Plan']);
    expect(m).toMatchObject({ title: 'Release Name', team: 'Squad', product: 'Service', environment: 'Env', start: 'Start Time', end: 'End Time', rollbackPlan: 'Backout Plan' });
    expect(missingRequired(m)).toEqual([]);
    expect(missingRequired(autoMap(['title']))).toEqual(['Team', 'Product', 'Environment', 'Start', 'End']);
  });

  it('honours a manual mapping for unrecognised headers', () => {
    const parsed = parseCsv('Thing,Group,Svc,Where,From,Until\nA,Web,S,production,2026-03-10T14:00Z,2026-03-10T15:00Z\n');
    if (parsed.kind !== 'rows') throw new Error();
    const mapping = { ...autoMap(parsed.headers), title: 'Thing', team: 'Group', product: 'Svc', environment: 'Where', end: 'Until' };
    const res = importRows(parsed.rows, mapping, emptyDataset(), { timeZone: NY, mode: 'replace' });
    expect(res.errors).toEqual([]);
    expect(res.dataset.releases[0]).toMatchObject({ title: 'A', startAt: '2026-03-10T14:00:00.000Z' });
  });

  it('adds to existing data, reusing teams and environments by name, and updates rows by ID', () => {
    const base = generateSeed({ anchor: new Date('2026-10-07T12:00:00Z') });
    const res = runCsv(
      `id,${HEAD}\nrel-p8-data-stg,Data Lake Pipelines schema v9 → Staging/UAT,Data Platform,Data Lake Pipelines,staging,2026-12-01 09:00,2026-12-01 10:00,normal,Restore snapshot,Row counts\nNEW-1,Brand new,Data Platform,Data Lake Pipelines,dev,2026-12-02 09:00,2026-12-02 10:00,standard,,\n`,
      { mode: 'add', base },
    );
    expect(res.errors).toEqual([]);
    expect(res.dataset.releases).toHaveLength(base.releases.length + 1);
    expect(res.dataset.teams).toHaveLength(15);
    expect(res.dataset.environments).toHaveLength(3);
    expect(res.dataset.changeRequests.find((c) => c.releaseId === 'rel-p8-data-stg')!.rollbackPlan).toBe('Restore snapshot');
    expect(base.releases.find((r) => r.id === 'rel-p8-data-stg')!.startAt).not.toBe('2026-12-01T14:00:00.000Z'); // input untouched
  });

  it('replace mode starts from empty', () => {
    const base = generateSeed({ anchor: new Date('2026-10-07T12:00:00Z') });
    const res = runCsv(CSV_TEMPLATE, { mode: 'replace', base });
    expect(res.dataset.releases).toHaveLength(3);
    expect(res.dataset.windows).toEqual([]);
  });
});

describe('import: files and JSON', () => {
  it('rejects unsupported files and malformed JSON with a reason', () => {
    expect(parseFile('plan.xlsx', '')).toEqual({ kind: 'error', message: '"plan.xlsx" is not a .csv or .json file.' });
    expect(parseFile('x.json', '{oops')).toMatchObject({ kind: 'error', message: expect.stringContaining('not valid JSON') });
    expect(parseFile('x.json', '42')).toMatchObject({ kind: 'error' });
    expect(parseFile('x.csv', '')).toMatchObject({ kind: 'error', message: expect.stringContaining('header row') });
  });

  it('treats a JSON array of objects as rows for the mapping step', () => {
    const parsed = parseFile('x.json', JSON.stringify([{ title: 'A', team: 'T', product: 'P', environment: 'dev', start: '2026-03-10T14:00Z', end: '2026-03-10T15:00Z', config_items: ['DB', 'App'] }]));
    expect(parsed).toMatchObject({ kind: 'rows', rows: [{ config_items: 'DB; App' }] });
  });

  it('validates a full dataset JSON and drops bad releases with reasons', () => {
    const ds = generateSeed({ anchor: new Date('2026-10-07T12:00:00Z') });
    const broken = {
      ...ds,
      releases: [...ds.releases, { ...ds.releases[0]!, id: 'x1', productId: 'nope' }, { ...ds.releases[0]!, id: 'x2', endAt: ds.releases[0]!.startAt }],
    };
    const parsed = parseJson(JSON.stringify(broken));
    expect(parsed.kind).toBe('dataset');
    if (parsed.kind !== 'dataset') return;
    expect(parsed.dataset.releases).toHaveLength(ds.releases.length);
    expect(parsed.errors).toEqual([
      'releases[60] ("x1") refers to unknown product "nope".',
      'releases[61] ("x2") has an invalid or empty time range.',
    ]);
  });

  it('round-trips the seed through JSON with identical conflicts', () => {
    const ds = generateSeed({ anchor: new Date('2026-10-07T12:00:00Z') });
    const parsed = parseJson(JSON.stringify(ds));
    if (parsed.kind !== 'dataset') throw new Error();
    expect(parsed.errors).toEqual([]);
    const ids = (d: typeof ds) => evaluate(d, { timeZone: 'UTC', withSuggestions: false }).map((c) => c.id);
    expect(ids(parsed.dataset)).toEqual(ids(ds));
  });
});

describe('parseWhen', () => {
  it('accepts the documented formats only', () => {
    expect(parseWhen('2026-03-10T14:00:00Z', 'UTC')).toEqual({ kind: 'instant', ms: Date.parse('2026-03-10T14:00:00Z') });
    expect(parseWhen('2026-03-10T09:00-05:00', 'UTC')).toEqual({ kind: 'instant', ms: Date.parse('2026-03-10T14:00:00Z') });
    expect(parseWhen('2026-03-10 09:00', 'Asia/Kolkata')).toEqual({ kind: 'instant', ms: Date.parse('2026-03-10T03:30:00Z') });
    expect(parseWhen('2026-03-10', 'UTC')).toEqual({ kind: 'date', date: '2026-03-10' });
    expect(parseWhen('2026-03-10T09:00', 'America/New_York')).toEqual({ kind: 'instant', ms: Date.parse('2026-03-10T13:00:00Z') });
    for (const bad of ['10/03/2026', 'tomorrow', '2026-13-01', '2026-03-10 25:00', '2026-03-10T14:00+5']) {
      expect(parseWhen(bad, 'UTC').kind, bad).toBe('invalid');
    }
  });
});
