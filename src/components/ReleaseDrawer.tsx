import { useEffect, useMemo, useRef, useState } from 'react';
import { fromLocalInput, toLocalInput } from '../domain/localInput';
import { isValidTimed } from '../domain/time';
import type { ChangeClass, ChangeRequest, Dataset, Id, Release, ReleaseStatus } from '../domain/types';
import { missingPlans } from '../engine/completeness';
import type { Store } from '../state/useStore';
import { RULE_LABEL } from '../views/model';
import { ChangeClassBadge } from './ChangeClassBadge';
import { useOverlay } from './useOverlay';

const RFC_FIELDS: { key: keyof Omit<ChangeRequest, 'releaseId'>; label: string; hint: string }[] = [
  { key: 'description', label: 'Description', hint: 'What changes and why.' },
  { key: 'impactRisk', label: 'Impact and risk', hint: 'Who is affected, and what could go wrong.' },
  { key: 'implementationPlan', label: 'Implementation plan', hint: 'Steps to deploy.' },
  { key: 'rollbackPlan', label: 'Rollback plan', hint: 'How to back out if it fails.' },
  { key: 'testPlan', label: 'Test plan', hint: 'How you will know it worked.' },
];

const STATUSES: ReleaseStatus[] = ['planned', 'approved', 'in-progress', 'completed', 'cancelled'];

interface Props {
  store: Store;
  releaseId: Id;
  onClose: () => void;
}

interface Form {
  release: Release;
  cr: ChangeRequest;
}

function initialForm(ds: Dataset, id: Id): Form | null {
  const release = ds.releases.find((r) => r.id === id);
  if (!release) return null;
  const cr = ds.changeRequests.find((c) => c.releaseId === id) ?? {
    releaseId: id,
    description: '',
    impactRisk: '',
    implementationPlan: '',
    rollbackPlan: '',
    testPlan: '',
  };
  return { release: { ...release }, cr: { ...cr } };
}

function applyForm(ds: Dataset, f: Form): Dataset {
  const hasCr = ds.changeRequests.some((c) => c.releaseId === f.release.id);
  return {
    ...ds,
    releases: ds.releases.map((r) => (r.id === f.release.id ? f.release : r)),
    changeRequests: hasCr ? ds.changeRequests.map((c) => (c.releaseId === f.cr.releaseId ? f.cr : c)) : [...ds.changeRequests, f.cr],
  };
}

