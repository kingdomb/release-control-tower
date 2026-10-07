import { describe, expect, it } from 'vitest';
import type { Window } from '../../domain/types';
import { evaluate } from '../evaluate';
import { findSlots, slotIsClear } from '../suggest';
import { at, baseDataset, fullCr, rel, UTC } from './fixtures';

describe('suggested alternative windows', () => {
  it('offers up to three slots, each at least a day apart, starting with the next free slot', () => {
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
        rel({ id: 'b', startAt: at('2026-03-10T15:00'), endAt: at('2026-03-10T17:00') }),
      ],
    });
    const slots = findSlots(ds, 'b', UTC);
    expect(slots.map((s) => s.startAt)).toEqual([at('2026-03-10T16:00'), at('2026-03-11T16:00'), at('2026-03-12T16:00')]);
    for (const s of slots) {
      expect(Date.parse(s.endAt) - Date.parse(s.startAt)).toBe(2 * 3600_000);
      expect(slotIsClear(ds, s, UTC)).toBe(true);
    }
  });

  it('every suggestion clears all time-based rules, not just the one that fired', () => {
    // Moving "b" past "a" would land in a blackout; the slot must skip it too.
    const blackout: Window = {
      id: 'bo',
      kind: 'blackout',
      name: 'Close',
      scope: {},
      startAt: at('2026-03-10T16:00'),
      endAt: at('2026-03-11T00:00'),
    };
    const ds = baseDataset({
      windows: [blackout],
      releases: [
        rel({ id: 'a', startAt: at('2026-03-10T13:00'), endAt: at('2026-03-10T16:00') }),
        rel({ id: 'b', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T15:00') }),
      ],
    });
    const [first] = findSlots(ds, 'b', UTC);
    expect(first!.startAt).toBe(at('2026-03-11T00:00'));
  });

  it('moves a Normal prod change into the next maintenance window', () => {
    const maint = (day: number): Window => ({
      id: `mw${day}`,
      kind: 'maintenance',
      name: 'Saturday',
      scope: { environmentIds: ['prod'] },
      startAt: at(`2026-03-${day}T14:00`),
      endAt: at(`2026-03-${day}T22:00`),
    });
    const ds = baseDataset({
      windows: [maint(14), maint(21)],
      releases: [rel({ id: 'n', environmentId: 'prod', changeClass: 'normal', startAt: at('2026-03-12T14:00'), endAt: at('2026-03-12T16:00') })],
      changeRequests: [fullCr('n')],
    });
    const [conflict] = evaluate(ds, UTC);
    const reschedules = conflict!.suggestions.filter((s) => s.kind === 'reschedule');
    expect(reschedules.map((s) => s.kind === 'reschedule' && s.startAt)).toEqual([at('2026-03-14T14:00'), at('2026-03-21T14:00')]);
  });

  it('shifts all-day releases by whole days', () => {
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', allDay: true, startAt: '2026-03-10', endAt: '2026-03-11' }),
        rel({ id: 'b', allDay: true, startAt: '2026-03-10', endAt: '2026-03-11' }),
      ],
    });
    expect(findSlots(ds, 'b', UTC, { count: 1 })[0]).toMatchObject({ startAt: '2026-03-11', endAt: '2026-03-12' });
  });

  it('suggests actions, not times, for completeness conflicts', () => {
    const ds = baseDataset({ releases: [rel({ id: 'a', changeClass: 'normal', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T15:00') })] });
    const [c] = evaluate(ds, UTC);
    expect(c!.suggestions).toEqual([
      { kind: 'action', releaseId: 'a', label: 'Add a rollback plan in the release drawer' },
      { kind: 'action', releaseId: 'a', label: 'Add a test plan in the release drawer' },
    ]);
  });

  it('offers ECAB sign-off first for an emergency change in a freeze', () => {
    const ds = baseDataset({
      windows: [{ id: 'fz', kind: 'freeze', name: 'Freeze', scope: {}, startAt: at('2026-03-10T00:00'), endAt: at('2026-03-11T00:00') }],
      releases: [rel({ id: 'e', changeClass: 'emergency', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T15:00') })],
      changeRequests: [fullCr('e')],
    });
    const [c] = evaluate(ds, UTC);
    expect(c!.suggestions[0]).toMatchObject({ kind: 'action' });
    expect(c!.suggestions.length).toBeLessThanOrEqual(3);
    expect(c!.suggestions[1]).toMatchObject({ kind: 'reschedule', startAt: at('2026-03-11T00:00') });
  });

  it('says so when no slot is free within the horizon', () => {
    const ds = baseDataset({
      windows: [{ id: 'fz', kind: 'freeze', name: 'Long freeze', scope: {}, startAt: at('2026-03-01T00:00'), endAt: at('2026-06-01T00:00') }],
      releases: [rel({ id: 'a', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T15:00') })],
    });
    const [c] = evaluate(ds, UTC);
    expect(c!.suggestions).toEqual([{ kind: 'action', releaseId: 'a', label: 'No free slot in the next 28 days; replan manually' }]);
  });
});
