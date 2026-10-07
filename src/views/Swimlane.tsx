import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { dateToUtc, DAY, dayKey, formatRange, formatShort, iso, MINUTE, overlaps, type Interval } from '../domain/time';
import type { Conflict, Id, Release, WindowKind } from '../domain/types';
import type { MoveRequest } from './CalendarView';
import { WINDOW_LABEL } from './model';
import { Strip, stripDescription } from './Strip';

export interface Lane {
  id: Id;
  label: string;
  sublabel?: string;
}

export interface LaneItem {
  id: Id;
  laneId: Id;
  iv: Interval;
  release?: Release;
  /** Non-release booking (environment lanes). */
  booking?: { title: string; owner: string };
}

export interface Band {
  id: Id;
  kind: WindowKind;
  name: string;
  scopeLabel: string;
  iv: Interval;
  /** Lanes the band applies to; null = every lane. */
  laneIds: Id[] | null;
}

interface Props {
  title: string;
  lanes: Lane[];
  items: LaneItem[];
  bands: Band[];
  start: number;
  days: number;
  timeZone: string;
  conflictsFor: (releaseId: Id) => Conflict[];
  focusIds: Id[];
  draftIds: Id[];
  onRangeChange: (start: number) => void;
  onSelect: (releaseId: Id) => void;
  onMove: (move: MoveRequest) => void;
}

const SNAP = 30 * MINUTE;
/** Strips are 44px tall so every one is a comfortable tap target. */
const ROW_H = 48;
const DAY_PX = 120;
/** Short releases still get a readable strip; packing uses this visual width. */
const MIN_STRIP_PX = 112;
const MIN_STRIP_MS = (MIN_STRIP_PX / DAY_PX) * DAY;

/** Greedy packing so items that would overlap on screen sit on separate rows. */
function pack(items: LaneItem[]): Map<Id, number> {
  const rows: number[] = [];
  const out = new Map<Id, number>();
  for (const it of [...items].sort((a, b) => a.iv.start - b.iv.start)) {
    const visualEnd = Math.max(it.iv.end, it.iv.start + MIN_STRIP_MS);
    let row = rows.findIndex((end) => end <= it.iv.start);
    if (row === -1) row = rows.push(0) - 1;
    rows[row] = visualEnd;
    out.set(it.id, row);
  }
  return out;
}

