import { contains, formatRange, overlaps, type Interval } from '../domain/time';
import type { Release } from '../domain/types';
import { inScope, isProd, label, type EvalContext } from './context';
import { conflictId, type RawConflict, type Rule } from './rule';

/**
 * Rule 3: guardrail windows.
 * - A release may not overlap a blackout or freeze window in its scope. Emergency changes
 *   are reported at medium severity because they may proceed with ECAB sign-off.
 * - A Normal change to production must sit fully inside an approved maintenance window,
 *   when any maintenance window is defined for that environment. Standard changes are
 *   pre-approved and Emergency changes are urgent, so both are exempt.
 */
export const guardrail: Rule = (ctx: EvalContext) => {
  const out: RawConflict[] = [];
  const releases = ctx.focusId ? ctx.active.filter((r) => r.id === ctx.focusId) : ctx.active;
  const tz = ctx.opts.timeZone;

  for (const r of releases) {
    const iv = ctx.interval(r);

    for (const w of ctx.ds.windows) {
      if (w.kind === 'maintenance' || !inScope(ctx, w, r)) continue;
      const wiv = ctx.interval(w);
      if (!overlaps(iv, wiv)) continue;
      const emergency = r.changeClass === 'emergency';
      out.push({
        id: conflictId('guardrail', r.id, w.id),
        rule: 'guardrail',
        releaseIds: [r.id],
        relatedIds: [w.id],
        severity: emergency ? 'medium' : 'critical',
        message: emergency
          ? `Emergency change ${label(ctx, r.id)} falls inside ${w.kind} window "${w.name}" (${formatRange(wiv, tz)}). Allowed only with ECAB sign-off.`
          : `${label(ctx, r.id)} falls inside ${w.kind} window "${w.name}" (${formatRange(wiv, tz)}).`,
        moveReleaseId: r.id,
      });
    }

    if (needsMaintenanceWindow(ctx, r)) {
      const windows = ctx.ds.windows.filter((w) => w.kind === 'maintenance' && inScope(ctx, w, r));
      if (windows.length && !mergeIntervals(windows.map((w) => ctx.interval(w))).some((m) => contains(m, iv))) {
        out.push({
          id: conflictId('guardrail', r.id, 'outside-maintenance'),
          rule: 'guardrail',
          releaseIds: [r.id],
          relatedIds: [],
          severity: 'high',
          message: `Normal change ${label(ctx, r.id)} (${formatRange(iv, tz)}) is outside every approved maintenance window for its environment.`,
          moveReleaseId: r.id,
        });
      }
    }
  }
  return out;
};

export const needsMaintenanceWindow = (ctx: EvalContext, r: Release) => r.changeClass === 'normal' && isProd(ctx, r);

/** Merge overlapping or back-to-back intervals, so a change may span adjacent maintenance windows. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out.at(-1);
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}
