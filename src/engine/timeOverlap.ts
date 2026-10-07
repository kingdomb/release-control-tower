import { formatRange, overlaps } from '../domain/time';
import { label, laterOf, pairs, sortedIds, type EvalContext } from './context';
import { conflictId, type RawConflict, type Rule } from './rule';

/**
 * Rule 1: two releases that touch the same product or the same configuration item
 * must not run at overlapping times (in any environment).
 */
export const timeOverlap: Rule = (ctx: EvalContext) => {
  const out: RawConflict[] = [];
  for (const [a, b] of pairs(ctx.active, ctx.focusId)) {
    const ia = ctx.interval(a);
    const ib = ctx.interval(b);
    if (!overlaps(ia, ib)) continue;

    const sameProduct = a.productId === b.productId;
    const sharedCis = (a.configItemIds ?? []).filter((ci) => (b.configItemIds ?? []).includes(ci));
    if (!sameProduct && sharedCis.length === 0) continue;

    const ciNames = sharedCis.map((id) => ctx.ds.configItems.find((c) => c.id === id)?.name ?? id);
    const what = sameProduct
      ? `the same product (${ctx.product(a.productId)?.name ?? a.productId})`
      : `the same configuration item (${ciNames.join(', ')})`;
    const prodInvolved = [a, b].some((r) => ctx.environment(r.environmentId)?.kind === 'prod');
    const ids = sortedIds(a.id, b.id);
    out.push({
      id: conflictId('time-overlap', ...ids),
      rule: 'time-overlap',
      releaseIds: ids,
      relatedIds: sharedCis,
      severity: prodInvolved ? 'high' : 'medium',
      message: `${label(ctx, a.id)} (${formatRange(ia, ctx.opts.timeZone)}) and ${label(ctx, b.id)} (${formatRange(ib, ctx.opts.timeZone)}) both touch ${what} at the same time.`,
      moveReleaseId: laterOf(ctx, a, b).id,
    });
  }
  return out;
};
