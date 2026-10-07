import { useCallback, useMemo, useRef, useState } from 'react';
import { CabAgendaView } from './components/CabAgendaView';
import { ConflictPanel } from './components/ConflictPanel';
import { DemoBanner } from './components/DemoBanner';
import { ExportDialog } from './components/ExportDialog';
import { Header, type HeaderAction } from './components/Header';
import { ImportDialog } from './components/ImportDialog';
import { ReleaseDrawer } from './components/ReleaseDrawer';
import { ScopeControls, ViewSwitcher, type ViewMode } from './components/Toolbar';
import { useOverlay } from './components/useOverlay';
import { WhatIfBar } from './components/WhatIfBar';
import { DAY, startOfLocalDay, toInterval } from './domain/time';
import type { Conflict, Dataset, Id, Suggestion } from './domain/types';
import { useStore } from './state/useStore';
import { CalendarView, type MoveRequest } from './views/CalendarView';
import { environmentLanes, teamLanes } from './views/lanes';
import { conflictsByRelease, integrated, visibleConflicts, visibleReleases, visibleWindows, type Scope } from './views/model';
import { Swimlane } from './views/Swimlane';

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

  const [openId, setOpenId] = useState<Id | null>(null);
  const [dialog, setDialog] = useState<'import' | 'export' | null>(null);
  const [cabOpen, setCabOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlay(panelOpen, () => setPanelOpen(false), panelRef);
  const viewRef = useRef<HTMLDivElement>(null);

  const onSelect = useCallback((id: Id) => {
    setFocusIds([id]);
    setOpenId(id);
  }, []);

  const focusOn = (ids: Id[]) => {
    setFocusIds(ids);
    setPanelOpen(false);
    const first = ds.releases
      .filter((r) => ids.includes(r.id))
      .sort((a, b) => toInterval(a, tz).start - toInterval(b, tz).start)[0];
    if (first) {
      const t = toInterval(first, tz).start;
      setFocusDate(t);
      setTimelineStart(startOfLocalDay(t, tz) - 2 * DAY);
      // Leave scope if the focused release is outside the current team filter.
      if (!releases.some((r) => r.id === first.id)) setScope(integrated);
    }
    viewRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const applySuggestion = (sug: Extract<Suggestion, { kind: 'reschedule' }>) => {
    setPanelOpen(false);
    onMove({ releaseId: sug.releaseId, startAt: sug.startAt, endAt: sug.endAt });
    focusOn([sug.releaseId]);
  };

  const panelProps = {
    ds,
    conflicts: shownConflicts,
    timeZone: tz,
    onFocus: focusOn,
    onOpenRelease: (id: Id) => {
      setPanelOpen(false);
      onSelect(id);
    },
    onApply: applySuggestion,
  };

  const actions: HeaderAction[] = [
    { id: 'undo', label: 'Undo', onClick: store.undo, disabled: !store.canUndo },
    { id: 'import', label: 'Import', onClick: () => setDialog('import') },
    { id: 'export', label: 'Export .ics', onClick: () => setDialog('export'), disabled: !committed.releases.length },
    { id: 'cab', label: 'CAB agenda', onClick: () => setCabOpen(true), disabled: !committed.releases.length },
    { id: 'demo', label: 'Load demo data', onClick: store.loadDemo },
    { id: 'clear', label: 'Clear all data', onClick: store.clearAll, tone: 'danger', disabled: !committed.releases.length },
  ];

  if (!store.loaded) {
    return <p className="p-6 text-sm text-ink-soft">Loading schedule…</p>;
  }

  if (cabOpen) {
    return (
      <CabAgendaView
        ds={committed}
        conflicts={store.conflicts}
        timeZone={tz}
        initialWeekStart={startOfLocalDay(Date.now(), tz) - ((new Date().getDay() + 6) % 7) * DAY}
        onClose={() => setCabOpen(false)}
      />
    );
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
          <div className="ml-auto">
            <button
              type="button"
              className="btn lg:hidden"
              onClick={() => setPanelOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={panelOpen}
            >
              <ConflictCount count={shownConflicts.length} />
            </button>
            <p className="hidden min-h-[44px] items-center gap-1.5 text-sm font-medium lg:flex" aria-live="polite">
              <ConflictCount count={shownConflicts.length} />
            </p>
          </div>
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 scroll-mt-4" ref={viewRef}>
          <WhatIfBar store={store} onOpenRelease={onSelect} />
          {committed.releases.length === 0 && !draft ? (
            <EmptyState onLoadDemo={store.loadDemo} onImport={() => setDialog('import')} />
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
        <aside className="hidden min-w-0 lg:block" aria-label="Conflict panel">
          <div className="sticky top-4 h-[calc(100dvh-2rem)] overflow-hidden rounded border border-rule bg-white">
            <ConflictPanel {...panelProps} />
          </div>
        </aside>
      </main>

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/30 lg:hidden">
          <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="conflict-heading-mobile" className="flex h-dvh w-full max-w-[28rem] flex-col bg-white shadow-2xl">
            <div className="flex justify-end border-b border-rule p-2">
              <button type="button" className="btn" onClick={() => setPanelOpen(false)} aria-label="Close conflicts" data-autofocus>
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ConflictPanel {...panelProps} headingId="conflict-heading-mobile" />
            </div>
          </div>
        </div>
      )}

      {dialog === 'import' && (
        <ImportDialog
          current={committed}
          timeZone={tz}
          onClose={() => setDialog(null)}
          onImport={(dataset, label, mode) => (mode === 'replace' ? store.replaceAll(dataset, label) : store.commit(dataset, label))}
        />
      )}
      {dialog === 'export' && <ExportDialog ds={committed} initialTeamId={scope.teamId} onClose={() => setDialog(null)} />}

      {openId && <ReleaseDrawer key={openId} store={store} releaseId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ConflictCount({ count }: { count: number }) {
  return (
    <>
      <span
        className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full px-2 font-semibold ${
          count ? 'bg-alert text-white' : 'bg-go-tint text-go'
        }`}
      >
        {count}
      </span>
      <span>{count === 1 ? 'conflict' : 'conflicts'} in view</span>
    </>
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

function EmptyState({ onLoadDemo, onImport }: { onLoadDemo: () => void; onImport: () => void }) {
  return (
    <section className="rounded border border-dashed border-rule bg-white p-8">
      <h2 className="font-cond text-2xl font-semibold">No releases scheduled</h2>
      <p className="mt-2 max-w-prose text-sm text-ink-soft">
        Import your team's schedule from a CSV or JSON file, or load the synthetic demo to see conflict detection at work.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={onImport}>
          Import a schedule
        </button>
        <button type="button" className="btn" onClick={onLoadDemo}>
          Load demo data
        </button>
      </div>
    </section>
  );
}
