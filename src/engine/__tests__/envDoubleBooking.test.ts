import { describe, expect, it } from 'vitest';
import { buildContext } from '../context';
import { envDoubleBooking } from '../envDoubleBooking';
import { at, baseDataset, NY, rel, UTC } from './fixtures';

const run = (ds = baseDataset(), opts = UTC) => envDoubleBooking(buildContext(ds, opts));

describe('rule 2: environment double-booking', () => {
  it('flags two releases of different products on one environment', () => {
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', productId: 'p1', environmentId: 'prod', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
        rel({ id: 'b', productId: 'p3', environmentId: 'prod', startAt: at('2026-03-10T15:00'), endAt: at('2026-03-10T15:30') }),
      ],
    });
    const out = run(ds);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ releaseIds: ['a', 'b'], severity: 'high', moveReleaseId: 'b' });
    expect(out[0]!.relatedIds).toEqual(['prod']);
    expect(out[0]!.message).toBe(
      'Production is double-booked: "Release a" (Tue 10 Mar, 14:00 – 16:00) overlaps "Release b" (Tue 10 Mar, 15:00 – 15:30).',
    );
  });

  it('scales severity with the environment kind', () => {
    const mk = (env: string) =>
      run(
        baseDataset({
          releases: [
            rel({ id: 'a', productId: 'p1', environmentId: env, startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
            rel({ id: 'b', productId: 'p3', environmentId: env, startAt: at('2026-03-10T15:00'), endAt: at('2026-03-10T17:00') }),
          ],
        }),
      )[0]!.severity;
    expect([mk('prod'), mk('stg'), mk('dev')]).toEqual(['high', 'medium', 'low']);
  });

  it('ignores overlapping releases on different environments', () => {
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', productId: 'p1', environmentId: 'stg', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
        rel({ id: 'b', productId: 'p3', environmentId: 'prod', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
      ],
    });
    expect(run(ds)).toEqual([]);
  });

  it('does not flag back-to-back bookings', () => {
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', productId: 'p1', environmentId: 'stg', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
        rel({ id: 'b', productId: 'p3', environmentId: 'stg', startAt: at('2026-03-10T16:00'), endAt: at('2026-03-10T17:00') }),
      ],
    });
    expect(run(ds)).toEqual([]);
  });

  it('flags a release that collides with a QA booking and moves the release', () => {
    const ds = baseDataset({
      releases: [rel({ id: 'a', environmentId: 'stg', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') })],
      bookings: [
        { id: 'qa1', environmentId: 'stg', title: 'Regression cycle', owner: 'QA', startAt: at('2026-03-10T09:00'), endAt: at('2026-03-10T15:00') },
      ],
    });
    const out = run(ds);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ releaseIds: ['a'], relatedIds: ['stg', 'qa1'], moveReleaseId: 'a' });
    expect(out[0]!.message).toContain('Regression cycle (QA)');
  });

  it('flags two overlapping bookings with no release involved', () => {
    const ds = baseDataset({
      bookings: [
        { id: 'qa1', environmentId: 'stg', title: 'Regression', owner: 'QA', startAt: at('2026-03-10T09:00'), endAt: at('2026-03-10T15:00') },
        { id: 'qa2', environmentId: 'stg', title: 'Perf test', owner: 'SRE', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T18:00') },
      ],
    });
    const out = run(ds);
    expect(out).toHaveLength(1);
    expect(out[0]!.releaseIds).toEqual([]);
    expect(out[0]!.moveReleaseId).toBeUndefined();
  });

  it('treats an all-day booking as the whole local day', () => {
    const ds = baseDataset({
      releases: [rel({ id: 'a', environmentId: 'stg', startAt: at('2026-03-11T02:00'), endAt: at('2026-03-11T03:00') })],
      bookings: [{ id: 'qa1', environmentId: 'stg', title: 'UAT day', owner: 'Business', allDay: true, startAt: '2026-03-10', endAt: '2026-03-11' }],
    });
    // 02:00Z on 11 Mar is still 10 Mar (22:00) in New York.
    expect(run(ds, NY)).toHaveLength(1);
    expect(run(ds, UTC)).toEqual([]);
  });

  it('ignores cancelled releases', () => {
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', productId: 'p1', environmentId: 'prod', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
        rel({ id: 'b', productId: 'p3', environmentId: 'prod', status: 'cancelled', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
      ],
    });
    expect(run(ds)).toEqual([]);
  });

  it('does not flag a release that starts exactly when a booking ends', () => {
    const ds = baseDataset({
      releases: [rel({ id: 'a', environmentId: 'stg', startAt: at('2026-03-10T15:00'), endAt: at('2026-03-10T16:00') })],
      bookings: [{ id: 'qa1', environmentId: 'stg', title: 'Regression', owner: 'QA', startAt: at('2026-03-10T09:00'), endAt: at('2026-03-10T15:00') }],
    });
    expect(run(ds)).toEqual([]);
  });

  it('compares offset timestamps as instants', () => {
    // 09:30-05:00 is 14:30Z, inside the 14:00Z-16:00Z release.
    const ds = baseDataset({
      releases: [rel({ id: 'a', environmentId: 'stg', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') })],
      bookings: [{ id: 'qa1', environmentId: 'stg', title: 'Perf', owner: 'SRE', startAt: '2026-03-10T09:30:00-05:00', endAt: '2026-03-10T10:00:00-05:00' }],
    });
    expect(run(ds)).toHaveLength(1);
  });

  it('reports a same-product, same-environment overlap here and under rule 1 (two distinct problems)', async () => {
    const { evaluate } = await import('../evaluate');
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', environmentId: 'stg', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
        rel({ id: 'b', environmentId: 'stg', startAt: at('2026-03-10T15:00'), endAt: at('2026-03-10T17:00') }),
      ],
    });
    expect(evaluate(ds, { ...UTC, withSuggestions: false }).map((c) => c.rule).sort()).toEqual(['environment-double-booking', 'time-overlap']);
  });
});
