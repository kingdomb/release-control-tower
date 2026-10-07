# Phase 2: Supabase back end and live webhooks

Status: **design only, not built.** Phase 1 runs entirely in the browser. Phase 2 makes the calendar a shared, live system of record without changing the rule engine or the UI.

## Goals

1. One shared portfolio for every team, with row-level security.
2. Releases created and updated automatically from delivery tooling (GitHub, Azure DevOps).
3. Conflicts evaluated on the server whenever anything changes, using the same `src/engine` code.
4. Notifications routed by severity to the owning team and the change manager.

## The swap point

All persistence goes through `DataSource` ([src/data/DataSource.ts](../src/data/DataSource.ts)):

```ts
interface DataSource {
  readonly name: string;
  load(): Promise<StoredState | null>;
  save(state: StoredState): Promise<void>;
  clear(): Promise<void>;
  subscribe?(onChange: (state: StoredState) => void): () => void;
}
```

`SupabaseDataSource` implements it: `load` reads the tables below into a `Dataset`, `save` upserts the diff, and `subscribe` listens on Supabase Realtime so a webhook-driven change appears on every open calendar. `main.tsx` picks the implementation from an environment variable. Nothing else in the app changes.

## Schema (Postgres)

```sql
create table teams        (id text primary key, name text not null);
create table products     (id text primary key, name text not null, team_id text not null references teams);
create type env_kind as enum ('dev', 'staging-uat', 'prod');
create table environments (id text primary key, name text not null, kind env_kind not null);

create table config_items (
  id text primary key, name text not null,
  depends_on_id text references config_items          -- App A depends on Database B
);

create type change_class   as enum ('standard', 'normal', 'emergency');
create type release_status as enum ('planned', 'approved', 'in-progress', 'completed', 'cancelled');
create table releases (
  id text primary key,
  product_id text not null references products,
  environment_id text not null references environments,
  title text not null,
  start_at timestamptz not null, end_at timestamptz not null,
  all_day boolean not null default false,
  status release_status not null default 'planned',
  change_class change_class not null default 'normal',
  source text not null default 'manual',              -- manual | github | azure-devops | import
  external_ref text,                                   -- e.g. "github:org/repo#deployment/123"
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  unique (source, external_ref)
);
create table release_config_items (release_id text references releases on delete cascade, config_item_id text references config_items, primary key (release_id, config_item_id));
create table dependencies (release_id text references releases on delete cascade, depends_on_release_id text references releases on delete cascade, primary key (release_id, depends_on_release_id));

create table change_requests (
  release_id text primary key references releases on delete cascade,
  description text, impact_risk text, implementation_plan text, rollback_plan text, test_plan text
);

create type window_kind as enum ('blackout', 'maintenance', 'freeze');
create table windows (
  id text primary key, kind window_kind not null, name text not null,
  start_at timestamptz not null, end_at timestamptz not null, all_day boolean not null default false,
  scope_environment_ids text[] not null default '{}', scope_team_ids text[] not null default '{}'
);
create table bookings (id text primary key, environment_id text not null references environments, title text not null, owner text not null,
  start_at timestamptz not null, end_at timestamptz not null, all_day boolean not null default false);

-- Output of the rule engine, replaced on every evaluation.
create table conflicts (
  id text primary key,                                 -- stable engine id, e.g. "guardrail:rel-42|win-7"
  rule text not null, severity text not null, message text not null,
  release_ids text[] not null, related_ids text[] not null, suggestions jsonb not null,
  first_seen_at timestamptz not null default now(), resolved_at timestamptz
);
create table webhook_events (id bigserial primary key, source text not null, delivery_id text not null unique,
  received_at timestamptz not null default now(), payload jsonb not null, outcome text);
```

Row-level security: members of a team can write their team's releases and change requests; the change-manager role can write windows and all releases; everyone in the organisation can read. Imports and webhooks run with a service role.

## Webhook flow

```mermaid
sequenceDiagram
  participant GH as GitHub / Azure DevOps
  participant EF as Edge Function: ingest-webhook
  participant DB as Postgres
  participant EV as Edge Function: evaluate
  participant RT as Realtime
  participant N as Notifier
  participant B as Browser
  participant T as Team channel
  GH->>EF: POST event (signed)
  EF->>EF: verify signature, de-duplicate by delivery id
  EF->>DB: insert webhook_events; upsert release by (source, external_ref)
  DB-->>EV: trigger after change (pg_net / database webhook)
  EV->>DB: load dataset, run src/engine evaluate()
  EV->>DB: upsert conflicts; set resolved_at on ones that disappeared
  DB-->>RT: row changes
  RT-->>B: SupabaseDataSource.subscribe → calendar updates
  EV->>N: new or escalated conflicts
  N->>T: Slack / Teams / email by severity
```

### Receivers

| Source | Events | Mapping |
| --- | --- | --- |
| GitHub | `deployment` (created), `deployment_status` (in_progress, success, failure), `release` (published), `pull_request` (closed + merged, with a `release:` label) | `environment` → `environments.kind` by name; repository → product through a `repo_products` table; timestamps → `start_at`/`end_at`; status → `release_status` |
| Azure DevOps | Service hooks: `ms.vss-release.deployment-started-event`, `deployment-completed-event`, `release-created-event`; YAML pipeline `ms.azure-pipelines.stage-state-changed` | Stage name → environment; release definition → product; approvals → `approved` |

Security: GitHub requests are verified with HMAC-SHA256 over the raw body (`X-Hub-Signature-256`) using a per-source secret. Azure DevOps service hooks use basic auth with a secret in the subscription, plus an allowlist of organisation IDs. Every delivery is stored in `webhook_events` with a unique `delivery_id`, so retries are idempotent. Unknown repositories or stages are recorded with `outcome = 'unmapped'` and shown to admins, never guessed.

### Evaluation

The engine has no browser dependencies and runs unchanged in Deno. The `evaluate` function loads the dataset, calls `evaluate(ds, { timeZone: org.timeZone })`, and diffs against stored conflicts by stable ID. New conflicts get `first_seen_at`; vanished ones get `resolved_at`. A debounce of a few seconds coalesces bursts of webhook events.

### Notifications

| Severity | Route |
| --- | --- |
| Critical | Owning team channel and the change manager, immediately |
| High | Owning team channel, immediately |
| Medium | Daily digest to the owning team |
| Low | CAB agenda only |

A notification is sent when a conflict first appears or its severity rises, never on every evaluation. It carries the engine's suggestions and a deep link to the release.

## Migration from Phase 1

Phase 2 accepts the same full-dataset JSON format that Phase 1 imports (see the JSON template), so a team's schedule can be loaded once. Phase 1 has no data export today; adding one is a small follow-up if teams need to carry browser data across. The `version` field in stored state guards against loading an incompatible shape.

## Out of scope for Phase 2

Approval workflow inside the tool (approvals stay in the CAB and the delivery tool), editing pipelines from the calendar, and multi-organisation tenancy.
