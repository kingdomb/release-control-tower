import { describe, expect, it } from 'vitest';
import { buildContext } from '../context';
import { dependencyOrder } from '../dependencyOrder';
import { at, baseDataset, rel, UTC } from './fixtures';

const run = (ds = baseDataset()) => dependencyOrder(buildContext(ds, UTC));

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
});
