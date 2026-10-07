import { label, type EvalContext } from './context';
import { conflictId, type RawConflict, type Rule } from './rule';

/** Rule 5: a Normal or Emergency change needs a rollback plan and a test plan. */
export const completeness: Rule = (ctx: EvalContext) => {
  const out: RawConflict[] = [];
  const releases = ctx.focusId ? ctx.active.filter((r) => r.id === ctx.focusId) : ctx.active;
  for (const r of releases) {
    if (r.changeClass === 'standard') continue;
    const cr = ctx.ds.changeRequests.find((c) => c.releaseId === r.id);
    const missing = missingPlans(cr);
    if (!missing.length) continue;
    out.push({
      id: conflictId('completeness', r.id),
      rule: 'completeness',
      releaseIds: [r.id],
      relatedIds: [],
      severity: r.changeClass === 'normal' ? 'high' : 'medium',
      message: `${r.changeClass === 'normal' ? 'Normal' : 'Emergency'} change ${label(ctx, r.id)} has no ${missing.join(' and no ')}.${
        r.changeClass === 'emergency' ? ' Document it as soon as the fix is in.' : ''
      }`,
    });
  }
  return out;
};

export function missingPlans(cr: { rollbackPlan?: string; testPlan?: string } | undefined): string[] {
  const missing: string[] = [];
  if (!cr?.rollbackPlan?.trim()) missing.push('rollback plan');
  if (!cr?.testPlan?.trim()) missing.push('test plan');
  return missing;
}
