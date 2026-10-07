import type { ChangeClass, Conflict, Dataset, Id, Release, RuleId, Window } from '../domain/types';

/** Integrated view = no team; regular view = one team (optionally one product). */
export interface Scope {
  teamId: Id | null;
  productId: Id | null;
}

export const integrated: Scope = { teamId: null, productId: null };

export function visibleReleases(ds: Dataset, scope: Scope): Release[] {
  if (!scope.teamId) return ds.releases;
  const productIds = new Set(
    ds.products.filter((p) => p.teamId === scope.teamId && (!scope.productId || p.id === scope.productId)).map((p) => p.id),
  );
  return ds.releases.filter((r) => productIds.has(r.productId));
}

/** Windows that can apply to anything in scope. */
export function visibleWindows(ds: Dataset, scope: Scope): Window[] {
  if (!scope.teamId) return ds.windows;
  return ds.windows.filter((w) => !w.scope.teamIds?.length || w.scope.teamIds.includes(scope.teamId!));
}

/** Conflicts that involve at least one visible release (the same evaluation feeds every view). */
export function visibleConflicts(conflicts: Conflict[], releases: Release[]): Conflict[] {
  const ids = new Set(releases.map((r) => r.id));
  return conflicts.filter((c) => c.releaseIds.some((id) => ids.has(id)));
}

export function conflictsByRelease(conflicts: Conflict[]): Map<Id, Conflict[]> {
  const map = new Map<Id, Conflict[]>();
  for (const c of conflicts) for (const id of c.releaseIds) map.set(id, [...(map.get(id) ?? []), c]);
  return map;
}

export const CHANGE_CLASS: Record<ChangeClass, { label: string; meaning: string }> = {
  standard: { label: 'Standard', meaning: 'Low-risk, repetitive, pre-approved change.' },
  normal: { label: 'Normal', meaning: 'Scheduled change that is risk-assessed and approved before it runs.' },
  emergency: {
    label: 'Emergency',
    meaning: 'Urgent fix for a critical outage or security threat, documented right after.',
  },
};

export const RULE_LABEL: Record<RuleId, string> = {
  'time-overlap': 'Time overlap',
  'environment-double-booking': 'Environment double-booking',
  guardrail: 'Guardrail violation',
  'dependency-order': 'Dependency order',
  completeness: 'Incomplete change request',
};

export const WINDOW_LABEL: Record<Window['kind'], string> = {
  blackout: 'Blackout',
  freeze: 'Freeze',
  maintenance: 'Maintenance window',
};

export const teamName = (ds: Dataset, release: Release) => {
  const teamId = ds.products.find((p) => p.id === release.productId)?.teamId;
  return ds.teams.find((t) => t.id === teamId)?.name ?? 'Unknown team';
};
