import { describe, expect, it } from 'vitest';
import type { Window } from '../../domain/types';
import { buildContext } from '../context';
import { guardrail } from '../guardrail';
import { at, baseDataset, NY, rel, UTC } from './fixtures';

const run = (ds = baseDataset(), opts = UTC) => guardrail(buildContext(ds, opts));

const blackout: Window = {
  id: 'bo',
  kind: 'blackout',
  name: 'Quarter close',
  scope: { environmentIds: ['prod'] },
  startAt: at('2026-03-10T00:00'),
  endAt: at('2026-03-12T00:00'),
};
const freeze: Window = {
  id: 'fz',
  kind: 'freeze',
  name: 'Mobile freeze',
  scope: { teamIds: ['t2'] },
  startAt: at('2026-03-10T00:00'),
  endAt: at('2026-03-12T00:00'),
};
const maint: Window = {
  id: 'mw',
  kind: 'maintenance',
  name: 'Saturday window',
  scope: { environmentIds: ['prod'] },
  startAt: at('2026-03-14T14:00'),
  endAt: at('2026-03-14T22:00'),
};

describe('rule 3: guardrail violations', () => {
  it('flags a release inside a blackout window as critical', () => {
    const ds = baseDataset({
      windows: [blackout],
      releases: [rel({ id: 'a', environmentId: 'prod', startAt: at('2026-03-11T10:00'), endAt: at('2026-03-11T11:00') })],
    });
    const out = run(ds);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: 'guardrail', releaseIds: ['a'], relatedIds: ['bo'], severity: 'critical', moveReleaseId: 'a' });
    expect(out[0]!.message).toContain('blackout window "Quarter close"');
  });

  it('respects environment scope', () => {
    const ds = baseDataset({
      windows: [blackout],
      releases: [rel({ id: 'a', environmentId: 'stg', startAt: at('2026-03-11T10:00'), endAt: at('2026-03-11T11:00') })],
    });
    expect(run(ds)).toEqual([]);
  });

  it('respects team scope for a freeze', () => {
    const ds = baseDataset({
      windows: [freeze],
      releases: [
        rel({ id: 'mobile', productId: 'p3', startAt: at('2026-03-11T10:00'), endAt: at('2026-03-11T11:00') }),
        rel({ id: 'payments', productId: 'p1', startAt: at('2026-03-11T10:00'), endAt: at('2026-03-11T11:00') }),
      ],
    });
    const out = run(ds);
    expect(out.map((c) => c.releaseIds[0])).toEqual(['mobile']);
    expect(out[0]).toMatchObject({ severity: 'critical', relatedIds: ['fz'] });
    expect(out[0]!.message).toBe(
      '"Release mobile" falls inside freeze window "Mobile freeze" (Tue 10 Mar, 00:00 – Thu 12 Mar, 00:00).',
    );
  });

  it('does not flag a release that ends exactly when the blackout starts', () => {
    const ds = baseDataset({
      windows: [blackout],
      releases: [rel({ id: 'a', environmentId: 'prod', startAt: at('2026-03-09T22:00'), endAt: at('2026-03-10T00:00') })],
    });
    expect(run(ds)).toEqual([]);
  });

  it('reports an emergency change in a freeze at medium severity with ECAB wording', () => {
    const ds = baseDataset({
      windows: [freeze],
      releases: [rel({ id: 'a', productId: 'p3', changeClass: 'emergency', startAt: at('2026-03-11T10:00'), endAt: at('2026-03-11T11:00') })],
    });
    const out = run(ds);
    expect(out[0]).toMatchObject({ severity: 'medium' });
    expect(out[0]!.message).toContain('ECAB');
  });

  it('flags a Normal prod change outside the maintenance window', () => {
    const ds = baseDataset({
      windows: [maint],
      releases: [rel({ id: 'a', environmentId: 'prod', changeClass: 'normal', startAt: at('2026-03-13T14:00'), endAt: at('2026-03-13T15:00') })],
    });
    const out = run(ds);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'guardrail:a|outside-maintenance', severity: 'high' });
  });

  it('accepts a Normal prod change fully inside the window, including its exact bounds', () => {
    const ds = baseDataset({
      windows: [maint],
      releases: [rel({ id: 'a', environmentId: 'prod', changeClass: 'normal', startAt: at('2026-03-14T14:00'), endAt: at('2026-03-14T22:00') })],
    });
    expect(run(ds)).toEqual([]);
  });

  it('flags a Normal prod change that only partly overlaps the window', () => {
    const ds = baseDataset({
      windows: [maint],
      releases: [rel({ id: 'a', environmentId: 'prod', changeClass: 'normal', startAt: at('2026-03-14T21:00'), endAt: at('2026-03-14T23:00') })],
    });
    expect(run(ds)).toHaveLength(1);
  });

  it('exempts Standard and Emergency changes and non-prod environments from the maintenance rule', () => {
    const ds = baseDataset({
      windows: [maint],
      releases: [
        rel({ id: 's', environmentId: 'prod', changeClass: 'standard', startAt: at('2026-03-13T14:00'), endAt: at('2026-03-13T15:00') }),
        rel({ id: 'e', productId: 'p2', environmentId: 'prod', changeClass: 'emergency', startAt: at('2026-03-13T16:00'), endAt: at('2026-03-13T17:00') }),
        rel({ id: 'n', productId: 'p3', environmentId: 'stg', changeClass: 'normal', startAt: at('2026-03-13T14:00'), endAt: at('2026-03-13T15:00') }),
      ],
    });
    expect(run(ds)).toEqual([]);
  });

  it('does not enforce maintenance windows when none are defined for the environment', () => {
    const ds = baseDataset({
      releases: [rel({ id: 'a', environmentId: 'prod', changeClass: 'normal', startAt: at('2026-03-13T14:00'), endAt: at('2026-03-13T15:00') })],
    });
    expect(run(ds)).toEqual([]);
  });

  it('resolves an all-day blackout on a DST-change day in the evaluation time zone', () => {
    // 8 Mar 2026 is the US spring-forward day: in New York it runs 05:00Z to 04:00Z (23 hours).
    const dstBlackout: Window = { ...blackout, allDay: true, startAt: '2026-03-08', endAt: '2026-03-09' };
    const ds = baseDataset({
      windows: [dstBlackout],
      releases: [rel({ id: 'late', environmentId: 'prod', startAt: at('2026-03-09T03:30'), endAt: at('2026-03-09T03:45') })],
    });
    expect(run(ds, NY)).toHaveLength(1);
    expect(run(ds, UTC)).toEqual([]);
  });

  it('does not flag a release that starts exactly when the blackout ends', () => {
    const ds = baseDataset({
      windows: [blackout],
      releases: [rel({ id: 'a', environmentId: 'prod', startAt: at('2026-03-12T00:00'), endAt: at('2026-03-12T01:00') })],
    });
    expect(run(ds)).toEqual([]);
  });

  it('flags a release that straddles the blackout edge', () => {
    const ds = baseDataset({
      windows: [blackout],
      releases: [rel({ id: 'a', environmentId: 'prod', startAt: at('2026-03-11T23:30'), endAt: at('2026-03-12T00:30') })],
    });
    expect(run(ds)).toHaveLength(1);
  });

  it('does not flag a freeze-scoped release that touches the freeze boundaries', () => {
    const ds = baseDataset({
      windows: [freeze],
      releases: [
        rel({ id: 'before', productId: 'p3', startAt: at('2026-03-09T23:00'), endAt: at('2026-03-10T00:00') }),
        rel({ id: 'after', productId: 'p3', startAt: at('2026-03-12T00:00'), endAt: at('2026-03-12T01:00') }),
      ],
    });
    expect(run(ds)).toEqual([]);
  });

  it('resolves an all-day freeze in the evaluation time zone', () => {
    const allDayFreeze: Window = { ...freeze, allDay: true, startAt: '2026-03-10', endAt: '2026-03-11' };
    const ds = baseDataset({
      windows: [allDayFreeze],
      releases: [rel({ id: 'a', productId: 'p3', startAt: at('2026-03-11T02:00'), endAt: at('2026-03-11T03:00') })],
    });
    expect(run(ds, NY)).toHaveLength(1);
    expect(run(ds, UTC)).toEqual([]);
  });

  it('resolves an all-day maintenance window in the evaluation time zone', () => {
    const allDayMaint: Window = { ...maint, allDay: true, startAt: '2026-03-14', endAt: '2026-03-15' };
    // 02:00Z-03:00Z on 15 Mar is still 14 Mar in New York (inside), but 15 Mar in UTC (outside).
    const ds = baseDataset({
      windows: [allDayMaint],
      releases: [rel({ id: 'a', environmentId: 'prod', changeClass: 'normal', startAt: at('2026-03-15T02:00'), endAt: at('2026-03-15T03:00') })],
    });
    expect(run(ds, NY)).toEqual([]);
    expect(run(ds, UTC)).toHaveLength(1);
  });

  it('accepts a Normal prod change spanning two back-to-back maintenance windows', () => {
    const next: Window = { ...maint, id: 'mw2', startAt: at('2026-03-14T22:00'), endAt: at('2026-03-15T04:00') };
    const ds = baseDataset({
      windows: [maint, next],
      releases: [rel({ id: 'a', environmentId: 'prod', changeClass: 'normal', startAt: at('2026-03-14T21:00'), endAt: at('2026-03-14T23:00') })],
    });
    expect(run(ds)).toEqual([]);
  });

  it('flags a change spanning two maintenance windows with a gap between them', () => {
    const later: Window = { ...maint, id: 'mw2', startAt: at('2026-03-14T22:30'), endAt: at('2026-03-15T04:00') };
    const ds = baseDataset({
      windows: [maint, later],
      releases: [rel({ id: 'a', environmentId: 'prod', changeClass: 'normal', startAt: at('2026-03-14T21:00'), endAt: at('2026-03-14T23:00') })],
    });
    expect(run(ds)).toHaveLength(1);
  });
});
