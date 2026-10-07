/**
 * Deterministic synthetic data for a fictional online retailer.
 * Nothing here refers to a real employer, client, or person.
 *
 * Layout: 15 teams, 22 products, 3 environments, 60 releases over 8 weeks starting on
 * `anchor` (a Monday, 00:00 UTC). Eight conflicts are planted on purpose (PLANTED below);
 * every other release is placed with the rule engine so it cannot create a conflict.
 * All seed times are UTC instants, so the result does not depend on the viewer's time zone.
 */
import { DAY, HOUR, iso } from '../../domain/time';
import type {
  ChangeClass,
  ChangeRequest,
  ConfigItem,
  Dataset,
  Dependency,
  Environment,
  EnvironmentBooking,
  Product,
  Release,
  RuleId,
  Team,
  Window,
} from '../../domain/types';
import { slotIsClear } from '../../engine/suggest';
import { mulberry32, type Prng } from './prng';

export const SEED = 20261007;

export const teams: Team[] = [
  ['payments', 'Payments Core'],
  ['checkout', 'Checkout'],
  ['identity', 'Identity'],
  ['mobile', 'Mobile Apps'],
  ['search', 'Search'],
  ['catalog', 'Catalog'],
  ['billing', 'Billing'],
  ['portal', 'Customer Portal'],
  ['data', 'Data Platform'],
  ['notify', 'Notifications'],
  ['fulfil', 'Fulfillment'],
  ['insights', 'Analytics'],
  ['partners', 'Partner Integrations'],
  ['sre', 'Platform SRE'],
  ['events', 'Messaging'],
].map(([id, name]) => ({ id: `team-${id}`, name: name! }));

/** [productId, name, teamKey, configItemIds] */
const productDefs: [string, string, string, string[]][] = [
  ['payments-api', 'Payments API', 'payments', ['ci-payments-app']],
  ['card-vault', 'Card Vault', 'payments', ['ci-card-vault']],
  ['checkout-web', 'Checkout Web', 'checkout', ['ci-checkout-app']],
  ['cart-service', 'Cart Service', 'checkout', ['ci-cart-app']],
  ['identity-service', 'Identity Service', 'identity', ['ci-identity']],
  ['ios-app', 'iOS App', 'mobile', ['ci-mobile-bff']],
  ['android-app', 'Android App', 'mobile', ['ci-mobile-bff']],
  ['search-indexer', 'Search Indexer', 'search', ['ci-search-cluster']],
  ['catalog-service', 'Catalog Service', 'catalog', ['ci-catalog-app']],
  ['pricing-engine', 'Pricing Engine', 'catalog', ['ci-pricing-app']],
  ['billing-api', 'Billing API', 'billing', ['ci-billing-app']],
  ['customer-portal', 'Customer Portal', 'portal', ['ci-portal-app']],
  ['data-pipelines', 'Data Lake Pipelines', 'data', ['ci-data-lake']],
  ['notification-hub', 'Notification Hub', 'notify', ['ci-notify-app']],
  ['fulfillment-router', 'Fulfillment Router', 'fulfil', ['ci-fulfil-app']],
  ['warehouse-sync', 'Warehouse Sync', 'fulfil', ['ci-warehouse-sync']],
  ['insights-dashboard', 'Insights Dashboard', 'insights', ['ci-insights-app']],
  ['partner-gateway', 'Partner Gateway', 'partners', ['ci-partner-gw']],
  ['observability', 'Observability Stack', 'sre', ['ci-observability']],
  ['edge-proxy', 'Edge Proxy', 'sre', ['ci-edge']],
  ['event-bus', 'Event Bus', 'events', ['ci-event-bus']],
  ['email-relay', 'Email Relay', 'events', ['ci-email-relay']],
];

export const products: Product[] = productDefs.map(([id, name, team]) => ({ id, name, teamId: `team-${team}` }));
const productCis = new Map(productDefs.map(([id, , , cis]) => [id, cis]));

export const environments: Environment[] = [
  { id: 'env-dev', name: 'Dev', kind: 'dev' },
  { id: 'env-staging', name: 'Staging/UAT', kind: 'staging-uat' },
  { id: 'env-prod', name: 'Production', kind: 'prod' },
];

