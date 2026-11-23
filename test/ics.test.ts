import { describe, expect, it } from 'vitest';
import { buildIcs, escapeText, foldLine, icsDate } from '../src/ics.js';
import { mergeEvents, type StoredEvent } from '../src/store.js';
import type { AllInEvent } from '../src/normalize.js';

const NOW = 1795600000; // 2026-11-25

function ev(overrides: Partial<AllInEvent> = {}): AllInEvent {
  return {
    fbId: '2057585598277236',
    name: 'Bilard Studencki by All In UJ x Forum Fun&Food',
    description: 'Zapisz się; płatne 10 zł, na miejscu.\nDruga linia',
    url: 'https://www.facebook.com/events/2057585598277236/',
    start: 1795633200, // 2026-11-25 20:00 CET
    end: null,
    locationText: 'Forum Fun & Food, Kraków',
    mapsUrl: null,
    isOnline: false,
    onlineUrl: null,
    ticketUrl: null,
    isCanceled: false,
    ...overrides,
  };
}

const stored = (overrides: Partial<AllInEvent> = {}, updatedAt = NOW - 1000): StoredEvent => ({
  ...ev(overrides),
  updatedAt,
});

describe('ICS: formatowanie', () => {
  it('escapuje znaki specjalne TEXT', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('zawija długie linie do 75 bajtów, nie rozcinając polskich znaków', () => {
    const line = 'DESCRIPTION:' + 'Zażółć gęślą jaźń '.repeat(10);
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(Buffer.byteLength(p, 'utf8')).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    // Rozwinięcie (usunięcie CRLF+spacja) daje oryginał.
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });

  it('formatuje datę w UTC', () => {
    expect(icsDate(1795633200)).toBe('20261125T190000Z');
  });
});

describe('buildIcs', () => {
  const ics = buildIcs([stored()]);

  it('ma poprawną strukturę i CRLF', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(ics).toContain('X-WR-CALNAME:All in UJ');
  });

  it('zawiera wydarzenie ze stałym UID, czasem i domyślną długością 3 h', () => {
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('UID:allinujfb2057585598277236@allinuj-calendar-sync');
    expect(unfolded).toContain('DTSTART:20261125T190000Z');
    expect(unfolded).toContain('DTEND:20261125T220000Z');
    expect(unfolded).toContain('SUMMARY:Bilard Studencki by All In UJ x Forum Fun&Food');
    expect(unfolded).toContain('LOCATION:Forum Fun & Food\\, Kraków');
    expect(unfolded).toContain('DESCRIPTION:Zapisz się\\; płatne 10 zł\\, na miejscu.\\nDruga linia');
    expect(unfolded).toContain('URL:https://www.facebook.com/events/2057585598277236/');
    expect(unfolded.match(/BEGIN:VALARM/g)).toHaveLength(2);
  });

  it('jest deterministyczny (ten sam stan → identyczny plik)', () => {
    expect(buildIcs([stored()])).toBe(ics);
  });

  it('oznacza odwołane wydarzenia', () => {
    expect(buildIcs([stored({ isCanceled: true })])).toContain('SUMMARY:[ODWOŁANE] Bilard');
  });
});

describe('mergeEvents', () => {
  it('dodaje nowe wydarzenia ze znacznikiem czasu', () => {
    const merged = mergeEvents([], [ev()], NOW);
    expect(merged).toHaveLength(1);
    expect(merged[0].updatedAt).toBe(NOW);
  });

  it('nie zmienia updatedAt, gdy treść jest taka sama', () => {
    const merged = mergeEvents([stored({}, 123)], [ev()], NOW);
    expect(merged[0].updatedAt).toBe(123);
  });

  it('aktualizuje treść i updatedAt przy zmianie na FB', () => {
    const merged = mergeEvents([stored({}, 123)], [ev({ start: 1795636800 })], NOW);
    expect(merged[0].start).toBe(1795636800);
    expect(merged[0].updatedAt).toBe(NOW);
  });

  it('zachowuje wydarzenia, których nie ma już na liście FB', () => {
    const past = stored({ fbId: '1111111111', start: NOW - 5 * 86400, end: NOW - 5 * 86400 + 3600 });
    const future = stored({ fbId: '2222222222', start: NOW + 10 * 86400 });
    const merged = mergeEvents([past, future], [ev()], NOW);
    expect(merged.map((e) => e.fbId)).toEqual(['1111111111', '2057585598277236', '2222222222']);
  });

  it('usuwa wydarzenia starsze niż okres retencji', () => {
    const old = stored({ fbId: '3333333333', start: NOW - 400 * 86400, end: null });
    expect(mergeEvents([old], [], NOW)).toEqual([]);
  });
});
