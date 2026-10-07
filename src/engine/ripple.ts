import type { Dataset, Id } from '../domain/types';
import { buildContext, type EvalOptions } from './context';

export interface RippleItem {
  releaseId: Id;
  /** 1 = directly downstream of the moved release. */
  depth: number;
  via: 'dependency' | 'config-item';
  /** The upstream release this one is reached from. */
  fromReleaseId: Id;
  /** Release ids from the moved release to this one, inclusive. */
  path: Id[];
}

/**
 * Every release affected if `releaseId` slips, found by breadth-first traversal over:
 * - explicit dependencies (B depends on A: A slipping affects B), and
 * - configuration-item mapping (App X depends on Database Y: a release touching Y affects
 *   releases touching X, or anything that depends on X, that start at or after it).
 * Cycles are tolerated; each release is reported once, at its shortest depth.
 */
export function rippleEffect(ds: Dataset, releaseId: Id, opts: EvalOptions): RippleItem[] {
  const ctx = buildContext(ds, opts);
  if (!ctx.release(releaseId)) return [];

  const dependents = new Map<Id, Id[]>();
  for (const d of ds.dependencies) {
    dependents.set(d.dependsOnReleaseId, [...(dependents.get(d.dependsOnReleaseId) ?? []), d.releaseId]);
  }
  const ciDependents = new Map<Id, Id[]>();
  for (const ci of ds.configItems) {
    if (ci.dependsOnId) ciDependents.set(ci.dependsOnId, [...(ciDependents.get(ci.dependsOnId) ?? []), ci.id]);
  }

  /** All CIs that (transitively) depend on any of `roots`, excluding the roots themselves. */
  const downstreamCis = (roots: Id[]): Set<Id> => {
    const seen = new Set<Id>();
    const queue = [...roots];
    while (queue.length) {
      const id = queue.shift()!;
      for (const next of ciDependents.get(id) ?? []) {
        if (seen.has(next) || roots.includes(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return seen;
  };

  const result: RippleItem[] = [];
  const visited = new Set<Id>([releaseId]);
  const queue: { id: Id; depth: number; path: Id[] }[] = [{ id: releaseId, depth: 0, path: [releaseId] }];

  while (queue.length) {
    const cur = queue.shift()!;
    const curRelease = ctx.release(cur.id)!;
    const next: { id: Id; via: RippleItem['via'] }[] = (dependents.get(cur.id) ?? []).map((id) => ({
      id,
      via: 'dependency' as const,
    }));

    const cis = downstreamCis(curRelease.configItemIds ?? []);
    if (cis.size) {
      const start = ctx.interval(curRelease).start;
      for (const r of ctx.active) {
        if (r.id === cur.id) continue;
        if (!(r.configItemIds ?? []).some((ci) => cis.has(ci))) continue;
        if (ctx.interval(r).start < start) continue;
        next.push({ id: r.id, via: 'config-item' });
      }
    }

    for (const n of next) {
      const r = ctx.release(n.id);
      if (!r || r.status === 'cancelled' || visited.has(n.id)) continue;
      visited.add(n.id);
      const path = [...cur.path, n.id];
      result.push({ releaseId: n.id, depth: cur.depth + 1, via: n.via, fromReleaseId: cur.id, path });
      queue.push({ id: n.id, depth: cur.depth + 1, path });
    }
  }
  return result;
}
