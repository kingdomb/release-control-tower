import { SCHEMA_VERSION, type DataSource, type StoredState } from './DataSource';

const KEY = 'release-control-tower:v1';

/**
 * Phase 1 data source: one JSON document in localStorage. Storage can be unavailable
 * (private windows, blocked site data), so every access is guarded and the app keeps
 * working in memory.
 */
export class LocalDataSource implements DataSource {
  readonly name = 'Browser storage';

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = safeLocalStorage()) {}

  async load(): Promise<StoredState | null> {
    try {
      const raw = this.storage?.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredState;
      return parsed.version === SCHEMA_VERSION && parsed.dataset ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(state: StoredState): Promise<void> {
    try {
      this.storage?.setItem(KEY, JSON.stringify(state));
    } catch {
      // Quota exceeded or storage blocked: keep running in memory.
    }
  }

  async clear(): Promise<void> {
    try {
      this.storage?.removeItem(KEY);
    } catch {
      // ignore
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}