const configItemDefs: [string, string, string | null][] = [
  ['ci-orders-db', 'Orders Database', null],
  ['ci-customer-db', 'Customer Database', null],
  ['ci-event-bus', 'Event Bus Cluster', null],
  ['ci-search-cluster', 'Search Cluster', null],
  ['ci-data-lake', 'Data Lake', 'ci-event-bus'],
  ['ci-identity', 'Identity Service', 'ci-customer-db'],
  ['ci-payments-app', 'Payments App', 'ci-orders-db'],
  ['ci-card-vault', 'Card Vault', 'ci-payments-app'],
  ['ci-checkout-app', 'Checkout App', 'ci-orders-db'],
  ['ci-cart-app', 'Cart App', 'ci-checkout-app'],
  ['ci-mobile-bff', 'Mobile Backend-for-Frontend', 'ci-checkout-app'],
  ['ci-catalog-app', 'Catalog App', 'ci-search-cluster'],
  ['ci-pricing-app', 'Pricing App', 'ci-catalog-app'],
  ['ci-billing-app', 'Billing App', 'ci-customer-db'],
  ['ci-portal-app', 'Portal App', 'ci-identity'],
  ['ci-notify-app', 'Notification App', 'ci-event-bus'],
  ['ci-email-relay', 'Email Relay', 'ci-notify-app'],
  ['ci-fulfil-app', 'Fulfillment App', 'ci-orders-db'],
  ['ci-warehouse-sync', 'Warehouse Sync', 'ci-fulfil-app'],
  ['ci-insights-app', 'Insights App', 'ci-data-lake'],
  ['ci-partner-gw', 'Partner Gateway', 'ci-identity'],
  ['ci-observability', 'Observability Stack', null],
  ['ci-edge', 'Edge Proxy', null],
];

export const configItems: ConfigItem[] = configItemDefs.map(([id, name, dependsOnId]) => ({ id, name, dependsOnId }));

const envName = new Map(environments.map((e) => [e.id, e.name]));
const productName = new Map(products.map((p) => [p.id, p.name]));

/** Monday 00:00 UTC of the week containing `date`. */
export function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * DAY);
}

export interface PlantedConflict {
  rule: RuleId;
  releaseIds: string[];
  relatedIds?: string[];
  description: string;
}

/** The eight conflicts the seed must produce, no more and no fewer. */
export const PLANTED: PlantedConflict[] = [
  {
    rule: 'time-overlap',
    releaseIds: ['rel-p1-checkout-dev', 'rel-p1-checkout-stg'],
    description: 'Checkout Web is deployed to Dev and Staging at overlapping times (same product).',
  },
  {
    rule: 'time-overlap',
    releaseIds: ['rel-p2-billing-stg', 'rel-p2-portal-dev'],
    description: 'Billing API and Customer Portal both run Customer Database migrations at once (shared configuration item).',
  },
  {
    rule: 'environment-double-booking',
    releaseIds: ['rel-p3-search-stg'],
    relatedIds: ['env-staging', 'bk-qa-w1'],
    description: 'Search Indexer needs Staging while QA has it booked for a regression cycle.',
  },
  {
    rule: 'guardrail',
    releaseIds: ['rel-p4-vault-prod'],
    relatedIds: ['win-blackout-qclose'],
    description: 'Card Vault key rotation lands in the quarter-end close blackout.',
  },
  {
    rule: 'guardrail',
    releaseIds: ['rel-p5-ios-stg'],
    relatedIds: ['win-freeze-mobile'],
    description: 'iOS App goes to Staging during the mobile code freeze.',
  },
  {
    rule: 'guardrail',
    releaseIds: ['rel-p6-payments-prod'],
    description: 'Normal change to Production scheduled outside the Saturday maintenance window.',
  },
  {
    rule: 'dependency-order',
    releaseIds: ['rel-p7-partner-dev', 'rel-p7-identity-stg'],
    description: 'Partner Gateway OAuth upgrade is scheduled before the Identity Service release it depends on.',
  },
  {
    rule: 'completeness',
    releaseIds: ['rel-p8-data-stg'],
    description: 'Normal change with no rollback plan.',
  },
];

interface Ctx {
  anchor: number;
  rng: Prng;
}

/** Instant at week `w`, weekday `d` (0 = Monday), hour `h` UTC. */
const at = (c: Ctx, w: number, d: number, h: number) => c.anchor + w * 7 * DAY + d * DAY + h * HOUR;

function windowsFor(c: Ctx): Window[] {
  const maintenance: Window[] = Array.from({ length: 8 }, (_, w) => ({
    id: `win-maint-w${w}`,
    kind: 'maintenance',
    name: 'Saturday production maintenance',
    scope: { environmentIds: ['env-prod'] },
    startAt: iso(at(c, w, 5, 14)),
    endAt: iso(at(c, w, 5, 22)),
  }));
  return [
    ...maintenance,
    {
      id: 'win-freeze-mobile',
      kind: 'freeze',
      name: 'Mobile app-store submission freeze',
      scope: { teamIds: ['team-mobile'] },
      startAt: iso(at(c, 3, 0, 0)),
      endAt: iso(at(c, 3, 5, 0)),
    },
    {
      id: 'win-blackout-qclose',
      kind: 'blackout',
      name: 'Quarter-end financial close',
      scope: { environmentIds: ['env-prod'] },
      startAt: iso(at(c, 5, 2, 0)),
      endAt: iso(at(c, 5, 4, 0)),
    },
    {
      id: 'win-blackout-launch',
      kind: 'blackout',
      name: 'Seasonal sale launch',
      scope: { environmentIds: ['env-prod'] },
      startAt: iso(at(c, 7, 3, 12)),
      endAt: iso(at(c, 7, 3, 20)),
    },
  ];
}

