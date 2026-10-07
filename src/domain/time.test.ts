import { describe, expect, it } from 'vitest';
import { contains, dateToUtc, formatRange, isValidTimed, overlaps, toInterval, tzOffset, zonedToUtc } from './time';

describe('time utilities', () => {
  it('treats ranges as half-open', () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
    expect(overlaps({ start: 0, end: 11 }, { start: 10, end: 20 })).toBe(true);
    expect(overlaps({ start: 2, end: 3 }, { start: 0, end: 20 })).toBe(true);
    expect(contains({ start: 0, end: 10 }, { start: 0, end: 10 })).toBe(true);
    expect(contains({ start: 0, end: 10 }, { start: 5, end: 11 })).toBe(false);
  });

  it('computes time-zone offsets, including DST', () => {
    expect(tzOffset(Date.UTC(2026, 0, 15), 'America/New_York')).toBe(-5 * 3600_000);
    expect(tzOffset(Date.UTC(2026, 6, 15), 'America/New_York')).toBe(-4 * 3600_000);
    expect(tzOffset(Date.UTC(2026, 6, 15), 'Asia/Kolkata')).toBe(5.5 * 3600_000);
  });

  it('converts local wall-clock time to UTC across DST boundaries', () => {
    expect(new Date(zonedToUtc(2026, 3, 8, 0, 0, 'America/New_York')).toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(new Date(zonedToUtc(2026, 3, 9, 0, 0, 'America/New_York')).toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect(new Date(dateToUtc('2026-11-01', 'America/New_York')).toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(new Date(dateToUtc('2026-11-02', 'America/New_York')).toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });

  it('resolves all-day items to local midnights, end exclusive', () => {
    const iv = toInterval({ allDay: true, startAt: '2026-03-10', endAt: '2026-03-11' }, 'Asia/Kolkata');
    expect(new Date(iv.start).toISOString()).toBe('2026-03-09T18:30:00.000Z');
    expect(iv.end - iv.start).toBe(24 * 3600_000);
  });

  it('validates items', () => {
    expect(isValidTimed({ startAt: '2026-03-10T10:00:00Z', endAt: '2026-03-10T11:00:00Z' })).toBe(true);
    expect(isValidTimed({ startAt: '2026-03-10T10:00:00Z', endAt: '2026-03-10T10:00:00Z' })).toBe(false);
    expect(isValidTimed({ startAt: 'tomorrow', endAt: '2026-03-10T10:00:00Z' })).toBe(false);
    expect(isValidTimed({ allDay: true, startAt: '2026-03-10', endAt: '2026-03-10' })).toBe(false);
    expect(isValidTimed({ allDay: true, startAt: '2026-03-10', endAt: '2026-03-12' })).toBe(true);
  });

  it('rejects malformed timestamps loudly', () => {
    expect(() => toInterval({ startAt: 'x', endAt: 'y' }, 'UTC')).toThrow(/Invalid timestamp/);
    expect(() => toInterval({ allDay: true, startAt: '10/03/2026', endAt: '11/03/2026' }, 'UTC')).toThrow(/YYYY-MM-DD/);
  });
});

describe('formatRange', () => {
  it('collapses same-day ranges and keeps multi-day ranges in full', () => {
    const t = (s: string) => Date.parse(s);
    expect(formatRange({ start: t('2026-03-10T14:00:00Z'), end: t('2026-03-10T16:00:00Z') }, 'UTC')).toBe('Tue 10 Mar, 14:00 – 16:00');
    expect(formatRange({ start: t('2026-03-10T22:00:00Z'), end: t('2026-03-11T00:00:00Z') }, 'UTC')).toBe('Tue 10 Mar, 22:00 – 00:00');
    expect(formatRange({ start: t('2026-03-10T14:00:00Z'), end: t('2026-03-12T00:00:00Z') }, 'UTC')).toBe('Tue 10 Mar, 14:00 – Thu 12 Mar, 00:00');
  });
});
