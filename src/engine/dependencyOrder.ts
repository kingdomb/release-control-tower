import { formatShort } from '../domain/time';
import { label, type EvalContext } from './context';
import { conflictId, type RawConflict, type Rule } from './rule';

/**
 * Rule 4: a release must not start before every release it depends on has finished.
 * Finishing exactly when the dependent starts is fine (half-open ranges).
 */
export const dependencyOrder: Rule = (ctx: EvalContext) => {
  const out: RawConflict[] = [];
  const tz = ctx.opts.timeZone;
  for (const dep of ctx.ds.dependencies) {
    if (ctx.focusId && dep.releaseId !== ctx.focusId && dep.dependsOnReleaseId !== ctx.focusId) continue;
    const r = ctx.release(dep.releaseId);
    const d = ctx.release(dep.dependsOnReleaseId);
    if (!r || !d || r.status === 'cancelled' || d.status === 'cancelled') continue;
    const ir = ctx.interval(r);
    const id = ctx.interval(d);
    if (ir.start >= id.end) continue;
    out.push({
      id: conflictId('dependency-order', r.id, d.id),
      rule: 'dependency-order',
      releaseIds: [r.id, d.id],
      relatedIds: [],
      severity: 'high',
      message: `${label(ctx, r.id)} starts ${formatShort(ir.start, tz)} but depends on ${label(ctx, d.id)}, which does not finish until ${formatShort(id.end, tz)}.`,
      moveReleaseId: r.id,
    });
  }
  return out;
};
