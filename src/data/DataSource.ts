import type { Dataset } from '../domain/types';

export const SCHEMA_VERSION = 1;

export interface StoredState {
  version: typeof SCHEMA_VERSION;
  dataset: Dataset;
  /** True while the synthetic seed is loaded (drives the demo banner). */
  isDemo: boolean;
  savedAt: string;
}

/**
 * All persistence goes through this interface.
 * Phase 1: LocalDataSource (browser storage). Phase 2: a Supabase implementation with the
 * same shape, where `subscribe` delivers changes pushed by webhook-driven Edge Functions.
 */
export interface DataSource {
  readonly name: string;
  load(): Promise<StoredState | null>;
  save(state: StoredState): Promise<void>;
  clear(): Promise<void>;
  /** Optional push channel for remote changes. Returns an unsubscribe function. */
  subscribe?(onChange: (state: StoredState) => void): () => void;
}
