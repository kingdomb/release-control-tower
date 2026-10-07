import { formatRange, overlaps, type Interval } from '../domain/time';
import type { Id } from '../domain/types';
import { laterOf, severityForEnv, sortedIds, type EvalContext } from './context';
import { conflictId, type RawConflict, type Rule } from './rule';

interface Occupant {
  id: Id;
  kind: 'release' | 'booking';
  title: string;
  environmentId: Id;
  iv: Interval;
}

/**
 * Rule 2: an environment holds one occupant at a time. Occupants are releases deployed to it
 * and non-release bookings (for example a QA test cycle on staging).
 */
export const envDoubleBooking: Rule = (ctx: EvalContext) => {
  const occupants: Occupant[] = [
    ...ctx.active.map((r) => ({
      id: r.id,
      kind: 'release' as const,
      title: r.title,
      environmentId: r.environmentId,
      iv: ctx.interval(r),
    })),
    ...ctx.ds.bookings.map((b) => ({
      id: b.id,
      kind: 'booking' as const,
      title: `${b.title} (${b.owner})`,
      environmentId: b.environmentId,
      iv: ctx.interval(b),
    })),
  ];

  const byEnv = new Map<Id, Occupant[]>();
  for (const o of occupants) byEnv.set(o.environmentId, [...(byEnv.get(o.environmentId) ?? []), o]);

  const out: RawConflict[] = [];
  for (const [envId, list] of byEnv) {
    const envName = ctx.environment(envId)?.name ?? envId;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (ctx.focusId && a.id !== ctx.focusId && b.id !== ctx.focusId) continue;
        if (!overlaps(a.iv, b.iv)) continue;

        const releaseIds = sortedIds(...[a, b].filter((o) => o.kind === 'release').map((o) => o.id));
        const relatedIds = [a, b].filter((o) => o.kind === 'booking').map((o) => o.id);
        let moveReleaseId: Id | undefined;
        if (releaseIds.length === 2) {
          moveReleaseId = laterOf(ctx, ctx.release(a.id)!, ctx.release(b.id)!).id;
        } else if (releaseIds.length === 1) {
          moveReleaseId = releaseIds[0];
        }
        out.push({
          id: conflictId('environment-double-booking', envId, ...sortedIds(a.id, b.id)),
          rule: 'environment-double-booking',
          releaseIds,
          relatedIds: [envId, ...relatedIds],
          severity: severityForEnv(ctx, envId),
          message: `${envName} is double-booked: "${a.title}" (${formatRange(a.iv, ctx.opts.timeZone)}) overlaps "${b.title}" (${formatRange(b.iv, ctx.opts.timeZone)}).`,
          moveReleaseId,
        });
      }
    }
  }
  return out;
};
