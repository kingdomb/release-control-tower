import { DAY, formatRange, iso, MINUTE, parseDateOnly } from '../domain/time';
import type { Dataset, Id, Release, Suggestion } from '../domain/types';
import { buildContext, type EvalOptions } from './context';
import { missingPlans } from './completeness';
import type { RawConflict } from './rule';
import { timedRules } from './rules';

export interface SlotOptions {
  /** Maximum number of slots to return (1-3 in the UI). */
  count?: number;
  horizonDays?: number;
  stepMinutes?: number;
  /** Minimum distance between returned slots so alternatives are meaningfully different. */
  minGapMs?: number;
}

const addDays = (date: string, n: number) => {
  const [y, m, d] = parseDateOnly(date.slice(0, 10))!;
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Copy of `release` shifted by `deltaSteps` steps (minutes for timed, days for all-day). */
function shifted(r: Release, delta: number): Release {
  if (r.allDay) return { ...r, startAt: addDays(r.startAt, delta), endAt: addDays(r.endAt, delta) };
  return { ...r, startAt: iso(Date.parse(r.startAt) + delta * MINUTE), endAt: iso(Date.parse(r.endAt) + delta * MINUTE) };
}

/** True when the release, placed as given, causes no time-based conflict (rules 1-4). */
export function slotIsClear(ds: Dataset, candidate: Release, opts: EvalOptions): boolean {
  const next: Dataset = { ...ds, releases: ds.releases.map((r) => (r.id === candidate.id ? candidate : r)) };
  const ctx = buildContext(next, opts, candidate.id);
  return timedRules.every((rule) => rule(ctx).length === 0);
}

/**
 * Next free slots for `releaseId`, searching forward from its current start, keeping its
 * duration and environment. Each slot clears all time-based rules.
 */
export function findSlots(ds: Dataset, releaseId: Id, opts: EvalOptions, slot: SlotOptions = {}): Release[] {
  const r = ds.releases.find((x) => x.id === releaseId);
  if (!r) return [];
  const { count = 3, horizonDays = 28, stepMinutes = 30, minGapMs = DAY } = slot;
  const step = r.allDay ? 1 : stepMinutes;
  const steps = r.allDay ? horizonDays : (horizonDays * DAY) / (stepMinutes * MINUTE);
  const gapSteps = r.allDay ? Math.max(1, Math.round(minGapMs / DAY)) : Math.round(minGapMs / (stepMinutes * MINUTE));

  const found: Release[] = [];
  let i = 1;
  while (i <= steps && found.length < count) {
    const candidate = shifted(r, i * step);
    if (slotIsClear(ds, candidate, opts)) {
      found.push(candidate);
      i += gapSteps;
    } else {
      i += 1;
    }
  }
  return found;
}

export function suggestionsFor(ds: Dataset, c: RawConflict, opts: EvalOptions): Suggestion[] {
  if (c.rule === 'completeness') {
    const releaseId = c.releaseIds[0]!;
    const cr = ds.changeRequests.find((x) => x.releaseId === releaseId);
    return missingPlans(cr).map((m) => ({ kind: 'action', releaseId, label: `Add a ${m} in the release drawer` }));
  }
  if (!c.moveReleaseId) {
    return [{ kind: 'action', releaseId: '', label: 'Move one of the bookings; no release is involved' }];
  }
  const out: Suggestion[] = [];
  const r = ds.releases.find((x) => x.id === c.moveReleaseId);
  if (c.rule === 'guardrail' && r?.changeClass === 'emergency') {
    out.push({ kind: 'action', releaseId: c.moveReleaseId, label: 'Record ECAB sign-off, or move it out of the window' });
  }
  const tz = opts.timeZone;
  const ctx = buildContext(ds, opts);
  for (const s of findSlots(ds, c.moveReleaseId, opts, { count: 3 - out.length })) {
    out.push({
      kind: 'reschedule',
      releaseId: s.id,
      startAt: s.startAt,
      endAt: s.endAt,
      label: `Move to ${formatRange(ctx.interval(s), tz)}`,
    });
  }
  if (!out.length) {
    out.push({ kind: 'action', releaseId: c.moveReleaseId, label: 'No free slot in the next 28 days; replan manually' });
  }
  return out;
}
