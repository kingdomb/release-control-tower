import { describe, expect, it } from 'vitest';
import { isValidTimed } from '../../domain/time';
import { evaluate } from '../../engine/evaluate';
import { rippleEffect } from '../../engine/ripple';
import { generateSeed, mondayOf, PLANTED } from './generate';

const ANCHORS = ['2026-03-09', '2026-10-05', '2026-12-21', '2027-06-14'];
const ZONES = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Pacific/Auckland'];

const signature = (c: { rule: string; releaseIds: string[] }) => `${c.rule}:${[...c.releaseIds].sort().join(',')}`;

describe('seed data', () => {
  const ds = generateSeed({ anchor: new Date('2026-10-07T12:00:00Z') });

  it('has the documented shape', () => {
    expect(ds.teams).toHaveLength(15);
    expect(ds.environments.map((e) => e.kind)).toEqual(['dev', 'staging-uat', 'prod']);
    expect(ds.releases).toHaveLength(60);
    expect(new Set(ds.releases.map((r) => r.id)).size).toBe(60);
    expect(ds.windows.filter((w) => w.kind === 'blackout').length).toBeGreaterThanOrEqual(1);
    expect(ds.windows.filter((w) => w.kind === 'maintenance').length).toBeGreaterThanOrEqual(1);
    expect(ds.windows.filter((w) => w.kind === 'freeze').length).toBeGreaterThanOrEqual(1);
    expect(ds.dependencies.length).toBeGreaterThanOrEqual(5);
    for (const r of ds.releases) expect(isValidTimed(r)).toBe(true);
  });

  it('spans 8 weeks from the Monday of the anchor week', () => {
    const anchor = mondayOf(new Date('2026-10-07T12:00:00Z')).getTime();
    expect(new Date(anchor).toISOString()).toBe('2026-10-05T00:00:00.000Z');
    for (const r of ds.releases) {
      expect(Date.parse(r.startAt)).toBeGreaterThanOrEqual(anchor);
      expect(Date.parse(r.endAt)).toBeLessThanOrEqual(anchor + 8 * 7 * 86_400_000);
    }
  });

  it('is deterministic for a given anchor', () => {
    expect(generateSeed({ anchor: new Date('2026-10-07T12:00:00Z') })).toEqual(ds);
  });

  it.each(ANCHORS.flatMap((a) => ZONES.map((z) => [a, z] as const)))(
    'anchor %s, time zone %s: exactly the eight planted conflicts, each tied to its rule',
    (anchor, timeZone) => {
      const seeded = generateSeed({ anchor: new Date(`${anchor}T00:00:00Z`) });
      const conflicts = evaluate(seeded, { timeZone, withSuggestions: false });
      expect(conflicts.map(signature).sort()).toEqual(PLANTED.map(signature).sort());
    },
  );

  it('covers every rule at least once', () => {
    expect(new Set(PLANTED.map((p) => p.rule))).toEqual(
      new Set(['time-overlap', 'environment-double-booking', 'guardrail', 'dependency-order', 'completeness']),
    );
    expect(PLANTED).toHaveLength(8);
  });

  it('ties planted conflicts to the expected windows and bookings', () => {
    const conflicts = evaluate(ds, { timeZone: 'UTC', withSuggestions: false });
    for (const p of PLANTED.filter((x) => x.relatedIds)) {
      const c = conflicts.find((x) => signature(x) === signature(p))!;
      expect(c.relatedIds).toEqual(expect.arrayContaining(p.relatedIds!));
    }
  });

  it('gives every planted time-based conflict at least one reschedule suggestion', () => {
    const conflicts = evaluate(ds, { timeZone: 'UTC' });
    for (const c of conflicts) {
      expect(c.suggestions.length).toBeGreaterThanOrEqual(1);
      expect(c.suggestions.length).toBeLessThanOrEqual(3);
      if (c.rule !== 'completeness') expect(c.suggestions.some((s) => s.kind === 'reschedule')).toBe(true);
    }
  });

  it('contains dependency chains with a visible ripple effect', () => {
    const roots = ds.dependencies.map((d) => d.dependsOnReleaseId).filter((id) => !ds.dependencies.some((d) => d.releaseId === id));
    const longest = Math.max(...roots.map((id) => Math.max(0, ...rippleEffect(ds, id, { timeZone: 'UTC' }).map((r) => r.depth))));
    expect(longest).toBeGreaterThanOrEqual(2);
  });

  it('references no real organisations or people', () => {
    const text = JSON.stringify(ds).toLowerCase();
    for (const word of ['inc.', 'llc', 'ltd', '@', 'http']) expect(text).not.toContain(word);
  });
});