function bookingsFor(c: Ctx): EnvironmentBooking[] {
  return [
    { id: 'bk-qa-w1', environmentId: 'env-staging', title: 'Regression test cycle', owner: 'QA Guild', startAt: iso(at(c, 1, 3, 13)), endAt: iso(at(c, 1, 3, 21)) },
    { id: 'bk-perf-w2', environmentId: 'env-staging', title: 'Load test', owner: 'Platform SRE', startAt: iso(at(c, 2, 0, 13)), endAt: iso(at(c, 2, 0, 17)) },
    { id: 'bk-qa-w4', environmentId: 'env-staging', title: 'Regression test cycle', owner: 'QA Guild', startAt: iso(at(c, 4, 1, 13)), endAt: iso(at(c, 4, 1, 21)) },
    { id: 'bk-uat-w6', environmentId: 'env-staging', title: 'Business UAT sign-off', owner: 'Product', startAt: iso(at(c, 6, 3, 13)), endAt: iso(at(c, 6, 3, 21)) },
  ];
}

function release(
  c: Ctx,
  id: string,
  productId: string,
  environmentId: string,
  changeClass: ChangeClass,
  start: number,
  hours: number,
  version: string,
  extraCis: string[] = [],
): Release {
  return {
    id,
    productId,
    title: `${productName.get(productId)} ${version} → ${envName.get(environmentId)}`,
    environmentId,
    status: c.rng.chance(0.5) ? 'approved' : 'planned',
    changeClass,
    startAt: iso(start),
    endAt: iso(start + hours * HOUR),
    configItemIds: [...(productCis.get(productId) ?? []), ...extraCis],
  };
}

function plantedReleases(c: Ctx): { releases: Release[]; dependencies: Dependency[] } {
  const releases: Release[] = [
    release(c, 'rel-p1-checkout-dev', 'checkout-web', 'env-dev', 'standard', at(c, 1, 1, 14), 2, '5.2'),
    release(c, 'rel-p1-checkout-stg', 'checkout-web', 'env-staging', 'normal', at(c, 1, 1, 15), 2, '5.2'),
    release(c, 'rel-p2-billing-stg', 'billing-api', 'env-staging', 'standard', at(c, 2, 2, 14), 2, '3.1', ['ci-customer-db']),
    release(c, 'rel-p2-portal-dev', 'customer-portal', 'env-dev', 'standard', at(c, 2, 2, 15), 2, '8.0', ['ci-customer-db']),
    release(c, 'rel-p3-search-stg', 'search-indexer', 'env-staging', 'standard', at(c, 1, 3, 18), 2, '2.0'),
    release(c, 'rel-p4-vault-prod', 'card-vault', 'env-prod', 'standard', at(c, 5, 2, 15), 1, 'key rotation'),
    release(c, 'rel-p5-ios-stg', 'ios-app', 'env-staging', 'normal', at(c, 3, 1, 14), 2, '7.4'),
    release(c, 'rel-p6-payments-prod', 'payments-api', 'env-prod', 'normal', at(c, 2, 1, 15), 2, '4.0'),
    release(c, 'rel-p7-identity-stg', 'identity-service', 'env-staging', 'standard', at(c, 6, 2, 14), 2, '6.1'),
    release(c, 'rel-p7-partner-dev', 'partner-gateway', 'env-dev', 'standard', at(c, 6, 1, 14), 2, 'OAuth upgrade'),
    release(c, 'rel-p8-data-stg', 'data-pipelines', 'env-staging', 'normal', at(c, 7, 0, 14), 2, 'schema v9'),
  ];
  return { releases, dependencies: [{ releaseId: 'rel-p7-partner-dev', dependsOnReleaseId: 'rel-p7-identity-stg' }] };
}

/** Products in each organic dependency chain, upstream first; each depends on the previous. */
const CHAINS: string[][] = [
  ['identity-service', 'customer-portal', 'ios-app'],
  ['event-bus', 'notification-hub', 'android-app'],
  ['catalog-service', 'search-indexer'],
  ['payments-api', 'checkout-web', 'insights-dashboard'],
];

interface Spec {
  productId: string;
  environmentId: string;
  changeClass: ChangeClass;
  hours: number;
  dependsOn?: string;
}

