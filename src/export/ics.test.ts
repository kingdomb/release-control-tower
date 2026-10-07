import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';
import { generateSeed } from '../data/seed/generate';
import { buildIcs, escapeText, foldLine } from './ics';

const ds = generateSeed({ anchor: new Date('2026-10-07T12:00:00Z') });
const NOW = new Date('2026-10-07T12:00:00Z');

describe('ics export', () => {
  const ics = buildIcs(ds, { teamId: null, now: NOW });

  it('uses CRLF line endings and folds every line at 75 octets', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.split('\r\n').some((l) => l.includes('\n'))).toBe(false);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it('never splits a multi-byte character when folding', () => {
    const long = `SUMMARY:${'→'.repeat(60)}`;
    const folded = foldLine(long);
    const unfolded = folded.replace(/\r\n /g, '');
    expect(unfolded).toBe(long);
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
  });

  it('escapes text values', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('parses with a standards-based parser and round-trips every release with exact UTC times', () => {
    const cal = new ICAL.Component(ICAL.parse(ics));
    expect(cal.getFirstPropertyValue('version')).toBe('2.0');
    const events = cal.getAllSubcomponents('vevent').map((v) => new ICAL.Event(v));
    expect(events).toHaveLength(ds.releases.length + ds.windows.length);
    for (const r of ds.releases) {
      const e = events.find((x) => x.uid === `${r.id}@release-control-tower`)!;
      expect(e.summary).toBe(r.title);
      expect(e.startDate.toJSDate().toISOString()).toBe(r.startAt);
      expect(e.endDate.toJSDate().toISOString()).toBe(r.endAt);
      expect(e.startDate.zone.tzid).toBe('UTC');
    }
  });

  it('writes all-day items as VALUE=DATE with an exclusive end', () => {
    const allDay = { ...ds, releases: [{ ...ds.releases[0]!, allDay: true, startAt: '2026-03-10', endAt: '2026-03-12' }] };
    const out = buildIcs(allDay, { teamId: null, now: NOW });
    expect(out).toContain('DTSTART;VALUE=DATE:20260310\r\n');
    expect(out).toContain('DTEND;VALUE=DATE:20260312\r\n');
    const e = new ICAL.Event(new ICAL.Component(ICAL.parse(out)).getFirstSubcomponent('vevent')!);
    expect(e.startDate.isDate).toBe(true);
  });

  it('filters to one team, keeping windows that apply to it', () => {
    const out = buildIcs(ds, { teamId: 'team-mobile', now: NOW });
    const events = new ICAL.Component(ICAL.parse(out)).getAllSubcomponents('vevent').map((v) => new ICAL.Event(v));
    const mobileProducts = ds.products.filter((p) => p.teamId === 'team-mobile').map((p) => p.id);
    const expected = ds.releases.filter((r) => mobileProducts.includes(r.productId));
    expect(events.filter((e) => e.uid.startsWith('rel-'))).toHaveLength(expected.length);
    expect(events.some((e) => e.uid.startsWith('win-freeze-mobile'))).toBe(true);
    expect(out).toContain('X-WR-CALNAME:Releases: Mobile Apps');
  });

  it('is deterministic for a fixed timestamp', () => {
    expect(buildIcs(ds, { teamId: null, now: NOW })).toBe(ics);
  });
});
