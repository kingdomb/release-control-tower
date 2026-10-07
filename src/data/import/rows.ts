import { DAY, iso, parseDateOnly, zonedToUtc } from '../../domain/time';
import type { ChangeClass, ConfigItem, Dataset, Environment, EnvironmentKind, Release, ReleaseStatus } from '../../domain/types';
import type { FieldKey, Mapping } from './fields';

export interface RowError {
  /** Spreadsheet row number (the header is row 1). */
  line: number;
  message: string;
}

export interface ImportResult {
  dataset: Dataset;
  imported: number;
  errors: RowError[];
}

export type ImportMode = 'add' | 'replace';

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'item';

const ENV_ALIASES: Record<string, EnvironmentKind> = {
  dev: 'dev',
  development: 'dev',
  test: 'dev',
  int: 'dev',
  integration: 'dev',
  staging: 'staging-uat',
  stage: 'staging-uat',
  stg: 'staging-uat',
  uat: 'staging-uat',
  qa: 'staging-uat',
  preprod: 'staging-uat',
  'staging-uat': 'staging-uat',
  'staging/uat': 'staging-uat',
  prod: 'prod',
  production: 'prod',
  live: 'prod',
  prd: 'prod',
};
const ENV_NAMES: Record<EnvironmentKind, string> = { dev: 'Dev', 'staging-uat': 'Staging/UAT', prod: 'Production' };

const CLASSES: ChangeClass[] = ['standard', 'normal', 'emergency'];
const STATUSES: ReleaseStatus[] = ['planned', 'approved', 'in-progress', 'completed', 'cancelled'];

const LOCAL_DT = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::\d{2})?$/;
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

type Parsed = { kind: 'instant'; ms: number } | { kind: 'date'; date: string } | { kind: 'invalid' };

/** Accepts ISO instants with an offset, local "YYYY-MM-DD HH:mm" (in `timeZone`), or a plain date. */
export function parseWhen(raw: string, timeZone: string): Parsed {
  const v = raw.trim();
  if (parseDateOnly(v)) {
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? { kind: 'invalid' } : { kind: 'date', date: v };
  }
  const local = LOCAL_DT.exec(v);
  if (local && !HAS_ZONE.test(v)) {
    const [, y, m, d, h, mi] = local.map(Number) as number[];
    if (m! < 1 || m! > 12 || d! < 1 || d! > 31 || h! > 23 || mi! > 59) return { kind: 'invalid' };
    return { kind: 'instant', ms: zonedToUtc(y!, m!, d!, h!, mi!, timeZone) };
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(v) && HAS_ZONE.test(v)) {
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? { kind: 'invalid' } : { kind: 'instant', ms };
  }
  return { kind: 'invalid' };
}

const nextDate = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + DAY).toISOString().slice(0, 10);

/**
 * Turn mapped rows into releases (plus any teams, products, environments and configuration
 * items they name). Rows with problems are rejected individually with a message; valid rows
 * are imported. Pure: returns a new dataset.
 */
