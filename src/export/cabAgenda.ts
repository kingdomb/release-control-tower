import { DAY, overlaps, toInterval, type Interval } from '../domain/time';
import type { ChangeClass, Conflict, Dataset, Release } from '../domain/types';
import { missingPlans } from '../engine/completeness';

/** Minimum Viable CAB: the four roles that must be in the room. */
export const CAB_ROLES = ['Change Manager', 'Operations', 'Development', 'Business / Product'] as const;

export interface AgendaChange {
  release: Release;
  team: string;
  product: string;
  environment: string;
  impactRisk: string;
  missing: string[];
  conflictCount: number;
}

export interface OpenRisk {
  releaseId: string;
  title: string;
  kind: 'incomplete-rfc' | 'emergency-review' | 'stated-risk' | 'unresolved-conflict';
  text: string;
}

export interface CabAgenda {
  week: Interval;
  /** Changes needing a decision (Normal), reviewed after the fact (Emergency), and pre-approved (Standard). */
  changes: Record<ChangeClass, AgendaChange[]>;
  conflicts: Conflict[];
  risks: OpenRisk[];
}

/** Everything the CAB needs for the week starting at `weekStart` (local midnight). */
export function buildCabAgenda(ds: Dataset, conflicts: Conflict[], weekStart: number, timeZone: string): CabAgenda {
  const week = { start: weekStart, end: weekStart + 7 * DAY };
  const inWeek = ds.releases
    .filter((r) => r.status !== 'cancelled' && overlaps(toInterval(r, timeZone), week))
    .sort((a, b) => toInterval(a, timeZone).start - toInterval(b, timeZone).start);
  const ids = new Set(inWeek.map((r) => r.id));
  const weekConflicts = conflicts.filter((c) => c.releaseIds.some((id) => ids.has(id)));

  const toChange = (r: Release): AgendaChange => {
    const product = ds.products.find((p) => p.id === r.productId);
    const cr = ds.changeRequests.find((c) => c.releaseId === r.id);
    return {
      release: r,
      product: product?.name ?? r.productId,
      team: ds.teams.find((t) => t.id === product?.teamId)?.name ?? '-',
      environment: ds.environments.find((e) => e.id === r.environmentId)?.name ?? r.environmentId,
      impactRisk: cr?.impactRisk ?? '',
      missing: r.changeClass === 'standard' ? [] : missingPlans(cr),
      conflictCount: weekConflicts.filter((c) => c.releaseIds.includes(r.id)).length,
    };
  };
  const changes: CabAgenda['changes'] = { normal: [], emergency: [], standard: [] };
  for (const r of inWeek) changes[r.changeClass].push(toChange(r));

  const risks: OpenRisk[] = [];
  for (const c of [...changes.normal, ...changes.emergency]) {
    const { release: r } = c;
    if (c.missing.length) risks.push({ releaseId: r.id, title: r.title, kind: 'incomplete-rfc', text: `No ${c.missing.join(' and no ')}.` });
    if (r.changeClass === 'emergency') {
      risks.push({ releaseId: r.id, title: r.title, kind: 'emergency-review', text: 'Emergency change: confirm ECAB approval and post-implementation review.' });
    }
    if (/^(medium|high)/i.test(c.impactRisk)) risks.push({ releaseId: r.id, title: r.title, kind: 'stated-risk', text: c.impactRisk });
  }
  for (const c of weekConflicts.filter((x) => x.severity === 'critical' || x.severity === 'high')) {
    const id = c.releaseIds.find((x) => ids.has(x))!;
    risks.push({ releaseId: id, title: ds.releases.find((r) => r.id === id)?.title ?? id, kind: 'unresolved-conflict', text: c.message });
  }

  return { week, changes, conflicts: weekConflicts, risks };
}
