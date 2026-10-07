import type { Timed } from './types';

/** Half-open interval in epoch milliseconds: [start, end). */
export interface Interval {
  start: number;
  end: number;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function contains(outer: Interval, inner: Interval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Offset of `timeZone` from UTC at instant `utcMs`, in ms (e.g. -5h for New York in winter). */
export function tzOffset(utcMs: number, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Instant of local wall-clock time y-m-d h:mi in `timeZone`. Handles DST transitions. */
export function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, timeZone: string): number {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - tzOffset(guess, timeZone);
  const second = tzOffset(t, timeZone);
  if (guess - second !== t) t = guess - second;
  return t;
}

export function parseDateOnly(s: string): [number, number, number] | null {
  const m = DATE_ONLY.exec(s);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Start of the given calendar date (local midnight) in `timeZone`. */
export function dateToUtc(date: string, timeZone: string): number {
  const p = parseDateOnly(date);
  if (!p) throw new Error(`Invalid all-day date "${date}" (expected YYYY-MM-DD)`);
  return zonedToUtc(p[0], p[1], p[2], 0, 0, timeZone);
}

/** Convert a timed or all-day item to an interval. All-day items are resolved in `timeZone`. */
export function toInterval(item: Timed, timeZone: string): Interval {
  if (item.allDay) {
    return { start: dateToUtc(item.startAt.slice(0, 10), timeZone), end: dateToUtc(item.endAt.slice(0, 10), timeZone) };
  }
  const start = Date.parse(item.startAt);
  const end = Date.parse(item.endAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error(`Invalid timestamp in item (${item.startAt} – ${item.endAt})`);
  }
  return { start, end };
}

export function isValidTimed(item: Timed): boolean {
  if (item.allDay) {
    const s = parseDateOnly(item.startAt.slice(0, 10));
    const e = parseDateOnly(item.endAt.slice(0, 10));
    return !!s && !!e && item.endAt.slice(0, 10) > item.startAt.slice(0, 10);
  }
  const start = Date.parse(item.startAt);
  const end = Date.parse(item.endAt);
  return !Number.isNaN(start) && !Number.isNaN(end) && end > start;
}

export const iso = (ms: number): string => new Date(ms).toISOString();

const displayCache = new Map<string, Intl.DateTimeFormat>();

function displayFormatter(kind: 'short' | 'time' | 'day', timeZone: string): Intl.DateTimeFormat {
  const key = `${kind}|${timeZone}`;
  let f = displayCache.get(key);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions =
      kind === 'short'
        ? { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
        : kind === 'time'
          ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
          : { year: 'numeric', month: '2-digit', day: '2-digit' };
    f = new Intl.DateTimeFormat(kind === 'day' ? 'en-CA' : 'en-GB', { timeZone, ...opts });
    displayCache.set(key, f);
  }
  return f;
}

/** Format for messages: "Tue 10 Mar, 14:00" in `timeZone`. */
export function formatShort(ms: number, timeZone: string): string {
  return displayFormatter('short', timeZone).format(new Date(ms));
}

export function formatTime(ms: number, timeZone: string): string {
  return displayFormatter('time', timeZone).format(new Date(ms));
}

/** "YYYY-MM-DD" of the instant in `timeZone`. */
export const dayKey = (ms: number, timeZone: string) => displayFormatter('day', timeZone).format(new Date(ms));

/** "Tue 10 Mar, 14:00 – 16:00" on one day, otherwise both ends in full. */
export function formatRange(iv: Interval, timeZone: string): string {
  if (dayKey(iv.start, timeZone) === dayKey(iv.end - 1, timeZone) && iv.end - iv.start < DAY) {
    return `${formatShort(iv.start, timeZone)} – ${formatTime(iv.end, timeZone)}`;
  }
  return `${formatShort(iv.start, timeZone)} – ${formatShort(iv.end, timeZone)}`;
}