function organicSpecs(c: Ctx, count: number): Spec[] {
  const specs: Spec[] = [];
  const pickClass = (env: string): ChangeClass => {
    const x = c.rng.next();
    if (env === 'env-prod') return x < 0.5 ? 'standard' : x < 0.88 ? 'normal' : 'emergency';
    return x < 0.7 ? 'standard' : 'normal';
  };
  const pickEnv = () => c.rng.pick(['env-dev', 'env-dev', 'env-staging', 'env-staging', 'env-prod', 'env-prod', 'env-prod']);

  // Chains run upstream to downstream on Staging, one environment so the order is visible.
  for (const chain of CHAINS) {
    chain.forEach((productId, i) => {
      specs.push({ productId, environmentId: 'env-staging', changeClass: pickClass('env-staging'), hours: 2, dependsOn: i ? `chain` : undefined });
    });
  }
  let i = 0;
  while (specs.length < count) {
    const env = pickEnv();
    specs.push({
      productId: products[i % products.length]!.id,
      environmentId: env,
      changeClass: pickClass(env),
      hours: c.rng.int(1, env === 'env-staging' ? 3 : 2),
    });
    i += 1;
  }
  return specs;
}

const CR_TEXT = {
  description: (r: Release) => `Deploy ${r.title}.`,
  impactRisk: ['Low: backwards-compatible change behind a feature flag.', 'Medium: schema change on a shared table.', 'Low: config-only change.'],
  implementationPlan: ['Pipeline deploy, canary 10% then 100%.', 'Blue/green switch after health checks.', 'Rolling deploy, one node at a time.'],
  rollbackPlan: ['Redeploy the previous tag from the pipeline.', 'Switch traffic back to the blue stack.', 'Disable the feature flag, then redeploy.'],
  testPlan: ['Automated smoke suite plus synthetic checkout.', 'Contract tests and a manual UAT pass.', 'Run regression pack; monitor error rate 30 min.'],
};

function changeRequestFor(c: Ctx, r: Release): ChangeRequest {
  return {
    releaseId: r.id,
    description: CR_TEXT.description(r),
    impactRisk: c.rng.pick(CR_TEXT.impactRisk),
    implementationPlan: c.rng.pick(CR_TEXT.implementationPlan),
    rollbackPlan: c.rng.pick(CR_TEXT.rollbackPlan),
    testPlan: c.rng.pick(CR_TEXT.testPlan),
  };
}

export interface SeedOptions {
  anchor?: Date;
  releaseCount?: number;
}

export function generateSeed(opts: SeedOptions = {}): Dataset {
  const anchor = mondayOf(opts.anchor ?? new Date()).getTime();
  const c: Ctx = { anchor, rng: mulberry32(SEED) };
  const total = opts.releaseCount ?? 60;

  const planted = plantedReleases(c);
  const ds: Dataset = {
    teams,
    products,
    environments,
    configItems,
    windows: windowsFor(c),
    bookings: bookingsFor(c),
    releases: [...planted.releases],
    dependencies: [...planted.dependencies],
    changeRequests: [],
  };
  for (const r of planted.releases) {
    const cr = changeRequestFor(c, r);
    ds.changeRequests.push(r.id === 'rel-p8-data-stg' ? { ...cr, rollbackPlan: '' } : cr);
  }

  const versions = new Map<string, number>();
  let previousInChain: Release | undefined;
  for (const [n, spec] of organicSpecs(c, total - planted.releases.length).entries()) {
    const v = (versions.get(spec.productId) ?? 0) + 1;
    versions.set(spec.productId, v);
    const id = `rel-${String(n + 1).padStart(2, '0')}-${spec.productId}`;
    if (spec.dependsOn && previousInChain) {
      ds.dependencies.push({ releaseId: id, dependsOnReleaseId: previousInChain.id });
    }
    const placed = place(c, ds, id, spec, `${1 + (v % 4)}.${v * 3}`);
    ds.releases.push(placed);
    ds.changeRequests.push(changeRequestFor(c, placed));
    previousInChain = placed;
  }
  return ds;
}

/** Find a slot for `spec` that creates no conflict, trying PRNG-chosen times. */
function place(c: Ctx, ds: Dataset, id: string, spec: Spec, version: string): Release {
  const prodNormal = spec.environmentId === 'env-prod' && spec.changeClass === 'normal';
  for (let attempt = 0; attempt < 2000; attempt++) {
    const week = c.rng.int(0, 7);
    const start = prodNormal
      ? at(c, week, 5, 14 + c.rng.int(0, (8 - spec.hours) * 2) / 2)
      : at(c, week, c.rng.int(0, 4), 13 + c.rng.int(0, (8 - spec.hours) * 2) / 2);
    const candidate = release(c, id, spec.productId, spec.environmentId, spec.changeClass, start, spec.hours, version);
    if (slotIsClear({ ...ds, releases: [...ds.releases, candidate] }, candidate, { timeZone: 'UTC' })) return candidate;
  }
  throw new Error(`Seed generator could not place ${id}`);
}