export function importRows(
  rows: Record<string, string>[],
  mapping: Mapping,
  base: Dataset,
  opts: { timeZone: string; mode: ImportMode; firstLine?: number },
): ImportResult {
  const start: Dataset =
    opts.mode === 'replace'
      ? { teams: [], products: [], environments: [], releases: [], dependencies: [], configItems: [], windows: [], bookings: [], changeRequests: [] }
      : structuredClone(base);
  const ds = start;
  const errors: RowError[] = [];
  const firstLine = opts.firstLine ?? 2;
  const get = (row: Record<string, string>, key: FieldKey) => {
    const col = mapping[key];
    return col ? String(row[col] ?? '').trim() : '';
  };
  const byName = <T extends { id: string; name: string }>(list: T[], name: string) =>
    list.find((x) => x.name.toLowerCase() === name.toLowerCase() || x.id === name);
  const uniqueId = (prefix: string, taken: Set<string>) => {
    let id = prefix;
    for (let i = 2; taken.has(id); i++) id = `${prefix}-${i}`;
    taken.add(id);
    return id;
  };
  const releaseIds = new Set(ds.releases.map((r) => r.id));

  // Pass 1: validate each row on its own and build the release.
  interface Pending {
    line: number;
    release: Release;
    dependsOn: string[];
    cis: string[];
    teamName: string;
    productName: string;
    envKind: EnvironmentKind;
    envLabel: string;
    cr: Record<'description' | 'impactRisk' | 'implementationPlan' | 'rollbackPlan' | 'testPlan', string>;
  }
  const pending: Pending[] = [];
  const seenIds = new Set<string>();

  rows.forEach((row, i) => {
    const line = firstLine + i;
    if (Object.values(row).every((v) => !String(v ?? '').trim())) return; // skip blank lines
    const problems: string[] = [];
    const title = get(row, 'title');
    const team = get(row, 'team');
    const product = get(row, 'product');
    const envRaw = get(row, 'environment');
    if (!title) problems.push('title is empty');
    if (!team) problems.push('team is empty');
    if (!product) problems.push('product is empty');
    const envKind = ENV_ALIASES[envRaw.toLowerCase()];
    if (!envRaw) problems.push('environment is empty');
    else if (!envKind) problems.push(`environment "${envRaw}" is not dev, staging/UAT, or prod`);

    const startRaw = get(row, 'start');
    const endRaw = get(row, 'end');
    const s = parseWhen(startRaw, opts.timeZone);
    const e = parseWhen(endRaw, opts.timeZone);
    if (!startRaw) problems.push('start is empty');
    else if (s.kind === 'invalid') problems.push(`start "${startRaw}" is not a date (use 2026-03-10T14:00Z, 2026-03-10 09:00, or 2026-03-10)`);
    if (!endRaw) problems.push('end is empty');
    else if (e.kind === 'invalid') problems.push(`end "${endRaw}" is not a date (use 2026-03-10T14:00Z, 2026-03-10 09:00, or 2026-03-10)`);

    const allDayRaw = get(row, 'allDay').toLowerCase();
    if (allDayRaw && !['true', 'false', 'yes', 'no', '1', '0', 'y', 'n'].includes(allDayRaw)) problems.push(`all day "${allDayRaw}" is not true or false`);
    const allDay = ['true', 'yes', '1', 'y'].includes(allDayRaw) || (s.kind === 'date' && e.kind === 'date');

    let startAt = '';
    let endAt = '';
    if (s.kind !== 'invalid' && e.kind !== 'invalid' && startRaw && endRaw) {
      if (allDay) {
        if (s.kind !== 'date' || e.kind !== 'date') problems.push('all-day rows need plain dates (YYYY-MM-DD) for start and end');
        else if (e.date < s.date) problems.push(`end ${e.date} is before start ${s.date}`);
        else {
          startAt = s.date;
          endAt = nextDate(e.date);
        }
      } else if (s.kind === 'date' || e.kind === 'date') {
        problems.push('mixes a date with a date-time; give both a time, or mark the row all day');
      } else if (e.ms <= s.ms) {
        problems.push(`end "${endRaw}" is not after start "${startRaw}"`);
      } else {
        startAt = iso(s.ms);
        endAt = iso(e.ms);
      }
    }

    const classRaw = get(row, 'changeClass').toLowerCase();
    const changeClass = (classRaw || 'normal') as ChangeClass;
    if (!CLASSES.includes(changeClass)) problems.push(`change class "${classRaw}" is not standard, normal, or emergency`);
    const statusRaw = get(row, 'status').toLowerCase().replace(/\s+/g, '-');
    const status = (statusRaw || 'planned') as ReleaseStatus;
    if (!STATUSES.includes(status)) problems.push(`status "${get(row, 'status')}" is not one of ${STATUSES.join(', ')}`);

    const ownId = get(row, 'id');
    if (ownId && seenIds.has(ownId)) problems.push(`ID "${ownId}" appears on more than one row`);

    if (problems.length) {
      errors.push({ line, message: `Row ${line}: ${problems.join('; ')}.` });
      return;
    }
    if (ownId) seenIds.add(ownId);
    const split = (v: string) => v.split(/[;|]/).map((x) => x.trim()).filter(Boolean);
    pending.push({
      line,
      release: {
        id: ownId,
        productId: '',
        title,
        environmentId: '',
        status,
        changeClass,
        startAt,
        endAt,
        allDay: allDay || undefined,
      },
      dependsOn: split(get(row, 'dependsOn')),
      cis: split(get(row, 'configItems')),
      teamName: team,
      productName: product,
      envKind: envKind!,
      envLabel: envRaw,
      cr: {
        description: get(row, 'description'),
        impactRisk: get(row, 'impactRisk'),
        implementationPlan: get(row, 'implementationPlan'),
        rollbackPlan: get(row, 'rollbackPlan'),
        testPlan: get(row, 'testPlan'),
      },
    });
  });

  // Pass 2: resolve dependencies (by ID or title, within the file or existing data).
  const titleIndex = new Map<string, string[]>();
  for (const r of ds.releases) titleIndex.set(r.title.toLowerCase(), [...(titleIndex.get(r.title.toLowerCase()) ?? []), r.id]);
  const fileIds = new Set(pending.map((p) => p.release.id).filter(Boolean));
  const accepted: Pending[] = [];
  for (const p of pending) {
    const unresolved = p.dependsOn.filter(
      (ref) => !fileIds.has(ref) && !releaseIds.has(ref) && !pending.some((q) => q.release.title.toLowerCase() === ref.toLowerCase()) && !titleIndex.has(ref.toLowerCase()),
    );
    if (unresolved.length) {
      errors.push({ line: p.line, message: `Row ${p.line}: depends on ${unresolved.map((u) => `"${u}"`).join(', ')}, which is not in the file or the current data.` });
      continue;
    }
    accepted.push(p);
  }

  // Pass 3: create referenced entities and add the accepted releases.
  const teamIds = new Set(ds.teams.map((t) => t.id));
  const productIds = new Set(ds.products.map((x) => x.id));
  const envIds = new Set(ds.environments.map((x) => x.id));
  const ciIds = new Set(ds.configItems.map((x) => x.id));

  for (const p of accepted) {
    let team = byName(ds.teams, p.teamName);
    if (!team) {
      team = { id: uniqueId(`team-${slug(p.teamName)}`, teamIds), name: p.teamName };
      ds.teams.push(team);
    }
    let product = ds.products.find((x) => x.name.toLowerCase() === p.productName.toLowerCase() && x.teamId === team!.id);
    if (!product) {
      product = { id: uniqueId(slug(p.productName), productIds), name: p.productName, teamId: team.id };
      ds.products.push(product);
    }
    let env: Environment | undefined = ds.environments.find((x) => x.kind === p.envKind) ?? byName(ds.environments, p.envLabel);
    if (!env) {
      env = { id: uniqueId(`env-${p.envKind}`, envIds), name: ENV_NAMES[p.envKind], kind: p.envKind };
      ds.environments.push(env);
    }
    const cis = p.cis.map((name) => {
      let ci: ConfigItem | undefined = byName(ds.configItems, name);
      if (!ci) {
        ci = { id: uniqueId(`ci-${slug(name)}`, ciIds), name, dependsOnId: null };
        ds.configItems.push(ci);
      }
      return ci.id;
    });

    const existing = p.release.id && opts.mode === 'add' ? ds.releases.findIndex((r) => r.id === p.release.id) : -1;
    const id = existing >= 0 ? p.release.id : p.release.id && !releaseIds.has(p.release.id) ? p.release.id : uniqueId(`imp-${slug(p.release.title)}`, releaseIds);
    releaseIds.add(id);
    const release: Release = { ...p.release, id, productId: product.id, environmentId: env.id, configItemIds: cis.length ? cis : undefined };
    if (!release.allDay) delete release.allDay;
    if (!release.configItemIds) delete release.configItemIds;
    if (existing >= 0) ds.releases[existing] = release;
    else ds.releases.push(release);
    ds.changeRequests = ds.changeRequests.filter((c) => c.releaseId !== id);
    ds.changeRequests.push({ releaseId: id, ...p.cr });
    p.release.id = id;
  }

  // Pass 4: dependencies, now that every accepted release has its final id.
  const idFor = (ref: string) =>
    accepted.find((q) => q.release.id === ref)?.release.id ??
    (ds.releases.some((r) => r.id === ref) ? ref : undefined) ??
    accepted.find((q) => q.release.title.toLowerCase() === ref.toLowerCase())?.release.id ??
    titleIndex.get(ref.toLowerCase())?.[0];
  for (const p of accepted) {
    for (const ref of p.dependsOn) {
      const dep = idFor(ref);
      if (dep && dep !== p.release.id && !ds.dependencies.some((d) => d.releaseId === p.release.id && d.dependsOnReleaseId === dep)) {
        ds.dependencies.push({ releaseId: p.release.id, dependsOnReleaseId: dep });
      }
    }
  }

  errors.sort((a, b) => a.line - b.line);
  return { dataset: ds, imported: accepted.length, errors };
}
