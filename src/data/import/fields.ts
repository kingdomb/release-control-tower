export type FieldKey =
  | 'id'
  | 'title'
  | 'team'
  | 'product'
  | 'environment'
  | 'start'
  | 'end'
  | 'allDay'
  | 'changeClass'
  | 'status'
  | 'dependsOn'
  | 'configItems'
  | 'description'
  | 'impactRisk'
  | 'implementationPlan'
  | 'rollbackPlan'
  | 'testPlan';

export interface FieldDef {
  key: FieldKey;
  label: string;
  required: boolean;
  help: string;
  /** Header spellings recognised automatically (compared lower-case, without spaces/punctuation). */
  aliases: string[];
}

export const FIELDS: FieldDef[] = [
  { key: 'title', label: 'Title', required: true, help: 'Release name, e.g. "Checkout Web 5.3".', aliases: ['title', 'name', 'release', 'releasename', 'summary'] },
  { key: 'team', label: 'Team', required: true, help: 'Owning team. New names are created.', aliases: ['team', 'teamname', 'squad', 'owner'] },
  { key: 'product', label: 'Product', required: true, help: 'Product or service. New names are created.', aliases: ['product', 'productname', 'service', 'application', 'app'] },
  {
    key: 'environment',
    label: 'Environment',
    required: true,
    help: 'dev, staging/UAT, or prod (also: development, uat, qa, production).',
    aliases: ['environment', 'env', 'target', 'targetenvironment'],
  },
  {
    key: 'start',
    label: 'Start',
    required: true,
    help: 'ISO date-time ("2026-03-10T14:00Z"), local "2026-03-10 09:00", or a date for all-day.',
    aliases: ['start', 'startat', 'starttime', 'startdate', 'from', 'begin'],
  },
  {
    key: 'end',
    label: 'End',
    required: true,
    help: 'Same formats as start. For all-day rows, the last day (inclusive).',
    aliases: ['end', 'endat', 'endtime', 'enddate', 'to', 'finish'],
  },
  { key: 'allDay', label: 'All day', required: false, help: 'true/false. Date-only start and end imply all-day.', aliases: ['allday', 'fullday'] },
  {
    key: 'changeClass',
    label: 'Change class',
    required: false,
    help: 'standard, normal, or emergency. Blank means normal.',
    aliases: ['changeclass', 'class', 'changetype', 'type', 'itilclass'],
  },
  {
    key: 'status',
    label: 'Status',
    required: false,
    help: 'planned, approved, in-progress, completed, or cancelled. Blank means planned.',
    aliases: ['status', 'state'],
  },
  { key: 'id', label: 'ID', required: false, help: 'Your own stable ID. Used by "depends on".', aliases: ['id', 'releaseid', 'key', 'ref'] },
  {
    key: 'dependsOn',
    label: 'Depends on',
    required: false,
    help: 'IDs or titles of releases that must finish first, separated by ";".',
    aliases: ['dependson', 'depends', 'dependencies', 'predecessors', 'after'],
  },
  {
    key: 'configItems',
    label: 'Configuration items',
    required: false,
    help: 'Systems this release touches, separated by ";" (e.g. "Orders DB; Checkout App").',
    aliases: ['configitems', 'configurationitems', 'cis', 'ci', 'assets', 'components'],
  },
  { key: 'description', label: 'Description', required: false, help: 'RFC: what changes and why.', aliases: ['description', 'details'] },
  { key: 'impactRisk', label: 'Impact and risk', required: false, help: 'RFC: who is affected, what could go wrong.', aliases: ['impactrisk', 'impact', 'risk', 'impactandrisk'] },
  {
    key: 'implementationPlan',
    label: 'Implementation plan',
    required: false,
    help: 'RFC: steps to deploy.',
    aliases: ['implementationplan', 'implementation', 'plan', 'deployplan'],
  },
  { key: 'rollbackPlan', label: 'Rollback plan', required: false, help: 'RFC: how to back out.', aliases: ['rollbackplan', 'rollback', 'backoutplan', 'backout'] },
  { key: 'testPlan', label: 'Test plan', required: false, help: 'RFC: how you will know it worked.', aliases: ['testplan', 'test', 'tests', 'verification', 'validation'] },
];

export type Mapping = Record<FieldKey, string | null>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Match file headers to fields by name. Each header is used at most once. */
export function autoMap(headers: string[]): Mapping {
  const used = new Set<string>();
  const mapping = Object.fromEntries(FIELDS.map((f) => [f.key, null])) as Mapping;
  for (const f of FIELDS) {
    const hit = headers.find((h) => !used.has(h) && f.aliases.includes(norm(h)));
    if (hit) {
      mapping[f.key] = hit;
      used.add(hit);
    }
  }
  return mapping;
}

export const missingRequired = (m: Mapping) => FIELDS.filter((f) => f.required && !m[f.key]).map((f) => f.label);

const TEMPLATE_ROWS = [
  ['REL-101', 'Orders API 2.4', 'Order Management', 'Orders API', 'staging', '2026-03-10 09:00', '2026-03-10 11:00', 'false', 'normal', 'approved', '', 'Orders DB', 'Add refund endpoint', 'Low: additive API change', 'Pipeline deploy with canary', 'Redeploy previous tag', 'Contract tests and smoke suite'],
  ['REL-102', 'Orders API 2.4', 'Order Management', 'Orders API', 'prod', '2026-03-14T14:00:00Z', '2026-03-14T16:00:00Z', 'false', 'normal', 'planned', 'REL-101', 'Orders DB', 'Add refund endpoint', 'Medium: customer-facing', 'Blue/green switch', 'Switch back to blue', 'Synthetic refund check'],
  ['REL-103', 'Storefront theme refresh', 'Web', 'Storefront', 'prod', '2026-03-16', '2026-03-16', 'true', 'standard', 'planned', '', '', 'Pre-approved CSS update', 'Low', 'CDN publish', 'Republish previous bundle', 'Visual regression run'],
];

const TEMPLATE_HEADERS = [
  'id',
  'title',
  'team',
  'product',
  'environment',
  'start',
  'end',
  'all_day',
  'change_class',
  'status',
  'depends_on',
  'config_items',
  'description',
  'impact_risk',
  'implementation_plan',
  'rollback_plan',
  'test_plan',
];

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const CSV_TEMPLATE = [TEMPLATE_HEADERS, ...TEMPLATE_ROWS].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
