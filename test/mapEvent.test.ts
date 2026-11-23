import { describe, expect, it } from 'vitest';
import type { EventData } from 'facebook-event-scraper';
import { normalizeEvent } from '../src/normalize.js';
import { calendarEventId, needsUpdate, toCalendarEvent } from '../src/mapEvent.js';
import { normalizePageUrl } from '../src/fetchEvents.js';

// Na podstawie prawdziwej odpowiedzi biblioteki dla wydarzenia All in UJ (FB zwraca null w polach typowanych jako string).
function fbEvent(overrides: Partial<EventData> = {}): EventData {
  return {
    id: '2057585598277236',
    name: 'Bilard Studencki by All In UJ x Forum Fun&Food',
    description: 'Zapisz się na bilard studencki już dziś! 🎱 Zażółć gęślą jaźń.',
    location: {
      id: '1174002821801967',
      name: 'Forum Fun & Food',
      description: null as unknown as string,
      url: null as unknown as string,
      coordinates: { latitude: 50.04503, longitude: 19.93589 },
      countryCode: null,
      type: 'TEXT',
      address: null as unknown as string,
      city: null,
    },
    hosts: [],
    startTimestamp: 1795633200, // 2026-11-25 20:00 CET
    endTimestamp: null,
    formattedDate: 'Wednesday, November 25, 2026 at 8:00 PM CET',
    timezone: 'UTC+01',
    photo: null,
    photos: [],
    video: null,
    url: 'https://www.facebook.com/events/2057585598277236/',
    isOnline: false,
    isCanceled: false,
    categories: [],
    onlineDetails: null,
    ticketUrl: 'https://docs.google.com/forms/d/e/xyz/viewform',
    usersResponded: 19,
    parentEvent: null,
    siblingEvents: [],
    ...overrides,
  };
}

const NOW = 1795600000; // 2026-11-25, przed wydarzeniem

describe('normalizeEvent', () => {
  it('mapuje pojedyncze wydarzenie i radzi sobie z null-ami w lokalizacji', () => {
    const [e] = normalizeEvent(fbEvent(), NOW);
    expect(e.fbId).toBe('2057585598277236');
    expect(e.locationText).toBe('Forum Fun & Food');
    expect(e.mapsUrl).toContain('50.04503,19.93589');
    expect(e.end).toBeNull();
  });

  it('rozbija wydarzenie wielodniowe na osobne wystąpienia i pomija przeszłe', () => {
    const parentEvent = { id: '1000000000' };
    const events = normalizeEvent(
      fbEvent({
        siblingEvents: [
          { id: '1000000001', startTimestamp: NOW - 3 * 86400, endTimestamp: NOW - 3 * 86400 + 3600, parentEvent },
          { id: '1000000002', startTimestamp: NOW + 86400, endTimestamp: null, parentEvent },
          { id: '1000000003', startTimestamp: NOW + 2 * 86400, endTimestamp: null, parentEvent },
        ],
      }),
      NOW,
    );
    expect(events.map((e) => e.fbId)).toEqual(['1000000002', '1000000003']);
    expect(events[0].url).toBe('https://www.facebook.com/events/1000000002/');
  });

  it('oznacza wydarzenia online', () => {
    const [e] = normalizeEvent(
      fbEvent({ isOnline: true, location: null, onlineDetails: { url: 'https://meet.example/x', type: 'THIRD_PARTY' } }),
      NOW,
    );
    expect(e.locationText).toBe('Online');
    expect(e.onlineUrl).toBe('https://meet.example/x');
  });
});

describe('toCalendarEvent', () => {
  it('tworzy poprawne ID (base32hex) i domyślnie 3 h trwania', () => {
    const [e] = normalizeEvent(fbEvent(), NOW);
    const ev = toCalendarEvent(e);
    expect(ev.id).toBe('allinujfb2057585598277236');
    expect(ev.id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(ev.start).toEqual({ dateTime: '2026-11-25T19:00:00.000Z', timeZone: 'Europe/Warsaw' });
    expect(ev.end?.dateTime).toBe('2026-11-25T22:00:00.000Z');
    expect(ev.reminders).toEqual({ useDefault: true });
  });

  it('zachowuje polskie znaki i dokleja linki w opisie', () => {
    const [e] = normalizeEvent(fbEvent(), NOW);
    const ev = toCalendarEvent(e);
    expect(ev.summary).toBe('Bilard Studencki by All In UJ x Forum Fun&Food');
    expect(ev.description).toContain('Zażółć gęślą jaźń');
    expect(ev.description).toContain('Wydarzenie na Facebooku: https://www.facebook.com/events/2057585598277236/');
    expect(ev.description).toContain('Bilety / zapisy: https://docs.google.com/forms/d/e/xyz/viewform');
  });

  it('oznacza odwołane wydarzenia w tytule', () => {
    const [e] = normalizeEvent(fbEvent({ isCanceled: true }), NOW);
    expect(toCalendarEvent(e).summary).toMatch(/^\[ODWOŁANE\] /);
  });

  it('odrzuca nienumeryczne ID', () => {
    expect(() => calendarEventId('abc')).toThrow();
  });
});

describe('needsUpdate', () => {
  const [e] = normalizeEvent(fbEvent(), NOW);
  const desired = toCalendarEvent(e);

  it('nie aktualizuje, gdy Google zwraca ten sam czas w innym formacie', () => {
    const existing = {
      ...desired,
      start: { dateTime: '2026-11-25T20:00:00+01:00', timeZone: 'Europe/Warsaw' },
      end: { dateTime: '2026-11-25T23:00:00+01:00', timeZone: 'Europe/Warsaw' },
    };
    expect(needsUpdate(existing, desired)).toBe(false);
  });

  it('aktualizuje, gdy zmieniła się godzina', () => {
    const existing = { ...desired, start: { dateTime: '2026-11-25T19:00:00+01:00' } };
    expect(needsUpdate(existing, desired)).toBe(true);
  });
});

describe('normalizePageUrl', () => {
  it('usuwa końcowy ukośnik i parametry', () => {
    expect(normalizePageUrl('https://www.facebook.com/allinuj/?ref=x')).toBe('https://www.facebook.com/allinuj');
  });
});
