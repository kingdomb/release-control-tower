import type { ChangeRequest, Dataset, Release } from '../../domain/types';
import { emptyDataset } from '../../domain/types';
import type { EvalOptions } from '../context';

export const UTC: EvalOptions = { timeZone: 'UTC' };
export const NY: EvalOptions = { timeZone: 'America/New_York' };

/** Small org: two teams, three products, the three environment kinds. */
export function baseDataset(over: Partial<Dataset> = {}): Dataset {
  return {
    ...emptyDataset(),
    teams: [
      { id: 't1', name: 'Payments' },
      { id: 't2', name: 'Mobile' },
    ],
    products: [
      { id: 'p1', name: 'Payments API', teamId: 't1' },
      { id: 'p2', name: 'Ledger', teamId: 't1' },
      { id: 'p3', name: 'Mobile App', teamId: 't2' },
    ],
    environments: [
      { id: 'dev', name: 'Dev', kind: 'dev' },
      { id: 'stg', name: 'Staging/UAT', kind: 'staging-uat' },
      { id: 'prod', name: 'Production', kind: 'prod' },
    ],
    configItems: [
      { id: 'db', name: 'Orders DB', dependsOnId: null },
      { id: 'app', name: 'Checkout App', dependsOnId: 'db' },
      { id: 'edge', name: 'Edge Gateway', dependsOnId: 'app' },
    ],
    ...over,
  };
}

let n = 0;
export function rel(over: Partial<Release> & Pick<Release, 'startAt' | 'endAt'>): Release {
  n += 1;
  return {
    id: over.id ?? `r${n}`,
    productId: 'p1',
    title: over.title ?? `Release ${over.id ?? n}`,
    environmentId: 'dev',
    status: 'planned',
    changeClass: 'standard',
    ...over,
  };
}

export const fullCr = (releaseId: string, over: Partial<ChangeRequest> = {}): ChangeRequest => ({
  releaseId,
  description: 'Upgrade',
  impactRisk: 'Low',
  implementationPlan: 'Deploy via pipeline',
  rollbackPlan: 'Redeploy previous tag',
  testPlan: 'Smoke tests',
  ...over,
});

/** "2026-03-10T14:00" → ISO UTC instant. */
export const at = (local: string) => new Date(`${local}:00.000Z`).toISOString();
