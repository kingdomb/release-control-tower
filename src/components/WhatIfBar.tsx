import { useMemo } from 'react';
import { formatRange, toInterval } from '../domain/time';
import type { Conflict, Id } from '../domain/types';
import { rippleEffect } from '../engine/ripple';
import type { Store } from '../state/useStore';
import { RULE_LABEL } from '../views/model';

interface Props {
  store: Store;
  onOpenRelease: (id: Id) => void;
}

/** Preview of an uncommitted change: conflict diff, ripple effect, keep or discard. */
export function WhatIfBar({ store, onOpenRelease }: Props) {
  const { draft, draftDiff, timeZone: tz } = store;

  const ripple = useMemo(
    () => (draft ? rippleEffect(draft.dataset, draft.releaseId, { timeZone: tz }) : []),
    [draft, tz],
  );

  if (!draft || !draftDiff) {
    if (!store.canUndo || !store.lastChange) return null;
    return (
      <div role="status" className="no-print mb-3 flex flex-wrap items-center gap-2 rounded border border-rule bg-white px-3 py-2 text-sm">
        <span className="min-w-0 flex-1">Last change: {store.lastChange}</span>
        <button type="button" className="btn" onClick={store.undo}>
          Undo
        </button>
      </div>
    );
  }

  const ds = draft.dataset;
  const moved = ds.releases.find((r) => r.id === draft.releaseId);
  const before = store.dataset.releases.find((r) => r.id === draft.releaseId);
  const title = (id: Id) => ds.releases.find((r) => r.id === id)?.title ?? id;
  const newlyBroken = new Set(draftDiff.added.flatMap((c) => c.releaseIds));

  return (
    <section aria-labelledby="whatif-heading" className="no-print mb-3 rounded border-2 border-dashed border-approach bg-approach-tint/60 p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="whatif-heading" className="font-cond text-lg font-semibold">
            What-if: {draft.label}
          </h2>
          {moved && before && (
            <p className="text-sm text-ink-soft">
              {formatRange(toInterval(before, tz), tz)} <span aria-hidden="true">→</span>
              <span className="sr-only">to</span> <strong className="text-ink">{formatRange(toInterval(moved, tz), tz)}</strong>
            </p>
          )}
          <p className="mt-1 text-sm" aria-live="polite">
            <strong className={draftDiff.added.length ? 'text-alert' : ''}>{draftDiff.added.length} new</strong>,{' '}
            <strong className={draftDiff.resolved.length ? 'text-go' : ''}>{draftDiff.resolved.length} resolved</strong>,{' '}
            {draftDiff.unchanged.length} unchanged conflict{draftDiff.unchanged.length === 1 ? '' : 's'}.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn btn-primary" onClick={store.applyDraft}>
            Keep change
          </button>
          <button type="button" className="btn" onClick={() => store.setDraft(null)}>
            Discard
          </button>
        </div>
      </div>

      <div className="mt-2 grid gap-3 md:grid-cols-3">
        <DiffList title="New conflicts" items={draftDiff.added} tone="alert" />
        <DiffList title="Resolved" items={draftDiff.resolved} tone="go" />
        <div>
          <h3 className="text-xs font-semibold text-ink-soft">Ripple effect ({ripple.length} downstream)</h3>
          {ripple.length === 0 ? (
            <p className="text-sm text-ink-soft">Nothing depends on this release.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {ripple.map((r) => (
                <li key={r.releaseId} className="text-sm">
                  <button type="button" className="underline decoration-rule underline-offset-2 hover:decoration-ink" onClick={() => onOpenRelease(r.releaseId)}>
                    {title(r.releaseId)}
                  </button>{' '}
                  <span className="text-ink-soft">
                    ({r.via === 'dependency' ? 'depends on' : 'shares assets with'} {title(r.fromReleaseId)}
                    {r.depth > 1 ? `, ${r.depth} hops` : ''})
                  </span>
                  {newlyBroken.has(r.releaseId) && <strong className="ml-1 text-alert">now blocked</strong>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function DiffList({ title, items, tone }: { title: string; items: Conflict[]; tone: 'alert' | 'go' }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-ink-soft">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-ink-soft">None</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((c) => (
            <li key={c.id} className={`text-sm ${tone === 'alert' ? 'text-alert' : 'text-go'}`}>
              <strong>{RULE_LABEL[c.rule]}:</strong> <span className="text-ink">{c.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
