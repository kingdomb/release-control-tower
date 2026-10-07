import { useCallback, useMemo, useState } from 'react';
import { DemoBanner } from './components/DemoBanner';
import { Header, type HeaderAction } from './components/Header';
import { ScopeControls, ViewSwitcher, type ViewMode } from './components/Toolbar';
import { DAY, toInterval } from './domain/time';
import type { Conflict, Dataset, Id } from './domain/types';
import { useStore } from './state/store';
import { CalendarView, type MoveRequest } from './views/CalendarView';
import { environmentLanes, teamLanes } from './views/lanes';
import { conflictsByRelease, integrated, visibleConflicts, visibleReleases, visibleWindows, type Scope } from './views/model';
import { startOfLocalDay, Swimlane } from './views/Swimlane';

const EMPTY: Conflict[] = [];

export default function App() {
  const store = useStore();
  const { dataset: committed, draft, timeZone: tz } = store;
  const [view, setView] = useState<ViewMode>('month');
  const [scope, setScope] = useState<Scope>(integrated);
  const [lastTeamId, setLastTeamId] = useState<string | null>(null);
  const [focusIds, setFocusIds] = useState<Id[]>([]);
  const [focusDate, setFocusDate] = useState<number | null>(null);
  const [timelineStart, setTimelineStart] = useState(() => startOfLocalDay(Date.now(), tz) - ((new Date().getDay() + 6) % 7) * DAY);

  // While a what-if draft exists, every view shows the draft and its conflicts.
  const ds: Dataset = draft?.dataset ?? committed;
  const conflicts = store.draftConflicts ?? store.conflicts;
  const draftIds = useMemo(() => (draft ? [draft.releaseId] : []), [draft]);

  const releases = useMemo(() => visibleReleases(ds, scope), [ds, scope]);
  const windows = useMemo(() => visibleWindows(ds, scope), [ds, scope]);
  const shownConflicts = useMemo(() => visibleConflicts(conflicts, releases), [conflicts, releases]);
  const byRelease = useMemo(() => conflictsByRelease(conflicts), [conflicts]);
  const conflictsFor = useCallback((id: Id) => byRelease.get(id) ?? EMPTY, [byRelease]);

  const changeScope = (s: Scope) => {
    if (s.teamId) setLastTeamId(s.teamId);
    setScope(s);
  };

  const onMove = useCallback(
    (m: MoveRequest) => {
      const base = store.draft?.dataset ?? store.dataset;
      const r = base.releases.find((x) => x.id === m.releaseId);
      if (!r) return;
      store.setDraft({
        releaseId: r.id,
        label: `Move "${r.title}"`,
        dataset: { ...base, releases: base.releases.map((x) => (x.id === r.id ? { ...x, startAt: m.startAt, endAt: m.endAt } : x)) },
      });
    },
    [store],
  );

  const onSelect = useCallback((id: Id) => setFocusIds([id]), []);

  const focusOn = (ids: Id[]) => {
    setFocusIds(ids);
    const first = ds.releases.find((r) => ids.includes(r.id));
    if (first) {
      const t = toInterval(first, tz).start;
      setFocusDate(t);
      setTimelineStart(startOfLocalDay(t, tz) - 2 * DAY);
    }
  };
  void focusOn;

  const actions: HeaderAction[] = [
    { id: 'undo', label: 'Undo', onClick: store.undo, disabled: !store.canUndo },
    { id: 'demo', label: 'Load demo data', onClick: store.loadDemo },
    { id: 'clear', label: 'Clear all data', onClick: store.clearAll, tone: 'danger', disabled: !committed.releases.length },
  ];

  if (!store.loaded) {
    return <p className="p-6 text-sm text-ink-soft">Loading schedule…</p>;
  }

  const lanes =
    view === 'timeline'
      ? teamLanes(ds, releases, windows, scope, tz)
      : view === 'environments'
        ? environmentLanes(ds, releases, windows, tz)
        : null;

  return (
    <div className="flex min-h-dvh flex-col">
      {store.isDemo && <DemoBanner onClear={store.clearAll} />}
      <Header actions={actions} timeZone={tz} />

      <div className="no-print border-b border-rule bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-end gap-3 px-4 py-3">
          <ViewSwitcher value={view} onChange={setView} />
          <ScopeControls ds={committed} scope={scope} onChange={changeScope} lastTeamId={lastTeamId} />
          <p className="ml-auto flex min-h-[44px] items-center gap-2 text-sm" aria-live="polite">
            <span
              className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full px-2 font-semibold ${
                shownConflicts.length ? 'bg-alert text-white' : 'bg-go-tint text-go'
              }`}
            >
              {shownConflicts.length}
            </span>
            <span>{shownConflicts.length === 1 ? 'conflict' : 'conflicts'} in view</span>
          </p>
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 px-4 py-4">
        <div className="min-w-0">
          {committed.releases.length === 0 && !draft ? (
            <EmptyState onLoadDemo={store.loadDemo} />
          ) : lanes ? (
            <Swimlane
              title={view === 'timeline' ? 'Timeline by team' : 'Environment bookings'}
              {...lanes}
              start={timelineStart}
              days={14}
              timeZone={tz}
              conflictsFor={conflictsFor}
              focusIds={focusIds}
              draftIds={draftIds}
              onRangeChange={(t) => setTimelineStart(startOfLocalDay(t, tz))}
              onSelect={onSelect}
              onMove={onMove}
            />
          ) : (
            <CalendarView
              mode={view === 'week' ? 'week' : 'month'}
              releases={releases}
              windows={windows}
              conflictsFor={conflictsFor}
              focusIds={focusIds}
              draftIds={draftIds}
              timeZone={tz}
              focusDate={focusDate}
              onSelect={onSelect}
              onMove={onMove}
            />
          )}
          <Legend />
        </div>
      </main>
    </div>
  );
}

function Legend() {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-soft" aria-label="Legend">
      <li className="flex items-center gap-2">
        <span className="strip h-4 w-8" data-class="standard">
          <span className="strip-bar" />
        </span>
        Standard
      </li>
      <li className="flex items-center gap-2">
        <span className="strip h-4 w-8" data-class="normal">
          <span className="strip-bar" />
        </span>
        Normal
      </li>
      <li className="flex items-center gap-2">
        <span className="strip h-4 w-8" data-class="emergency">
          <span className="strip-bar" />
        </span>
        Emergency
      </li>
      <li className="flex items-center gap-2">
        <span className="strip h-4 w-8" data-class="standard" data-conflict="true">
          <span className="strip-bar" />
        </span>
        Has a conflict
      </li>
      <li className="flex items-center gap-2">
        <span className="band-blackout h-4 w-8 rounded-sm border border-rule" />
        Blackout
      </li>
      <li className="flex items-center gap-2">
        <span className="band-freeze h-4 w-8 rounded-sm border border-rule" />
        Freeze
      </li>
      <li className="flex items-center gap-2">
        <span className="band-maintenance h-4 w-8 rounded-sm border border-rule" />
        Maintenance window
      </li>
    </ul>
  );
}

function EmptyState({ onLoadDemo }: { onLoadDemo: () => void }) {
  return (
    <section className="rounded border border-dashed border-rule bg-white p-8">
      <h2 className="font-cond text-2xl font-semibold">No releases scheduled</h2>
      <p className="mt-2 max-w-prose text-sm text-ink-soft">
        Import your team's schedule from a CSV or JSON file, or load the synthetic demo to see conflict detection at work.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={onLoadDemo}>
          Load demo data
        </button>
      </div>
    </section>
  );
}
