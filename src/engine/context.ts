import { toInterval, type Interval } from '../domain/time';
import type { Dataset, Environment, Id, Product, Release, Severity, Timed, Window } from '../domain/types';
import type { RawConflict } from './rule';

export interface EvalOptions {
  /** IANA time zone used to resolve all-day items and to format messages. */
  timeZone: string;
}

export const defaultOptions = (): EvalOptions => ({
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
});

/** Pre-computed lookups shared by every rule during one evaluation. */
export interface EvalContext {
  ds: Dataset;
  opts: EvalOptions;
  /** Releases that take part in rule evaluation (cancelled ones are ignored). */
  active: Release[];
  interval: (item: Timed) => Interval;
  release: (id: Id) => Release | undefined;
  product: (id: Id) => Product | undefined;
  environment: (id: Id) => Environment | undefined;
  teamOf: (release: Release) => Id | undefined;
  /** When set, rules only report conflicts that involve this release (used by the slot finder). */
  focusId?: Id;
}

/**
 * Intervals keyed by object identity. Dataset items are treated as immutable (edits replace
 * the object), so a cached interval can never go stale, and the slot finder reuses the
 * intervals of every item it does not move.
 */
const intervalCache = new WeakMap<Timed, { tz: string; iv: Interval }>();

function cachedInterval(item: Timed, timeZone: string): Interval {
  const hit = intervalCache.get(item);
  if (hit && hit.tz === timeZone) return hit.iv;
  const iv = toInterval(item, timeZone);
  intervalCache.set(item, { tz: timeZone, iv });
  return iv;
}

export function buildContext(ds: Dataset, opts: EvalOptions, focusId?: Id): EvalContext {
  const releases = new Map(ds.releases.map((r) => [r.id, r]));
  const products = new Map(ds.products.map((p) => [p.id, p]));
  const envs = new Map(ds.environments.map((e) => [e.id, e]));
  return {
    ds,
    opts,
    focusId,
    active: ds.releases.filter((r) => r.status !== 'cancelled'),
    interval: (item) => cachedInterval(item, opts.timeZone),
    release: (id) => releases.get(id),
    product: (id) => products.get(id),
    environment: (id) => envs.get(id),
    teamOf: (r) => products.get(r.productId)?.teamId,
  };
}

export function inScope(ctx: EvalContext, w: Window, r: Release): boolean {
  const envs = w.scope.environmentIds ?? [];
  const teams = w.scope.teamIds ?? [];
  if (envs.length && !envs.includes(r.environmentId)) return false;
  if (teams.length) {
    const team = ctx.teamOf(r);
    if (!team || !teams.includes(team)) return false;
  }
  return true;
}

export const isProd = (ctx: EvalContext, r: Release) => ctx.environment(r.environmentId)?.kind === 'prod';

export function severityForEnv(ctx: EvalContext, environmentId: Id): Severity {
  const kind = ctx.environment(environmentId)?.kind;
  return kind === 'prod' ? 'high' : kind === 'staging-uat' ? 'medium' : 'low';
}

/** Pairs (a, b) with a before b in `items`, restricted to pairs containing the focus release if set. */
export function* pairs<T extends { id: Id }>(items: T[], focusId?: Id): Generator<[T, T]> {
  if (focusId) {
    const focus = items.find((i) => i.id === focusId);
    if (!focus) return;
    for (const other of items) if (other.id !== focusId) yield [focus, other];
    return;
  }
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) yield [items[i]!, items[j]!];
  }
}

/** The release to move when two releases clash: the one that starts later (ties: higher id). */
export function laterOf(ctx: EvalContext, a: Release, b: Release): Release {
  const ia = ctx.interval(a);
  const ib = ctx.interval(b);
  if (ia.start !== ib.start) return ia.start > ib.start ? a : b;
  return a.id > b.id ? a : b;
}

export const sortedIds = (...ids: Id[]) => [...ids].sort();

export const label = (ctx: EvalContext, id: Id) => {
  const r = ctx.release(id);
  return r ? `"${r.title}"` : id;
};

export const keepFocused = (ctx: EvalContext, list: RawConflict[]) =>
  ctx.focusId ? list.filter((c) => c.releaseIds.includes(ctx.focusId!)) : list;
