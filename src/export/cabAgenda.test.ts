import { describe, expect, it } from 'vitest';
import { generateSeed, mondayOf } from '../data/seed/generate';
import { evaluate } from '../engine/evaluate';
import { buildCabAgenda, CAB_ROLES } from './cabAgenda';

const anchor = new Date('2026-10-07T12:00:00Z');
const ds = generateSeed({ anchor });
const conflicts = evaluate(ds, { timeZone: 'UTC', withSuggestions: false });
const week = (n: number) => mondayOf(anchor).getTime() + n * 7 * 86_400_000;

describe('CAB agenda', () => {
  it('names the four Minimum Viable CAB roles', () => {
    expect(CAB_ROLES).toEqual(['Change Manager', 'Operations', 'Development', 'Business / Product']);
  });

  it("lists exactly the week's non-cancelled changes, grouped by class and in time order", () => {
    const a = buildCabAgenda(ds, conflicts, week(1), 'UTC');
    const all = [...a.changes.normal, ...a.changes.emergency, ...a.changes.standard].map((c) => c.release.id).sort();
    const expected = ds.releases
      .filter((r) => Date.parse(r.startAt) < week(2) && Date.parse(r.endAt) > week(1) && r.status !== 'cancelled')
      .map((r) => r.id)
      .sort();
    expect(all).toEqual(expected);
    for (const cls of ['normal', 'emergency', 'standard'] as const) {
      const starts = a.changes[cls].map((c) => Date.parse(c.release.startAt));
      expect(starts).toEqual([...starts].sort((x, y) => x - y));
      expect(a.changes[cls].every((c) => c.release.changeClass === cls)).toBe(true);
    }
  });

  it("includes the week's conflicts (week 1 holds the same-product overlap and the QA double-booking)", () => {
    const a = buildCabAgenda(ds, conflicts, week(1), 'UTC');
    expect(a.conflicts.map((c) => c.rule).sort()).toEqual(['environment-double-booking', 'time-overlap']);
  });

  it('raises incomplete RFCs and emergency reviews as open risks', () => {
    const a = buildCabAgenda(ds, conflicts, week(7), 'UTC');
    expect(a.risks).toContainEqual(expect.objectContaining({ releaseId: 'rel-p8-data-stg', kind: 'incomplete-rfc', text: 'No rollback plan.' }));
    const em = ds.releases.find((r) => r.changeClass === 'emergency')!;
    const n = Math.floor((Date.parse(em.startAt) - week(0)) / (7 * 86_400_000));
    const emergencies = buildCabAgenda(ds, conflicts, week(n), 'UTC');
    expect(emergencies.changes.emergency.length).toBeGreaterThan(0);
    for (const c of emergencies.changes.emergency) {
      expect(emergencies.risks).toContainEqual(expect.objectContaining({ releaseId: c.release.id, kind: 'emergency-review' }));
    }
  });

  it('carries critical and high conflicts into open risks', () => {
    const a = buildCabAgenda(ds, conflicts, week(3), 'UTC');
    expect(a.risks.some((r) => r.kind === 'unresolved-conflict' && r.releaseId === 'rel-p5-ios-stg')).toBe(true);
  });

  it('is empty for a week with nothing scheduled', () => {
    const a = buildCabAgenda(ds, conflicts, week(20), 'UTC');
    expect(a.changes).toEqual({ normal: [], emergency: [], standard: [] });
    expect(a.conflicts).toEqual([]);
    expect(a.risks).toEqual([]);
  });
});
