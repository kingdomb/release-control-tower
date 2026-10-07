import { describe, expect, it } from 'vitest';
import { rippleEffect } from '../ripple';
import { at, baseDataset, rel, UTC } from './fixtures';

const t = (day: number) => ({ startAt: at(`2026-03-${String(day).padStart(2, '0')}T14:00`), endAt: at(`2026-03-${String(day).padStart(2, '0')}T15:00`) });

describe('ripple effect', () => {
  it('follows explicit dependency chains transitively with depth and path', () => {
    const ds = baseDataset({
      releases: [rel({ id: 'a', ...t(10) }), rel({ id: 'b', ...t(11) }), rel({ id: 'c', ...t(12) }), rel({ id: 'x', ...t(13) })],
      dependencies: [
        { releaseId: 'b', dependsOnReleaseId: 'a' },
        { releaseId: 'c', dependsOnReleaseId: 'b' },
      ],
    });
    expect(rippleEffect(ds, 'a', UTC)).toEqual([
      { releaseId: 'b', depth: 1, via: 'dependency', fromReleaseId: 'a', path: ['a', 'b'] },
      { releaseId: 'c', depth: 2, via: 'dependency', fromReleaseId: 'b', path: ['a', 'b', 'c'] },
    ]);
  });

  it('follows configuration-item mapping to later releases of dependent assets', () => {
    // Checkout App depends on Orders DB; Edge Gateway depends on Checkout App.
    const ds = baseDataset({
      releases: [
        rel({ id: 'db-upgrade', configItemIds: ['db'], ...t(10) }),
        rel({ id: 'app-later', productId: 'p3', configItemIds: ['app'], ...t(12) }),
        rel({ id: 'app-earlier', productId: 'p3', configItemIds: ['app'], ...t(9) }),
        rel({ id: 'edge-later', productId: 'p2', configItemIds: ['edge'], ...t(14) }),
        rel({ id: 'db-peer', productId: 'p2', configItemIds: ['db'], ...t(15) }),
      ],
    });
    const out = rippleEffect(ds, 'db-upgrade', UTC);
    // Edge Gateway depends on the DB transitively (edge -> app -> db), so its release is
    // directly affected by the DB release: depth 1, even though it is two asset hops away.
    expect(out).toEqual([
      { releaseId: 'app-later', depth: 1, via: 'config-item', fromReleaseId: 'db-upgrade', path: ['db-upgrade', 'app-later'] },
      { releaseId: 'edge-later', depth: 1, via: 'config-item', fromReleaseId: 'db-upgrade', path: ['db-upgrade', 'edge-later'] },
    ]);
  });

  it('combines both edge kinds', () => {
    const ds = baseDataset({
      releases: [
        rel({ id: 'db-upgrade', configItemIds: ['db'], ...t(10) }),
        rel({ id: 'app', productId: 'p3', configItemIds: ['app'], ...t(12) }),
        rel({ id: 'mobile', productId: 'p3', ...t(14) }),
      ],
      dependencies: [{ releaseId: 'mobile', dependsOnReleaseId: 'app' }],
    });
    const out = rippleEffect(ds, 'db-upgrade', UTC);
    expect(out.map((r) => r.releaseId)).toEqual(['app', 'mobile']);
    expect(out[1]!.path).toEqual(['db-upgrade', 'app', 'mobile']);
  });

  it('terminates on dependency cycles and reports each release once', () => {
    const ds = baseDataset({
      releases: [rel({ id: 'a', ...t(10) }), rel({ id: 'b', ...t(11) })],
      dependencies: [
        { releaseId: 'b', dependsOnReleaseId: 'a' },
        { releaseId: 'a', dependsOnReleaseId: 'b' },
      ],
    });
    expect(rippleEffect(ds, 'a', UTC).map((r) => r.releaseId)).toEqual(['b']);
  });

  it('skips cancelled releases and unknown ids', () => {
    const ds = baseDataset({
      releases: [rel({ id: 'a', ...t(10) }), rel({ id: 'b', status: 'cancelled', ...t(11) })],
      dependencies: [{ releaseId: 'b', dependsOnReleaseId: 'a' }],
    });
    expect(rippleEffect(ds, 'a', UTC)).toEqual([]);
    expect(rippleEffect(ds, 'nope', UTC)).toEqual([]);
  });

  it('lists explicit dependents even when they are (wrongly) scheduled earlier', () => {
    const ds = baseDataset({
      releases: [rel({ id: 'a', ...t(12) }), rel({ id: 'b', ...t(10) })],
      dependencies: [{ releaseId: 'b', dependsOnReleaseId: 'a' }],
    });
    expect(rippleEffect(ds, 'a', UTC).map((r) => r.releaseId)).toEqual(['b']);
  });
});