export function Swimlane(props: Props) {
  const { title, lanes, items, bands, start, days, timeZone, conflictsFor, focusIds, draftIds, onRangeChange, onSelect, onMove } = props;
  const end = start + days * DAY;
  const range: Interval = { start, end };
  const px = (t: number) => ((Math.min(Math.max(t, start), end) - start) / DAY) * DAY_PX;
  const widthPx = (iv: Interval) => px(iv.end) - px(iv.start);

  const visible = useMemo(() => items.filter((i) => overlaps(i.iv, range)), [items, start, end]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayStarts = Array.from({ length: days }, (_, i) => start + i * DAY);
  const todayKey = dayKey(Date.now(), timeZone);

  const drag = useRef<{ id: Id; x: number; moved: boolean } | null>(null);
  const [dragDelta, setDragDelta] = useState<{ id: Id; ms: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent, item: LaneItem) => {
    if (!item.release || item.release.allDay) return;
    drag.current = { id: item.id, x: e.clientX, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) d.moved = true;
    const ms = Math.round(((dx / DAY_PX) * DAY) / SNAP) * SNAP;
    setDragDelta({ id: d.id, ms });
  };
  const onPointerUp = (item: LaneItem) => {
    const d = drag.current;
    drag.current = null;
    const delta = dragDelta?.id === item.id ? dragDelta.ms : 0;
    setDragDelta(null);
    if (!d) return;
    if (!d.moved) return onSelect(item.id);
    if (delta && item.release) {
      onMove({ releaseId: item.id, startAt: iso(item.iv.start + delta), endAt: iso(item.iv.end + delta) });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent, item: LaneItem) => {
    if (!item.release) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(item.id);
      return;
    }
    // Keyboard what-if: Alt+Arrow moves by 30 minutes, Shift+Alt+Arrow by a day.
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !item.release.allDay) {
      e.preventDefault();
      const step = (e.shiftKey ? DAY : SNAP) * (e.key === 'ArrowLeft' ? -1 : 1);
      onMove({ releaseId: item.id, startAt: iso(item.iv.start + step), endAt: iso(item.iv.end + step) });
    }
  };

  return (
    <section aria-label={title} className="rounded border border-rule bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-rule p-2 sm:p-3">
        <div className="flex gap-1">
          <button type="button" className="btn" onClick={() => onRangeChange(start - 7 * DAY)} aria-label="Previous week">
            <span aria-hidden="true">‹</span>
          </button>
          <button type="button" className="btn" onClick={() => onRangeChange(start + 7 * DAY)} aria-label="Next week">
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" className="btn" onClick={() => onRangeChange(Date.now())}>
            Today
          </button>
        </div>
        <h2 className="min-w-0 font-cond text-lg font-semibold sm:text-xl">
          {formatShort(start, timeZone).replace(/, \d\d:\d\d$/, '')} – {formatShort(end - 1, timeZone).replace(/, \d\d:\d\d$/, '')}
        </h2>
        <p className="w-full text-xs text-ink-soft sm:ml-auto sm:w-auto">
          Drag a strip, or focus it and press Alt+←/→ (Shift for a day), to try a new time.
        </p>
      </div>

      <div className="overflow-x-auto">
        <div style={{ width: `calc(10rem + ${days * DAY_PX}px)` }}>
          <div className="grid grid-cols-[10rem_1fr] border-b border-rule text-xs text-ink-soft">
            <div className="p-2 font-medium">Lane</div>
            <div className="relative flex">
              {dayStarts.map((d) => (
                <div
                  key={d}
                  style={{ width: DAY_PX }}
                  className={`shrink-0 border-l border-rule px-1 py-2 text-center ${dayKey(d, timeZone) === todayKey ? 'bg-approach-tint font-semibold text-ink' : ''}`}
                >
                  {formatShort(d, timeZone).replace(/, \d\d:\d\d$/, '')}
                </div>
              ))}
            </div>
          </div>

          {lanes.map((lane) => {
            const laneItems = visible.filter((i) => i.laneId === lane.id);
            const rows = pack(laneItems);
            const rowCount = Math.max(1, ...[...rows.values()].map((r) => r + 1));
            const laneBands = bands.filter((b) => (!b.laneIds || b.laneIds.includes(lane.id)) && overlaps(b.iv, range));
            return (
              <div key={lane.id} className="grid grid-cols-[10rem_1fr] border-b border-rule last:border-b-0">
                <div className="min-w-0 p-2">
                  <div className="truncate font-cond text-sm font-semibold">{lane.label}</div>
                  {lane.sublabel && <div className="truncate text-xs text-ink-soft">{lane.sublabel}</div>}
                </div>
                <div data-track className="relative" style={{ height: rowCount * ROW_H + 8 }}>
                  {dayStarts.map((d, i) => (
                    <div key={d} className="absolute inset-y-0 border-l border-rule/70" style={{ left: i * DAY_PX }} aria-hidden="true" />
                  ))}
                  {laneBands.map((b) => (
                    <div
                      key={b.id}
                      className={`band-${b.kind} absolute inset-y-0`}
                      style={{ left: px(b.iv.start), width: widthPx(b.iv) }}
                      title={`${WINDOW_LABEL[b.kind]}: ${b.name} (${b.scopeLabel}), ${formatRange(b.iv, timeZone)}`}
                      aria-hidden="true"
                    />
                  ))}
                  {laneItems.map((item) => {
                    const delta = dragDelta?.id === item.id ? dragDelta.ms : 0;
                    const iv = { start: item.iv.start + delta, end: item.iv.end + delta };
                    const row = rows.get(item.id) ?? 0;
                    const left = px(iv.start);
                    const style = { left, width: Math.min(Math.max(widthPx(iv), MIN_STRIP_PX), days * DAY_PX - left), top: 4 + row * ROW_H, height: ROW_H - 4 };
                    if (item.booking) {
                      return (
                        <div
                          key={item.id}
                          className="absolute flex items-center overflow-hidden rounded-sm border border-dashed border-ink-faint bg-console px-1 text-[0.72rem] text-ink-soft"
                          style={style}
                          title={`Booking: ${item.booking.title} (${item.booking.owner}), ${formatRange(item.iv, timeZone)}`}
                        >
                          <span className="truncate">
                            {item.booking.title} · {item.booking.owner}
                          </span>
                        </div>
                      );
                    }
                    const r = item.release!;
                    const conflicts = conflictsFor(r.id);
                    const desc = stripDescription(r, conflicts, formatRange(item.iv, timeZone));
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="absolute touch-none p-0 text-left"
                        style={style}
                        aria-label={desc}
                        title={desc}
                        onPointerDown={(e) => onPointerDown(e, item)}
                        onPointerMove={onPointerMove}
                        onPointerUp={() => onPointerUp(item)}
                        onPointerCancel={() => {
                          drag.current = null;
                          setDragDelta(null);
                        }}
                        onKeyDown={(e) => onKeyDown(e, item)}
                      >
                        <Strip release={r} conflicts={conflicts} focused={focusIds.includes(r.id)} draft={draftIds.includes(r.id)} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {lanes.length === 0 && <p className="p-6 text-sm text-ink-soft">Nothing to show for this scope.</p>}
        </div>
      </div>
    </section>
  );
}

/** Local midnight (in `timeZone`) of the day containing `t`. */
export const startOfLocalDay = (t: number, timeZone: string) => dateToUtc(dayKey(t, timeZone), timeZone);
