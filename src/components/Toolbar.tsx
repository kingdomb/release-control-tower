import type { Dataset } from '../domain/types';
import type { Scope } from '../views/model';

export type ViewMode = 'month' | 'week' | 'timeline' | 'environments';

const VIEWS: { id: ViewMode; label: string; short: string }[] = [
  { id: 'month', label: 'Month', short: 'Month' },
  { id: 'week', label: 'Week', short: 'Week' },
  { id: 'timeline', label: 'Timeline by team', short: 'Timeline' },
  { id: 'environments', label: 'Environments', short: 'Envs' },
];

export function ViewSwitcher({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div role="group" aria-label="Calendar view" className="flex min-w-0 flex-wrap gap-1">
      {VIEWS.map((v) => (
        <button key={v.id} type="button" className="btn px-2 sm:px-3" aria-pressed={value === v.id} onClick={() => onChange(v.id)}>
          <span className="sm:hidden">{v.short}</span>
          <span className="hidden sm:inline">{v.label}</span>
        </button>
      ))}
    </div>
  );
}

interface ScopeProps {
  ds: Dataset;
  scope: Scope;
  onChange: (s: Scope) => void;
  /** Team used when switching to the regular calendar with nothing chosen yet. */
  lastTeamId: string | null;
}

/** Integrated vs regular calendar: the same data, filtered to one team (and optionally a product). */
export function ScopeControls({ ds, scope, onChange, lastTeamId }: ScopeProps) {
  const regular = !!scope.teamId;
  const teamProducts = ds.products.filter((p) => p.teamId === scope.teamId);
  return (
    <div className="flex min-w-0 flex-wrap items-end gap-2">
      <button
        type="button"
        className="btn"
        aria-pressed={regular}
        disabled={!ds.teams.length}
        onClick={() => onChange(regular ? { teamId: null, productId: null } : { teamId: lastTeamId ?? ds.teams[0]?.id ?? null, productId: null })}
      >
        Regular calendar
      </button>
      <div className="min-w-[10rem] flex-1 sm:flex-none">
        <label htmlFor="scope-team" className="label">
          Team
        </label>
        <select
          id="scope-team"
          className="field"
          value={scope.teamId ?? ''}
          onChange={(e) => onChange({ teamId: e.target.value || null, productId: null })}
        >
          <option value="">All teams (integrated)</option>
          {ds.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      {regular && teamProducts.length > 1 && (
        <div className="min-w-[10rem] flex-1 sm:flex-none">
          <label htmlFor="scope-product" className="label">
            Product
          </label>
          <select
            id="scope-product"
            className="field"
            value={scope.productId ?? ''}
            onChange={(e) => onChange({ ...scope, productId: e.target.value || null })}
          >
            <option value="">All products</option>
            {teamProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
