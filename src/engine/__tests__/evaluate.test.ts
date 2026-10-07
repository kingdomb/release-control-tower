import { describe, expect, it } from 'vitest';
import { diffConflicts, evaluate } from '../evaluate';
import { at, baseDataset, fullCr, rel, UTC } from './fixtures';

const ds = baseDataset({
  windows: [{ id: 'bo', kind: 'blackout', name: 'Close', scope: {}, startAt: at('2026-03-12T00:00'), endAt: at('2026-03-13T00:00') }],
  releases: [
    rel({ id: 'a', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
    rel({ id: 'b', startAt: at('2026-03-10T15:00'), endAt: at('2026-03-10T17:00') }),
    rel({ id: 'c', productId: 'p3', environmentId: 'stg', startAt: at('2026-03-12T10:00'), endAt: at('2026-03-12T11:00') }),
    rel({ id: 'n', productId: 'p2', environmentId: 'stg', changeClass: 'normal', startAt: at('2026-03-09T10:00'), endAt: at('2026-03-09T11:00') }),
  ],
});

describe('evaluate', () => {
  it('runs every rule and sorts by severity, then id', () => {
    const out = evaluate(ds, UTC);
    expect(out.map((c) => [c.rule, c.severity])).toEqual([
      ['guardrail', 'critical'],
      ['completeness', 'high'],
      ['time-overlap', 'medium'],
      ['environment-double-booking', 'low'],
    ]);
  });

  it('is deterministic', () => {
    expect(evaluate(ds, UTC)).toEqual(evaluate(ds, UTC));
  });

  it('attaches 1-3 suggestions to every conflict', () => {
    for (const c of evaluate(ds, UTC)) {
      expect(c.suggestions.length).toBeGreaterThanOrEqual(1);
      expect(c.suggestions.length).toBeLessThanOrEqual(3);
    }
  });

  it('can skip suggestions for fast previews', () => {
    expect(evaluate(ds, { ...UTC, withSuggestions: false }).every((c) => c.suggestions.length === 0)).toBe(true);
  });

  it('diffs two evaluations by stable id', () => {
    const before = evaluate(ds, UTC);
    const moved = {
      ...ds,
      releases: ds.releases.map((r) => (r.id === 'c' ? { ...r, startAt: at('2026-03-13T10:00'), endAt: at('2026-03-13T11:00') } : r)),
      changeRequests: [fullCr('n')],
    };
    const d = diffConflicts(before, evaluate(moved, UTC));
    expect(d.resolved.map((c) => c.rule).sort()).toEqual(['completeness', 'guardrail']);
    expect(d.added).toEqual([]);
    expect(d.unchanged.map((c) => c.rule).sort()).toEqual(['environment-double-booking', 'time-overlap']);
  });
});
