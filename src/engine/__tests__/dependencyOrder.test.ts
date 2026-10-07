import { describe, expect, it } from 'vitest';
import { buildContext } from '../context';
import { dependencyOrder } from '../dependencyOrder';
import { at, baseDataset, NY, rel, UTC } from './fixtures';
import type { EvalOptions } from '../context';

const run = (ds = baseDataset(), opts: EvalOptions = UTC) => dependencyOrder(buildContext(ds, opts));

const pair = (dependentStart: string, dependentEnd: string, over: { cancelled?: boolean } = {}) =>
  baseDataset({
    releases: [
      rel({ id: 'api', productId: 'p1', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T16:00') }),
      rel({
        id: 'app',
        productId: 'p3',
        status: over.cancelled ? 'cancelled' : 'planned',
        startAt: at(dependentStart),
        endAt: at(dependentEnd),
      }),
    ],
    dependencies: [{ releaseId: 'app', dependsOnReleaseId: 'api' }],
  });

describe('rule 4: dependency order', () => {
  it('flags a release scheduled before the release it depends on', () => {
    const out = run(pair('2026-03-09T14:00', '2026-03-09T15:00'));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: 'dependency-order', releaseIds: ['app', 'api'], severity: 'high', moveReleaseId: 'app' });
    expect(out[0]!.message).toBe(
      '"Release app" starts Mon 09 Mar, 14:00 but depends on "Release api", which does not finish until Tue 10 Mar, 16:00.',
    );
  });

  it('flags a dependent that starts while its dependency is still running', () => {
    expect(run(pair('2026-03-10T15:00', '2026-03-10T17:00'))).toHaveLength(1);
  });

  it('accepts a dependent that starts exactly when the dependency finishes', () => {
    expect(run(pair('2026-03-10T16:00', '2026-03-10T17:00'))).toEqual([]);
  });

  it('accepts a dependent scheduled after its dependency', () => {
    expect(run(pair('2026-03-11T09:00', '2026-03-11T10:00'))).toEqual([]);
  });

  it('ignores cancelled releases', () => {
    expect(run(pair('2026-03-09T14:00', '2026-03-09T15:00', { cancelled: true }))).toEqual([]);
  });

  it('ignores dependencies that point at unknown releases', () => {
    const ds = baseDataset({
      releases: [rel({ id: 'app', startAt: at('2026-03-09T14:00'), endAt: at('2026-03-09T15:00') })],
      dependencies: [{ releaseId: 'app', dependsOnReleaseId: 'ghost' }],
    });
    expect(run(ds)).toEqual([]);
  });

  it('reports each broken hop of a multi-hop chain separately', () => {
    const ds = baseDataset({
      releases: [
        rel({ id: 'a', startAt: at('2026-03-12T14:00'), endAt: at('2026-03-12T15:00') }),
        rel({ id: 'b', productId: 'p2', startAt: at('2026-03-11T14:00'), endAt: at('2026-03-11T15:00') }),
        rel({ id: 'c', productId: 'p3', startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T15:00') }),
      ],
      dependencies: [
        { releaseId: 'b', dependsOnReleaseId: 'a' },
        { releaseId: 'c', dependsOnReleaseId: 'b' },
      ],
    });
    expect(run(ds).map((c) => c.releaseIds)).toEqual([
      ['b', 'a'],
      ['c', 'b'],
    ]);
  });

  it('resolves all-day releases in the evaluation time zone', () => {
    // The all-day dependency (10 Mar) ends at 04:00Z on 11 Mar in New York, 00:00Z in UTC.
    const ds = baseDataset({
      releases: [
        rel({ id: 'api', allDay: true, startAt: '2026-03-10', endAt: '2026-03-11' }),
        rel({ id: 'app', productId: 'p3', startAt: at('2026-03-11T02:00'), endAt: at('2026-03-11T03:00') }),
      ],
      dependencies: [{ releaseId: 'app', dependsOnReleaseId: 'api' }],
    });
    expect(run(ds, NY)).toHaveLength(1);
    expect(run(ds, UTC)).toEqual([]);
  });

  it('compares offset timestamps as instants', () => {
    // Dependency ends 11:00-05:00 = 16:00Z; dependent starts 15:30Z, so it starts too early.
    const ds = baseDataset({
      releases: [
        rel({ id: 'api', startAt: '2026-03-10T09:00:00-05:00', endAt: '2026-03-10T11:00:00-05:00' }),
        rel({ id: 'app', productId: 'p3', startAt: at('2026-03-10T15:30'), endAt: at('2026-03-10T16:30') }),
      ],
      dependencies: [{ releaseId: 'app', dependsOnReleaseId: 'api' }],
    });
    expect(run(ds)).toHaveLength(1);
  });
});
