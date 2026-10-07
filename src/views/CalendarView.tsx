import type { EventDropArg, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { DAY, dayKey, formatRange, HOUR, iso, startOfLocalDay, toInterval } from '../domain/time';
import type { Conflict, Id, Release, Window } from '../domain/types';
import { stripDescription, WINDOW_LABEL } from './model';
import { Strip } from './Strip';

export type CalendarMode = 'month' | 'week';

export interface MoveRequest {
  releaseId: Id;
  startAt: string;
  endAt: string;
}

interface Props {
  mode: CalendarMode;
  releases: Release[];
  windows: Window[];
  conflictsFor: (releaseId: Id) => Conflict[];
  focusIds: Id[];
  draftIds: Id[];
  timeZone: string;
  /** Date to bring into view (changes when a conflict is focused). */
  focusDate: number | null;
  onSelect: (releaseId: Id) => void;
  onMove: (move: MoveRequest) => void;
}

const toAllDayString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const NARROW = '(max-width: 639px)';
function useNarrow(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(NARROW);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(NARROW).matches,
  );
}

function fcView(mode: CalendarMode, narrow: boolean) {
  // Seven columns are unreadable on a phone, so narrow screens get an agenda list.
  if (narrow) return mode === 'month' ? 'listMonth' : 'listWeek';
  return mode === 'month' ? 'dayGridMonth' : 'timeGridWeek';
}

export function CalendarView({ mode, releases, windows, conflictsFor, focusIds, draftIds, timeZone, focusDate, onSelect, onMove }: Props) {
  const ref = useRef<FullCalendar>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const narrow = useNarrow();
  const view = fcView(mode, narrow);

  useEffect(() => {
    ref.current?.getApi().changeView(view);
  }, [view]);

  useEffect(() => {
    if (focusDate != null) ref.current?.getApi().gotoDate(new Date(focusDate));
  }, [focusDate]);

  const events = useMemo<EventInput[]>(() => {
    const bands: EventInput[] = windows.flatMap((w): EventInput[] => {
      const base = { id: `window:${w.id}`, title: `${WINDOW_LABEL[w.kind]}: ${w.name}`, display: 'background', classNames: [`band-${w.kind}`] };
      if (narrow) {
        // List views cannot draw background bands; show the window as its own row.
        return [{ ...base, display: 'auto', start: w.startAt, end: w.endAt, allDay: !!w.allDay, editable: false, extendedProps: { window: w } }];
      }
      if (mode === 'month' && !w.allDay) {
        // The month grid only draws all-day background events. Emit one per local day, and record
        // which fraction of that day the window covers so a 19:00 start does not shade the whole day.
        const iv = toInterval(w, timeZone);
        const days: EventInput[] = [];
        for (let day = startOfLocalDay(iv.start, timeZone); day < iv.end; ) {
          const next = startOfLocalDay(day + DAY + 2 * HOUR, timeZone);
          const from = Math.max(0, (iv.start - day) / (next - day));
          const to = Math.min(1, (iv.end - day) / (next - day));
          days.push({
            ...base,
            id: `${base.id}:${dayKey(day, timeZone)}`,
            title: `${base.title} (${formatRange(iv, timeZone)})`,
            allDay: true,
            start: dayKey(day, timeZone),
            end: dayKey(next, timeZone),
            extendedProps: { from, to },
          });
          day = next;
        }
        return days;
      }
      return [{ ...base, start: w.startAt, end: w.endAt, allDay: !!w.allDay }];
    });
    const items: EventInput[] = releases.map((r) => ({
      id: r.id,
      title: r.title,
      start: r.startAt,
      end: r.endAt,
      allDay: !!r.allDay,
      editable: r.status !== 'completed' && r.status !== 'cancelled',
      extendedProps: { release: r },
    }));
    return [...bands, ...items];
  }, [releases, windows, mode, timeZone, narrow]);

  const handleChange = (arg: EventDropArg | EventResizeDoneArg) => {
    const { event } = arg;
    const release = event.extendedProps.release as Release | undefined;
    if (!release || !event.start) return arg.revert();
    const end = event.end ?? new Date(event.start.getTime() + (Date.parse(release.endAt) - Date.parse(release.startAt)));
    // The store keeps the moved release as a draft; the calendar re-renders from it.
    arg.revert();
    onMove(
      release.allDay
        ? { releaseId: release.id, startAt: toAllDayString(event.start), endAt: toAllDayString(end) }
        : { releaseId: release.id, startAt: iso(event.start.getTime()), endAt: iso(end.getTime()) },
    );
  };

  // FullCalendar's arrow icons are role="img" without a name; the buttons already have one.
  const hideIcons = () =>
    wrapper.current?.querySelectorAll('.fc-icon').forEach((el) => {
      el.removeAttribute('role');
      el.setAttribute('aria-hidden', 'true');
    });

  return (
    <div ref={wrapper} className="rounded border border-rule bg-white p-2 sm:p-3">
      <FullCalendar
        ref={ref}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView={view}
        initialDate={focusDate ?? undefined}
        headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
        buttonText={{ today: 'Today' }}
        buttonHints={{ prev: 'Previous $0', next: 'Next $0', today: 'Go to $0' }}
        firstDay={1}
        height="auto"
        expandRows
        dayMaxEvents={3}
        nowIndicator
        scrollTime="08:00:00"
        slotMinTime="00:00:00"
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        defaultRangeSeparator="–"
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        events={events}
        viewDidMount={hideIcons}
        datesSet={hideIcons}
        moreLinkDidMount={(arg) => arg.el.setAttribute('role', 'button')}
        editable
        eventDurationEditable
        eventDrop={handleChange}
        eventResize={handleChange}
        eventClick={(info) => {
          if (info.event.display === 'background' || info.event.extendedProps.window) return;
          info.jsEvent.preventDefault();
          onSelect(info.event.id);
        }}
        eventContent={(arg) => {
          if (arg.event.display === 'background') return undefined;
          if (arg.event.extendedProps.window) {
            return <span className={`band-${(arg.event.extendedProps.window as Window).kind} block rounded-sm px-2 py-1 text-xs`}>{arg.event.title}</span>;
          }
          const r = arg.event.extendedProps.release as Release;
          return (
            <Strip
              release={r}
              conflicts={conflictsFor(r.id)}
              focused={focusIds.includes(r.id)}
              draft={draftIds.includes(r.id)}
              timeLabel={arg.timeText || undefined}
            />
          );
        }}
        eventDidMount={(arg) => {
          if (arg.event.display === 'background') {
            const { from, to } = arg.event.extendedProps as { from?: number; to?: number };
            if (from !== undefined && to !== undefined && (from > 0 || to < 1)) {
              arg.el.classList.add('band-partial');
              arg.el.style.setProperty('--from', `${(from * 100).toFixed(1)}%`);
              arg.el.style.setProperty('--to', `${(to * 100).toFixed(1)}%`);
            }
            arg.el.setAttribute('title', arg.event.title);
            return;
          }
          if (arg.event.extendedProps.window) return;
          const r = arg.event.extendedProps.release as Release;
          const when = formatRange(toInterval(r, timeZone), timeZone);
          const desc = stripDescription(r, conflictsFor(r.id), when);
          arg.el.setAttribute('tabindex', '0');
          arg.el.setAttribute('role', 'button');
          arg.el.setAttribute('aria-label', desc);
          arg.el.setAttribute('title', desc);
          arg.el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(r.id);
            }
          });
        }}
      />
    </div>
  );
}
