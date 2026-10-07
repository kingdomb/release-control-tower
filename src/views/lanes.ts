import { toInterval } from '../domain/time';
import type { Dataset, Release, Window } from '../domain/types';
import type { Scope } from './model';
import type { Band, Lane, LaneItem } from './Swimlane';

function scopeLabel(ds: Dataset, w: Window): string {
  const envs = (w.scope.environmentIds ?? []).map((id) => ds.environments.find((e) => e.id === id)?.name ?? id);
  const teams = (w.scope.teamIds ?? []).map((id) => ds.teams.find((t) => t.id === id)?.name ?? id);
  const parts = [envs.length ? envs.join(', ') : '', teams.length ? teams.join(', ') : ''].filter(Boolean);
  return parts.length ? parts.join(' / ') : 'All teams and environments';
}

/** Lanes by team (integrated) or by product (regular view of one team). */
export function teamLanes(ds: Dataset, releases: Release[], windows: Window[], scope: Scope, tz: string) {
  const byProduct = !!scope.teamId;
  const productTeam = new Map(ds.products.map((p) => [p.id, p.teamId]));
  const lanes: Lane[] = byProduct
    ? ds.products
        .filter((p) => p.teamId === scope.teamId && (!scope.productId || p.id === scope.productId))
        .map((p) => ({ id: p.id, label: p.name, sublabel: ds.teams.find((t) => t.id === p.teamId)?.name }))
    : ds.teams.map((t) => ({
        id: t.id,
        label: t.name,
        sublabel: ds.products
          .filter((p) => p.teamId === t.id)
          .map((p) => p.name)
          .join(', '),
      }));
  const items: LaneItem[] = releases.map((r) => ({
    id: r.id,
    laneId: byProduct ? r.productId : (productTeam.get(r.productId) ?? ''),
    iv: toInterval(r, tz),
    release: r,
  }));
  const bands: Band[] = windows.map((w) => ({
    id: w.id,
    kind: w.kind,
    name: w.name,
    scopeLabel: scopeLabel(ds, w),
    iv: toInterval(w, tz),
    laneIds:
      !byProduct && w.scope.teamIds?.length
        ? w.scope.teamIds
        : byProduct && w.scope.teamIds?.length && !w.scope.teamIds.includes(scope.teamId!)
          ? []
          : null,
  }));
  return { lanes, items, bands };
}

/** One lane per environment, with releases and non-release bookings. */
export function environmentLanes(ds: Dataset, releases: Release[], windows: Window[], tz: string) {
  const KIND: Record<string, string> = { dev: 'Development', 'staging-uat': 'Staging / UAT', prod: 'Production' };
  const lanes: Lane[] = ds.environments.map((e) => {
    const kind = KIND[e.kind] ?? e.kind;
    const same = kind.replace(/\W/g, '').toLowerCase() === e.name.replace(/\W/g, '').toLowerCase();
    return { id: e.id, label: e.name, sublabel: same ? undefined : kind };
  });
  const items: LaneItem[] = [
    ...releases.map((r) => ({ id: r.id, laneId: r.environmentId, iv: toInterval(r, tz), release: r })),
    ...ds.bookings.map((b) => ({
      id: b.id,
      laneId: b.environmentId,
      iv: toInterval(b, tz),
      booking: { title: b.title, owner: b.owner },
    })),
  ];
  const bands: Band[] = windows.map((w) => ({
    id: w.id,
    kind: w.kind,
    name: w.name,
    scopeLabel: scopeLabel(ds, w),
    iv: toInterval(w, tz),
    laneIds: w.scope.environmentIds?.length ? w.scope.environmentIds : null,
  }));
  return { lanes, items, bands };
}
