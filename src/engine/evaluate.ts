import type { Conflict, Dataset, Severity } from '../domain/types';
import { buildContext, type EvalOptions } from './context';
import { allRules } from './rules';
import { suggestionsFor } from './suggest';

export const severityRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export interface EvaluateOptions extends EvalOptions {
  /** Skip the slot search (faster; used for previews that only need counts). */
  withSuggestions?: boolean;
}

/** Run every rule over the dataset. Pure: same input, same output. */
export function evaluate(ds: Dataset, opts: EvaluateOptions): Conflict[] {
  const ctx = buildContext(ds, opts);
  const raw = allRules.flatMap((rule) => rule(ctx));
  raw.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.id.localeCompare(b.id));
  return raw.map((c) => {
    const { moveReleaseId, ...conflict } = c;
    void moveReleaseId;
    return { ...conflict, suggestions: opts.withSuggestions === false ? [] : suggestionsFor(ds, c, opts) };
  });
}

export interface ConflictDiff {
  added: Conflict[];
  resolved: Conflict[];
  unchanged: Conflict[];
}

/** Compare two evaluations by stable conflict id. */
export function diffConflicts(before: Conflict[], after: Conflict[]): ConflictDiff {
  const beforeIds = new Set(before.map((c) => c.id));
  const afterIds = new Set(after.map((c) => c.id));
  return {
    added: after.filter((c) => !beforeIds.has(c.id)),
    resolved: before.filter((c) => !afterIds.has(c.id)),
    unchanged: after.filter((c) => beforeIds.has(c.id)),
  };
}
