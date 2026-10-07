import { useCallback, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import type { DataSource } from '../data/DataSource';
import { SCHEMA_VERSION } from '../data/DataSource';
import { generateSeed } from '../data/seed/generate';
import { emptyDataset, type Dataset } from '../domain/types';
import { diffConflicts, evaluate } from '../engine/evaluate';
import { StoreContext, type Draft, type Store } from './useStore';

const MAX_UNDO = 50;

interface State {
  loaded: boolean;
  dataset: Dataset;
  isDemo: boolean;
  history: { dataset: Dataset; isDemo: boolean; label: string }[];
  draft: Draft | null;
}

type Action =
  | { type: 'hydrate'; dataset: Dataset; isDemo: boolean }
  | { type: 'commit'; dataset: Dataset; label: string; isDemo?: boolean }
  | { type: 'undo' }
  | { type: 'draft'; draft: Draft | null };

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'hydrate':
      return { ...state, loaded: true, dataset: a.dataset, isDemo: a.isDemo, history: [], draft: null };
    case 'commit':
      return {
        ...state,
        dataset: a.dataset,
        isDemo: a.isDemo ?? state.isDemo,
        draft: null,
        history: [...state.history, { dataset: state.dataset, isDemo: state.isDemo, label: a.label }].slice(-MAX_UNDO),
      };
    case 'undo': {
      const prev = state.history.at(-1);
      if (!prev) return state;
      return { ...state, dataset: prev.dataset, isDemo: prev.isDemo, history: state.history.slice(0, -1), draft: null };
    }
    case 'draft':
      return { ...state, draft: a.draft };
  }
}



export function StoreProvider({ source, children, timeZone }: { source: DataSource; children: ReactNode; timeZone?: string }) {
  const tz = useMemo(() => timeZone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'), [timeZone]);
  const [state, dispatch] = useReducer(reducer, {
    loaded: false,
    dataset: emptyDataset(),
    isDemo: false,
    history: [],
    draft: null,
  });

  useEffect(() => {
    let cancelled = false;
    source.load().then((stored) => {
      if (cancelled) return;
      if (stored) dispatch({ type: 'hydrate', dataset: stored.dataset, isDemo: stored.isDemo });
      else dispatch({ type: 'hydrate', dataset: generateSeed(), isDemo: true });
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  useEffect(() => {
    if (!state.loaded) return;
    void source.save({ version: SCHEMA_VERSION, dataset: state.dataset, isDemo: state.isDemo, savedAt: new Date().toISOString() });
  }, [source, state.loaded, state.dataset, state.isDemo]);

  const conflicts = useMemo(() => evaluate(state.dataset, { timeZone: tz }), [state.dataset, tz]);
  const draftConflicts = useMemo(
    () => (state.draft ? evaluate(state.draft.dataset, { timeZone: tz }) : null),
    [state.draft, tz],
  );
  const draftDiff = useMemo(
    () => (draftConflicts ? diffConflicts(conflicts, draftConflicts) : null),
    [conflicts, draftConflicts],
  );

  const commit = useCallback((dataset: Dataset, label: string) => dispatch({ type: 'commit', dataset, label }), []);
  const setDraft = useCallback((draft: Draft | null) => dispatch({ type: 'draft', draft }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const draft = state.draft;
  const applyDraft = useCallback(() => {
    if (draft) dispatch({ type: 'commit', dataset: draft.dataset, label: draft.label });
  }, [draft]);
  const loadDemo = useCallback(
    () => dispatch({ type: 'commit', dataset: generateSeed(), label: 'Load synthetic demo data', isDemo: true }),
    [],
  );
  const clearAll = useCallback(
    () => dispatch({ type: 'commit', dataset: emptyDataset(), label: 'Clear all data', isDemo: false }),
    [],
  );
  const replaceAll = useCallback(
    (dataset: Dataset, label: string) => dispatch({ type: 'commit', dataset, label, isDemo: false }),
    [],
  );

  const value: Store = {
    loaded: state.loaded,
    dataset: state.dataset,
    isDemo: state.isDemo,
    timeZone: tz,
    conflicts,
    draft: state.draft,
    draftConflicts,
    draftDiff,
    canUndo: state.history.length > 0,
    lastChange: state.history.at(-1)?.label ?? null,
    commit,
    setDraft,
    applyDraft,
    undo,
    loadDemo,
    clearAll,
    replaceAll,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
