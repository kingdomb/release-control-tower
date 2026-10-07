import { useMemo, useState } from 'react';
import { DAY, formatRange, formatShort, toInterval } from '../domain/time';
import type { Conflict, Dataset } from '../domain/types';
import { buildCabAgenda, CAB_ROLES, type AgendaChange } from '../export/cabAgenda';
import { CHANGE_CLASS, RULE_LABEL } from '../views/model';

interface Props {
  ds: Dataset;
  conflicts: Conflict[];
  timeZone: string;
  initialWeekStart: number;
  onClose: () => void;
}

const dateOnly = (ms: number, tz: string) => formatShort(ms, tz).replace(/, \d\d:\d\d$/, '');

/** Printable weekly agenda for a Minimum Viable CAB. */
export function CabAgendaView({ ds, conflicts, timeZone, initialWeekStart, onClose }: Props) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const agenda = useMemo(() => buildCabAgenda(ds, conflicts, weekStart, timeZone), [ds, conflicts, weekStart, timeZone]);
  const total = agenda.changes.normal.length + agenda.changes.emergency.length + agenda.changes.standard.length;
  const range = `${dateOnly(agenda.week.start, timeZone)} – ${dateOnly(agenda.week.end - 1, timeZone)}`;

  return (
    <div className="min-h-dvh bg-white">
      <div className="no-print sticky top-0 z-10 border-b border-rule bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 py-2">
          <button type="button" className="btn" onClick={onClose}>
            Back to calendar
          </button>
          <div className="flex gap-1">
            <button type="button" className="btn" onClick={() => setWeekStart(weekStart - 7 * DAY)} aria-label="Previous week">
              <span aria-hidden="true">‹</span>
            </button>
            <button type="button" className="btn" onClick={() => setWeekStart(weekStart + 7 * DAY)} aria-label="Next week">
              <span aria-hidden="true">›</span>
            </button>
          </div>
          <button type="button" className="btn btn-primary ml-auto" onClick={() => window.print()}>
            Print agenda
          </button>
        </div>
      </div>

      <article className="mx-auto max-w-4xl px-4 py-6 print:px-0 print:py-0">
        <header className="border-b-2 border-ink pb-3">
          <h1 className="font-cond text-3xl font-semibold">Change Advisory Board agenda</h1>
          <p className="text-lg">Week of {range}</p>
          <p className="text-sm text-ink-soft">
            {total} change{total === 1 ? '' : 's'}, {agenda.conflicts.length} conflict{agenda.conflicts.length === 1 ? '' : 's'}, {agenda.risks.length}{' '}
            open risk{agenda.risks.length === 1 ? '' : 's'}. Times in {timeZone.replace(/_/g, ' ')}.
          </p>
        </header>

        <section className="mt-5 break-inside-avoid">
          <h2 className="font-cond text-xl font-semibold">Attendees</h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <tbody>
              {CAB_ROLES.map((role) => (
                <tr key={role} className="border-b border-rule">
                  <th scope="row" className="w-48 py-2 pr-3 text-left font-medium">
                    {role}
                  </th>
                  <td className="py-2 text-ink-soft">Name: ______________________</td>
                  <td className="w-24 py-2 text-ink-soft">Present ☐</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <ChangeTable title="Normal changes for approval" items={agenda.changes.normal} tz={timeZone} decision />
        <ChangeTable title="Emergency changes for review" items={agenda.changes.emergency} tz={timeZone} decision />
        <ChangeTable title="Standard changes (pre-approved, for information)" items={agenda.changes.standard} tz={timeZone} />

        <section className="mt-6">
          <h2 className="font-cond text-xl font-semibold">Conflicts to resolve</h2>
          {agenda.conflicts.length === 0 ? (
            <p className="mt-1 text-sm text-ink-soft">None this week.</p>
          ) : (
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
              {agenda.conflicts.map((c) => (
                <li key={c.id} className="break-inside-avoid">
                  <strong>
                    {RULE_LABEL[c.rule]} ({c.severity})
                  </strong>
                  : {c.message}
                  {c.suggestions.length > 0 && <div className="text-ink-soft">Suggested: {c.suggestions.map((s) => s.label).join('; ')}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="mt-6">
          <h2 className="font-cond text-xl font-semibold">Open risks</h2>
          {agenda.risks.length === 0 ? (
            <p className="mt-1 text-sm text-ink-soft">None recorded.</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {agenda.risks.map((r, i) => (
                <li key={i} className="break-inside-avoid">
                  <strong>{r.title}</strong>: {r.text}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 break-inside-avoid">
          <h2 className="font-cond text-xl font-semibold">Actions and notes</h2>
          <div className="mt-2 h-32 rounded border border-rule" />
        </section>
      </article>
    </div>
  );
}

function ChangeTable({ title, items, tz, decision }: { title: string; items: AgendaChange[]; tz: string; decision?: boolean }) {
  return (
    <section className="mt-6">
      <h2 className="font-cond text-xl font-semibold">
        {title} <span className="text-ink-soft">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-ink-soft">None.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-ink">
                <th scope="col" className="py-1 pr-2 font-semibold">When</th>
                <th scope="col" className="py-1 pr-2 font-semibold">Change</th>
                <th scope="col" className="py-1 pr-2 font-semibold">Team / environment</th>
                <th scope="col" className="py-1 pr-2 font-semibold">RFC</th>
                {decision && <th scope="col" className="py-1 font-semibold">Decision</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.release.id} className="break-inside-avoid border-b border-rule align-top">
                  <td className="py-2 pr-2 tabular-nums">{formatRange(toInterval(c.release, tz), tz)}</td>
                  <td className="py-2 pr-2">
                    <div className="font-medium">{c.release.title}</div>
                    <div className="text-ink-soft">{CHANGE_CLASS[c.release.changeClass].label}, {c.release.status}</div>
                    {c.impactRisk && <div className="text-ink-soft">Risk: {c.impactRisk}</div>}
                    {c.conflictCount > 0 && (
                      <div className="font-semibold text-alert">
                        {c.conflictCount} conflict{c.conflictCount > 1 ? 's' : ''}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    {c.team}
                    <div className="text-ink-soft">{c.environment}</div>
                  </td>
                  <td className="py-2 pr-2">{c.missing.length ? <span className="text-alert">Missing {c.missing.join(', ')}</span> : 'Complete'}</td>
                  {decision && <td className="whitespace-nowrap py-2">☐ Approve ☐ Reject ☐ Defer</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
