import { useMemo, useState } from 'react';
import { toInterval } from '../domain/time';
import type { Conflict, Dataset, Id, Severity, Suggestion } from '../domain/types';
import { severityRank } from '../engine/evaluate';
import { RULE_LABEL } from '../views/model';

type SortKey = 'severity' | 'rule' | 'date';

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'bg-alert text-white',
  high: 'bg-alert-tint text-alert border border-alert/40',
  medium: 'bg-amber-tint text-[#7a4e06] border border-amber/40',
  low: 'bg-console text-ink-soft border border-rule',
};

interface Props {
  ds: Dataset;
  conflicts: Conflict[];
  timeZone: string;
  onFocus: (releaseIds: Id[]) => void;
  onOpenRelease: (releaseId: Id) => void;
  onApply: (s: Extract<Suggestion, { kind: 'reschedule' }>) => void;
  /** Heading id so a surrounding dialog can reference it. */
  headingId?: string;
}

export function ConflictPanel({ ds, conflicts, timeZone, onFocus, onOpenRelease, onApply, headingId }: Props) {
  const [sort, setSort] = useState<SortKey>('severity');
  const title = (id: Id) => ds.releases.find((r) => r.id === id)?.title ?? id;
  const startOf = (c: Conflict) => {
    const times = c.releaseIds
      .map((id) => ds.releases.find((r) => r.id === id))
      .filter((r) => !!r)
      .map((r) => toInterval(r, timeZone).start);
    return times.length ? Math.min(...times) : Infinity;
  };

  const sorted = useMemo(() => {
    const list = [...conflicts];
    if (sort === 'severity') list.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || startOf(a) - startOf(b));
    if (sort === 'rule') list.sort((a, b) => RULE_LABEL[a.rule].localeCompare(RULE_LABEL[b.rule]) || severityRank[a.severity] - severityRank[b.severity]);
    if (sort === 'date') list.sort((a, b) => startOf(a) - startOf(b));
    return list;
  }, [conflicts, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section aria-labelledby={headingId ?? 'conflict-heading'} className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-rule p-3">
        <h2 id={headingId ?? 'conflict-heading'} className="font-cond text-xl font-semibold">
          Conflicts <span className="text-ink-soft">({conflicts.length})</span>
        </h2>
        <div>
          <label htmlFor="conflict-sort" className="label">
            Sort by
          </label>
          <select id="conflict-sort" className="field w-auto" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="severity">Severity</option>
            <option value="rule">Rule</option>
            <option value="date">Date</option>
          </select>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="p-4 text-sm text-ink-soft">No conflicts in this view. Every release clears all five rules.</p>
      ) : (
        <ol className="min-h-0 flex-1 divide-y divide-rule overflow-y-auto">
          {sorted.map((c) => (
            <li key={c.id} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLE[c.severity]}`}>
                  {c.severity[0]!.toUpperCase() + c.severity.slice(1)}
                </span>
                <span className="text-sm font-semibold">{RULE_LABEL[c.rule]}</span>
              </div>
              <p className="mt-1 text-sm leading-snug">{c.message}</p>

              {c.releaseIds.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1" aria-label="Releases involved">
                  {c.releaseIds.map((id) => (
                    <li key={id} className="min-w-0 max-w-full">
                      <button type="button" className="btn max-w-full justify-start px-2 text-xs" onClick={() => onOpenRelease(id)}>
                        <span className="truncate">{title(id)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {c.suggestions.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-ink-soft">Suggested</p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {c.suggestions.map((s, i) => (
                      <li key={i}>
                        {s.kind === 'reschedule' ? (
                          <button type="button" className="btn w-full justify-start text-left text-xs" onClick={() => onApply(s)}>
                            {s.label}
                            {c.releaseIds.length > 1 && <span className="sr-only"> for {title(s.releaseId)}</span>}
                          </button>
                        ) : (
                          <p className="text-xs text-ink-soft">{s.label}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {c.releaseIds.length > 0 && (
                <button type="button" className="btn mt-2 text-xs" onClick={() => onFocus(c.releaseIds)}>
                  Show on calendar
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
