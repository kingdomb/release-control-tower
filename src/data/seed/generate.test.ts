import { describe, expect, it } from 'vitest';
import { isValidTimed } from '../../domain/time';
import { evaluate } from '../../engine/evaluate';
import { rippleEffect } from '../../engine/ripple';
import { remainingTimedConflicts } from '../../engine/__tests__/fixtures';
import { generateSeed, mondayOf, PLANTED } from './generate';

const ANCHORS = ['2026-03-09', '2026-10-05', '2026-12-21', '2027-06-14'];
const ZONES = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Pacific/Auckland'];

const signature = (c: { rule: string; releaseIds: string[] }) => `${c.rule}:${[...c.releaseIds].sort().join(',')}`;

/** Written out by hand here (not derived from the generator) so the check is not circular. */
const EXPECTED = [
  'completeness:rel-p8-data-stg',
  'dependency-order:rel-p7-identity-stg,rel-p7-partner-dev',
  'environment-double-booking:rel-p3-search-stg',
  'guardrail:rel-p4-vault-prod',
  'guardrail:rel-p5-ios-stg',
  'guardrail:rel-p6-payments-prod',
  'time-overlap:rel-p1-checkout-dev,rel-p1-checkout-stg',
  'time-overlap:rel-p2-billing-stg,rel-p2-portal-dev',
];

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
      expect(conflicts.map(signature).sort()).toEqual(EXPECTED);
    },
  );

  it('documents the same eight conflicts it plants', () => {
    expect(PLANTED.map(signature).sort()).toEqual(EXPECTED);
  });

  it('a different PRNG seed moves the other releases but keeps exactly the planted conflicts', () => {
    const other = generateSeed({ anchor: new Date('2026-10-07T12:00:00Z'), seed: 7 });
    const organic = (d: typeof ds) => d.releases.filter((r) => !r.id.startsWith('rel-p')).map((r) => r.startAt);
    expect(organic(other)).not.toEqual(organic(ds));
    expect(evaluate(other, { timeZone: 'UTC', withSuggestions: false }).map(signature).sort()).toEqual(EXPECTED);
  });

  it('spreads releases across all 8 weeks', () => {
    const anchor = mondayOf(new Date('2026-10-07T12:00:00Z')).getTime();
    const perWeek = Array.from({ length: 8 }, () => 0);
    for (const r of ds.releases) perWeek[Math.floor((Date.parse(r.startAt) - anchor) / (7 * 86_400_000))]! += 1;
    for (const n of perWeek) expect(n).toBeGreaterThanOrEqual(3);
  });

  it('every team has at least one release', () => {
    const teamsWithReleases = new Set(ds.releases.map((r) => ds.products.find((p) => p.id === r.productId)!.teamId));
    expect(teamsWithReleases.size).toBe(15);
  });

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

  it.each(['UTC', 'America/New_York'])(
    'in %s, every seed suggestion independently clears all time-based rules',
    async (timeZone) => {
      const conflicts = evaluate(ds, { timeZone });
      for (const c of conflicts) {
        expect(c.suggestions.length).toBeGreaterThanOrEqual(1);
        expect(c.suggestions.length).toBeLessThanOrEqual(3);
        if (c.rule !== 'completeness') expect(c.suggestions.some((s) => s.kind === 'reschedule')).toBe(true);
        for (const sug of c.suggestions) {
          if (sug.kind !== 'reschedule') continue;
          expect(await remainingTimedConflicts(ds, sug.releaseId, sug.startAt, sug.endAt, { timeZone })).toEqual([]);
        }
      }
    },
  );

  it('contains dependency chains with a visible ripple effect', () => {
    const roots = ds.dependencies.map((d) => d.dependsOnReleaseId).filter((id) => !ds.dependencies.some((d) => d.releaseId === id));
    const longest = Math.max(...roots.map((id) => Math.max(0, ...rippleEffect(ds, id, { timeZone: 'UTC' }).map((r) => r.depth))));
    expect(longest).toBeGreaterThanOrEqual(2);
  });

  it('uses only this reviewed, invented vocabulary (no real employers, clients, or people)', () => {
    // Every name-like string in the seed must appear in this list. Adding a string to the seed
    // fails this test until someone reviews it and adds it here.
    const names = [
      ...ds.teams.map((x) => x.name),
      ...ds.products.map((x) => x.name),
      ...ds.environments.map((x) => x.name),
      ...ds.configItems.map((x) => x.name),
      ...ds.windows.map((x) => x.name),
      ...ds.bookings.flatMap((x) => [x.title, x.owner]),
    ];
    expect([...new Set(names)].sort()).toEqual(
      [
        // teams
        'Payments Core', 'Checkout', 'Identity', 'Mobile Apps', 'Search', 'Catalog', 'Billing', 'Customer Portal',
        'Data Platform', 'Notifications', 'Fulfillment', 'Analytics', 'Partner Integrations', 'Platform SRE', 'Messaging',
        // products
        'Payments API', 'Card Vault', 'Checkout Web', 'Cart Service', 'Identity Service', 'iOS App', 'Android App',
        'Search Indexer', 'Catalog Service', 'Pricing Engine', 'Billing API', 'Data Lake Pipelines', 'Notification Hub',
        'Fulfillment Router', 'Warehouse Sync', 'Insights Dashboard', 'Partner Gateway', 'Observability Stack', 'Edge Proxy',
        'Event Bus', 'Email Relay',
        // environments
        'Dev', 'Staging/UAT', 'Production',
        // configuration items not already listed
        'Orders Database', 'Customer Database', 'Event Bus Cluster', 'Search Cluster', 'Data Lake', 'Payments App',
        'Checkout App', 'Cart App', 'Mobile Backend-for-Frontend', 'Catalog App', 'Pricing App', 'Billing App', 'Portal App',
        'Notification App', 'Fulfillment App', 'Insights App',
        // windows and bookings
        'Saturday production maintenance', 'Mobile app-store submission freeze', 'Quarter-end financial close',
        'Seasonal sale launch', 'Regression test cycle', 'QA Guild', 'Load test', 'Business UAT sign-off', 'Product',
      ].filter((v, i, a) => a.indexOf(v) === i).sort(),
    );

    const productNames = ds.products.map((p) => p.name);
    for (const r of ds.releases) expect(productNames.some((n) => r.title.startsWith(`${n} `))).toBe(true);

    const allowedCr = new Set([
      'Low: backwards-compatible change behind a feature flag.', 'Medium: schema change on a shared table.', 'Low: config-only change.',
      'Pipeline deploy, canary 10% then 100%.', 'Blue/green switch after health checks.', 'Rolling deploy, one node at a time.',
      'Redeploy the previous tag from the pipeline.', 'Switch traffic back to the blue stack.', 'Disable the feature flag, then redeploy.',
      'Automated smoke suite plus synthetic checkout.', 'Contract tests and a manual UAT pass.', 'Run regression pack; monitor error rate 30 min.',
      '',
    ]);
    for (const cr of ds.changeRequests) {
      const r = ds.releases.find((x) => x.id === cr.releaseId)!;
      expect(cr.description).toBe(`Deploy ${r.title}.`);
      for (const f of [cr.impactRisk, cr.implementationPlan, cr.rollbackPlan, cr.testPlan]) expect(allowedCr.has(f)).toBe(true);
    }
  });
});