export function ReleaseDrawer({ store, releaseId, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  useOverlay(true, onClose, panel);
  const base = store.draft?.dataset ?? store.dataset;
  const [form, setForm] = useState<Form | null>(() => initialForm(base, releaseId));
  const [previewed, setPreviewed] = useState<string | null>(null);

  // Re-read when another release is opened or the committed data changes underneath (undo).
  useEffect(() => {
    setForm(initialForm(store.draft?.dataset ?? store.dataset, releaseId));
    setPreviewed(null);
  }, [releaseId, store.dataset]); // eslint-disable-line react-hooks/exhaustive-deps

  const formKey = JSON.stringify(form);
  const valid = !!form && form.release.title.trim() !== '' && isValidTimed(form.release);
  const missing = form && form.release.changeClass !== 'standard' ? missingPlans(form.cr) : [];
  const ds = store.dataset;
  const deps = useMemo(
    () => ({
      dependsOn: ds.dependencies.filter((d) => d.releaseId === releaseId).map((d) => d.dependsOnReleaseId),
      requiredBy: ds.dependencies.filter((d) => d.dependsOnReleaseId === releaseId).map((d) => d.releaseId),
    }),
    [ds, releaseId],
  );
  const conflicts = (store.draftConflicts ?? store.conflicts).filter((c) => c.releaseIds.includes(releaseId));

  if (!form) return null;
  const r = form.release;
  const set = (patch: Partial<Release>) => setForm({ ...form, release: { ...r, ...patch } });
  const setCr = (patch: Partial<ChangeRequest>) => setForm({ ...form, cr: { ...form.cr, ...patch } });

  const preview = () => {
    store.setDraft({ releaseId, label: `Edit "${r.title}"`, dataset: applyForm(store.dataset, form) });
    setPreviewed(formKey);
  };
  const save = () => {
    store.applyDraft();
    onClose();
  };
  const title = (id: Id) => ds.releases.find((x) => x.id === id)?.title ?? id;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" aria-hidden={false}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="flex h-dvh w-full max-w-[34rem] flex-col bg-white shadow-2xl"
      >
        <div className="flex items-start gap-2 border-b border-rule p-4">
          <div className="min-w-0 flex-1">
            <h2 id="drawer-title" className="font-cond text-xl font-semibold leading-tight">
              {r.title || 'Untitled release'}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
              <ChangeClassBadge value={r.changeClass} />
              <span>{ds.products.find((p) => p.id === r.productId)?.name}</span>
            </div>
          </div>
          <button type="button" className="btn shrink-0" onClick={onClose} aria-label="Close release details">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form
          className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (previewed === formKey) save();
            else preview();
          }}
        >
          {conflicts.length > 0 && (
            <div className="rounded border border-alert/50 bg-alert-tint p-3" role="note">
              <h3 className="text-sm font-semibold text-alert">
                {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''}
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {conflicts.map((c) => (
                  <li key={c.id}>
                    <strong>{RULE_LABEL[c.rule]}:</strong> {c.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 font-cond text-lg font-semibold">Schedule</legend>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="f-title">
                Title
              </label>
              <input id="f-title" className="field" value={r.title} onChange={(e) => set({ title: e.target.value })} required />
            </div>
            <div>
              <label className="label" htmlFor="f-product">
                Product
              </label>
              <select id="f-product" className="field" value={r.productId} onChange={(e) => set({ productId: e.target.value })}>
                {ds.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-env">
                Environment
              </label>
              <select id="f-env" className="field" value={r.environmentId} onChange={(e) => set({ environmentId: e.target.value })}>
                {ds.environments.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
            {r.allDay ? (
              <>
                <div>
                  <label className="label" htmlFor="f-start">
                    First day
                  </label>
                  <input id="f-start" type="date" className="field" value={r.startAt.slice(0, 10)} onChange={(e) => set({ startAt: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor="f-end">
                    Day after last day
                  </label>
                  <input id="f-end" type="date" className="field" value={r.endAt.slice(0, 10)} onChange={(e) => set({ endAt: e.target.value })} />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="label" htmlFor="f-start">
                    Start
                  </label>
                  <input
                    id="f-start"
                    type="datetime-local"
                    className="field"
                    value={toLocalInput(r.startAt)}
                    onChange={(e) => e.target.value && set({ startAt: fromLocalInput(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="f-end">
                    End
                  </label>
                  <input
                    id="f-end"
                    type="datetime-local"
                    className="field"
                    value={toLocalInput(r.endAt)}
                    onChange={(e) => e.target.value && set({ endAt: fromLocalInput(e.target.value) })}
                  />
                </div>
              </>
            )}
            {!isValidTimed(r) && <p className="text-sm text-alert sm:col-span-2">The end must be after the start.</p>}
            <div>
              <label className="label" htmlFor="f-class">
                Change class
              </label>
              <select id="f-class" className="field" value={r.changeClass} onChange={(e) => set({ changeClass: e.target.value as ChangeClass })}>
                <option value="standard">Standard</option>
                <option value="normal">Normal</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-status">
                Status
              </label>
              <select id="f-status" className="field" value={r.status} onChange={(e) => set({ status: e.target.value as ReleaseStatus })}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0]!.toUpperCase() + s.slice(1).replace('-', ' ')}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-2 font-cond text-lg font-semibold">Change request</legend>
            {missing.length > 0 && (
              <p className="rounded border border-amber/50 bg-amber-tint p-2 text-sm" role="note">
                A {r.changeClass} change needs a {missing.join(' and a ')} before it can be approved.
              </p>
            )}
            {RFC_FIELDS.map((f) => {
              const isMissing = (f.key === 'rollbackPlan' && missing.includes('rollback plan')) || (f.key === 'testPlan' && missing.includes('test plan'));
              return (
                <div key={f.key}>
                  <label className="label" htmlFor={`f-${f.key}`}>
                    {f.label}
                    {isMissing && <span className="ml-1 font-semibold text-alert">(required)</span>}
                  </label>
                  <textarea
                    id={`f-${f.key}`}
                    rows={2}
                    className={`field py-2 ${isMissing ? 'border-alert' : ''}`}
                    value={form.cr[f.key]}
                    aria-describedby={`f-${f.key}-hint`}
                    aria-invalid={isMissing || undefined}
                    onChange={(e) => setCr({ [f.key]: e.target.value })}
                  />
                  <p id={`f-${f.key}-hint`} className="mt-0.5 text-xs text-ink-soft">
                    {f.hint}
                  </p>
                </div>
              );
            })}
          </fieldset>

          {(deps.dependsOn.length > 0 || deps.requiredBy.length > 0 || (r.configItemIds ?? []).length > 0) && (
            <section className="space-y-2 text-sm">
              <h3 className="font-cond text-lg font-semibold">Dependencies</h3>
              {deps.dependsOn.length > 0 && <p>Depends on: {deps.dependsOn.map(title).join(', ')}</p>}
              {deps.requiredBy.length > 0 && <p>Required by: {deps.requiredBy.map(title).join(', ')}</p>}
              {(r.configItemIds ?? []).length > 0 && (
                <p>
                  Touches:{' '}
                  {(r.configItemIds ?? []).map((id) => ds.configItems.find((c) => c.id === id)?.name ?? id).join(', ')}
                </p>
              )}
            </section>
          )}

          <div className="sticky bottom-0 -mx-4 border-t border-rule bg-white px-4 py-3">
            {previewed === formKey && store.draftDiff && (
              <p className="mb-2 text-sm" aria-live="polite">
                This change adds <strong className="text-alert">{store.draftDiff.added.length}</strong> and resolves{' '}
                <strong className="text-go">{store.draftDiff.resolved.length}</strong> conflict
                {store.draftDiff.resolved.length === 1 ? '' : 's'}. Review it, then save.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={preview} disabled={!valid}>
                Preview impact
              </button>
              <button type="submit" className="btn btn-primary" disabled={!valid || previewed !== formKey}>
                Save changes
              </button>
              <button type="button" className="btn" onClick={onClose}>
                Close
              </button>
            </div>
            {previewed !== formKey && <p className="mt-1 text-xs text-ink-soft">Preview the impact to enable saving.</p>}
          </div>
        </form>
      </div>
    </div>
  );
}
