import type { Dataset, Release, Window } from '../domain/types';
import { CHANGE_CLASS, WINDOW_LABEL } from '../views/model';

/**
 * iCalendar (RFC 5545) feed of releases and guardrail windows.
 * - Timed items are written in UTC (…Z), so every client shows the right local time.
 * - All-day items use VALUE=DATE with an exclusive end date.
 * - Text is escaped, lines end in CRLF and are folded at 75 octets (UTF-8 safe).
 */
export interface IcsOptions {
  /** Restrict to one team; null = whole portfolio. */
  teamId: string | null;
  /** DTSTAMP; injectable for deterministic tests. */
  now?: Date;
  calendarName?: string;
}

const enc = new TextEncoder();

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold a content line at 75 octets without splitting a UTF-8 character. */
export function foldLine(line: string): string {
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74; // continuation lines start with one space
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const utcStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateValue = (d: string) => d.slice(0, 10).replace(/-/g, '');

function timeProps(item: { startAt: string; endAt: string; allDay?: boolean }): string[] {
  if (item.allDay) return [`DTSTART;VALUE=DATE:${dateValue(item.startAt)}`, `DTEND;VALUE=DATE:${dateValue(item.endAt)}`];
  return [`DTSTART:${utcStamp(Date.parse(item.startAt))}`, `DTEND:${utcStamp(Date.parse(item.endAt))}`];
}

function releaseEvent(ds: Dataset, r: Release, stamp: string): string[] {
  const product = ds.products.find((p) => p.id === r.productId);
  const team = ds.teams.find((t) => t.id === product?.teamId);
  const env = ds.environments.find((e) => e.id === r.environmentId);
  const cr = ds.changeRequests.find((c) => c.releaseId === r.id);
  const description = [
    `Team: ${team?.name ?? '-'}`,
    `Product: ${product?.name ?? '-'}`,
    `Environment: ${env?.name ?? '-'}`,
    `Change class: ${CHANGE_CLASS[r.changeClass].label}`,
    `Status: ${r.status}`,
    cr?.description ? `Description: ${cr.description}` : '',
    cr?.rollbackPlan ? `Rollback: ${cr.rollbackPlan}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return [
    'BEGIN:VEVENT',
    `UID:${r.id}@release-control-tower`,
    `DTSTAMP:${stamp}`,
    ...timeProps(r),
    `SUMMARY:${escapeText(r.title)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `CATEGORIES:${escapeText(`${CHANGE_CLASS[r.changeClass].label} change`)}`,
    `STATUS:${r.status === 'cancelled' ? 'CANCELLED' : r.status === 'planned' ? 'TENTATIVE' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
  ];
}

function windowEvent(w: Window, stamp: string): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:${w.id}@release-control-tower`,
    `DTSTAMP:${stamp}`,
    ...timeProps(w),
    `SUMMARY:${escapeText(`${WINDOW_LABEL[w.kind]}: ${w.name}`)}`,
    `CATEGORIES:${escapeText(WINDOW_LABEL[w.kind])}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}

export function buildIcs(ds: Dataset, opts: IcsOptions): string {
  const stamp = utcStamp((opts.now ?? new Date()).getTime());
  const team = opts.teamId ? ds.teams.find((t) => t.id === opts.teamId) : null;
  const productIds = new Set(ds.products.filter((p) => !opts.teamId || p.teamId === opts.teamId).map((p) => p.id));
  const releases = ds.releases.filter((r) => productIds.has(r.productId));
  const windows = ds.windows.filter((w) => !opts.teamId || !w.scope.teamIds?.length || w.scope.teamIds.includes(opts.teamId));
  const name = opts.calendarName ?? (team ? `Releases: ${team.name}` : 'Releases: all teams');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Release Control Tower//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    ...releases.flatMap((r) => releaseEvent(ds, r, stamp)),
    ...windows.flatMap((w) => windowEvent(w, stamp)),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export function icsFileName(ds: Dataset, teamId: string | null): string {
  const team = teamId ? ds.teams.find((t) => t.id === teamId)?.name : 'all-teams';
  return `releases-${(team ?? 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
}
