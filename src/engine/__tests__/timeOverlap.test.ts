import { describe, expect, it } from 'vitest';
import { buildContext } from '../context';
import { timeOverlap } from '../timeOverlap';
import { at, baseDataset, NY, rel, UTC } from './fixtures';

const run = (ds = baseDataset(), opts = UTC, focus?: string) => timeOverlap(buildContext(ds, opts, focus));

describe('rule 1: time overlap', () => {
  it('flags two releases of the same product with overlapping times', () => {
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
        rel({ id: 'b', environmentId: 'stg', startAt: at('2026-03-10T15:00'), endAt: at('2026-03-10T17:00') }),
      ],
    });
    const out = run(ds);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: 'time-overlap', releaseIds: ['a', 'b'], severity: 'medium', moveReleaseId: 'b' });
    expect(out[0]!.message).toContain('same product (Payments API)');
  });

  it('does not flag ranges that only touch (end == start)', () => {
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
        rel({ id: 'b', startAt: at('2026-03-10T16:00'), endAt: at('2026-03-10T18:00') }),
      ],
    });
    expect(run(ds)).toEqual([]);
  });

  it('flags different products that share a configuration item', () => {
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', productId: 'p1', configItemIds: ['db'], startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
        rel({ id: 'b', productId: 'p3', configItemIds: ['db', 'app'], startAt: at('2026-03-10T15:59'), endAt: at('2026-03-10T17:00') }),
      ],
    });
    const out = run(ds);
    expect(out).toHaveLength(1);
    expect(out[0]!.relatedIds).toEqual(['db']);
    expect(out[0]!.message).toContain('Orders DB');
  });

  it('ignores different products without a shared configuration item', () => {
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', productId: 'p1', configItemIds: ['db'], startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
        rel({ id: 'b', productId: 'p3', configItemIds: ['app'], startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
      ],
    });
    expect(run(ds)).toEqual([]);
  });

  it('ignores cancelled releases', () => {
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
        rel({ id: 'b', status: 'cancelled', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
      ],
    });
    expect(run(ds)).toEqual([]);
  });

  it('is high severity when production is involved', () => {
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', environmentId: 'prod', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
        rel({ id: 'b', startAt: at('2026-03-10T15:00'), endAt: at('2026-03-10T17:00') }),
      ],
    });
    expect(run(ds)[0]!.severity).toBe('high');
  });

  it('compares instants, not wall-clock strings, across offsets', () => {
    // 10:00-05:00 is 15:00Z, so it overlaps 15:30Z-16:00Z.
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', startAt: '2026-03-10T10:00:00-05:00', endAt: '2026-03-10T12:00:00-05:00' }),
        rel({ id: 'b', startAt: '2026-03-10T15:30:00Z', endAt: '2026-03-10T16:00:00Z' }),
      ],
    });
    expect(run(ds)).toHaveLength(1);
  });

  it('resolves all-day releases in the evaluation time zone', () => {
    // All-day 10 Mar in New York ends at 2026-03-11T04:00Z; in UTC it ends at 00:00Z.
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', allDay: true, startAt: '2026-03-10', endAt: '2026-03-11' }),
        rel({ id: 'b', startAt: at('2026-03-11T03:00'), endAt: at('2026-03-11T03:30') }),
      ],
    });
    expect(run(ds, NY)).toHaveLength(1);
    expect(run(ds, UTC)).toEqual([]);
  });

  it('two all-day releases on consecutive days do not overlap', () => {
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', allDay: true, startAt: '2026-03-10', endAt: '2026-03-11' }),
        rel({ id: 'b', allDay: true, startAt: '2026-03-11', endAt: '2026-03-12' }),
      ],
    });
    expect(run(ds, NY)).toEqual([]);
  });

  it('in focus mode only reports conflicts involving the focus release', () => {
    // a-b and b-c overlap; a and c do not.
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
        rel({ id: 'b', startAt: at('2026-03-10T15:00'), endAt: at('2026-03-10T17:00') }),
        rel({ id: 'c', startAt: at('2026-03-10T16:30'), endAt: at('2026-03-10T18:00') }),
      ],
    });
    expect(run(ds).map((c) => c.releaseIds)).toEqual([['a', 'b'], ['b', 'c']]);
    expect(run(ds, UTC, 'a').map((c) => c.releaseIds)).toEqual([['a', 'b']]);
    expect(run(ds, UTC, 'c').map((c) => c.releaseIds)).toEqual([['b', 'c']]);
  });

  it('does not flag shared configuration items when the ranges only touch', () => {
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', productId: 'p1', configItemIds: ['db'], startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
        rel({ id: 'b', productId: 'p3', configItemIds: ['db'], startAt: at('2026-03-10T16:00'), endAt: at('2026-03-10T17:00') }),
      ],
    });
    expect(run(ds)).toEqual([]);
  });
});
