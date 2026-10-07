import { createContext, useContext } from 'react';
import type { Conflict, Dataset } from '../domain/types';
import type { ConflictDiff } from '../engine/evaluate';

export interface Draft {
  dataset: Dataset;
  label: string;
  /** Release being moved or edited, for ripple display. */
  releaseId: string;
}

export interface Store {
  loaded: boolean;
  dataset: Dataset;
  isDemo: boolean;
  timeZone: string;
  conflicts: Conflict[];
  draft: Draft | null;
  /** Conflicts of the draft and how they differ from the committed data. */
  draftConflicts: Conflict[] | null;
  draftDiff: ConflictDiff | null;
  canUndo: boolean;
  lastChange: string | null;
  commit: (dataset: Dataset, label: string) => void;
  setDraft: (draft: Draft | null) => void;
  applyDraft: () => void;
  undo: () => void;
  loadDemo: () => void;
  clearAll: () => void;
  replaceAll: (dataset: Dataset, label: string) => void;
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside <StoreProvider>');
  return s;
}
