/**
 * Domain model for the Release Control Tower.
 *
 * Time values are strings:
 * - timed items: ISO 8601 instants with an offset, stored in UTC ("2026-03-10T14:00:00.000Z")
 * - all-day items (`allDay: true`): calendar dates "YYYY-MM-DD", end date exclusive,
 *   interpreted in the evaluation time zone.
 * Every range is half-open: [startAt, endAt). Ranges that only touch do not overlap.
 */

export type Id = string;

export interface Timed {
  startAt: string;
  endAt: string;
  allDay?: boolean;
}

export interface Team {
  id: Id;
  name: string;
}

export interface Product {
  id: Id;
  name: string;
  teamId: Id;
}

export type EnvironmentKind = 'dev' | 'staging-uat' | 'prod';

export interface Environment {
  id: Id;
  name: string;
  kind: EnvironmentKind;
}

export type ReleaseStatus = 'planned' | 'approved' | 'in-progress' | 'completed' | 'cancelled';

export type ChangeClass = 'standard' | 'normal' | 'emergency';

export interface Release extends Timed {
  id: Id;
  productId: Id;
  title: string;
  environmentId: Id;
  status: ReleaseStatus;
  changeClass: ChangeClass;
  /** Configuration items this release touches (asset mapping). */
  configItemIds?: Id[];
}

/** `releaseId` cannot start until `dependsOnReleaseId` has finished. */
export interface Dependency {
  releaseId: Id;
  dependsOnReleaseId: Id;
}

/** Asset mapping: e.g. "Checkout App" dependsOn "Orders Database". */
export interface ConfigItem {
  id: Id;
  name: string;
  dependsOnId: Id | null;
}

export type WindowKind = 'blackout' | 'maintenance' | 'freeze';

/** Empty or missing lists mean "applies to all". */
export interface WindowScope {
  environmentIds?: Id[];
  teamIds?: Id[];
}

export interface Window extends Timed {
  id: Id;
  kind: WindowKind;
  name: string;
  scope: WindowScope;
}

/** Non-release reservation of an environment, e.g. a QA test cycle on staging. */
export interface EnvironmentBooking extends Timed {
  id: Id;
  environmentId: Id;
  title: string;
  owner: string;
}

/** The five fields of a simple RFC. */
export interface ChangeRequest {
  releaseId: Id;
  description: string;
  impactRisk: string;
  implementationPlan: string;
  rollbackPlan: string;
  testPlan: string;
}

export type RuleId =
  | 'time-overlap'
  | 'environment-double-booking'
  | 'guardrail'
  | 'dependency-order'
  | 'completeness';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type Suggestion =
  | { kind: 'reschedule'; releaseId: Id; startAt: string; endAt: string; label: string }
  | { kind: 'action'; releaseId: Id; label: string };

export interface Conflict {
  /** Stable id: the same problem keeps the same id across evaluations. */
  id: string;
  rule: RuleId;
  releaseIds: Id[];
  /** Non-release items involved (window, booking ids). */
  relatedIds: Id[];
  severity: Severity;
  message: string;
  suggestions: Suggestion[];
}

export interface Dataset {
  teams: Team[];
  products: Product[];
  environments: Environment[];
  releases: Release[];
  dependencies: Dependency[];
  configItems: ConfigItem[];
  windows: Window[];
  bookings: EnvironmentBooking[];
  changeRequests: ChangeRequest[];
}

export const emptyDataset = (): Dataset => ({
  teams: [],
  products: [],
  environments: [],
  releases: [],
  dependencies: [],
  configItems: [],
  windows: [],
  bookings: [],
  changeRequests: [],
});
