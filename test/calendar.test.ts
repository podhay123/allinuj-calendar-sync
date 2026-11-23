import { describe, expect, it, vi } from 'vitest';
import type { calendar_v3 } from '@googleapis/calendar';
import { upsertEvent } from '../src/calendar.js';

const desired: calendar_v3.Schema$Event = {
  id: 'allinujfb123456789',
  summary: 'Bilard',
  description: 'opis',
  location: 'Forum',
  start: { dateTime: '2026-11-25T19:00:00.000Z', timeZone: 'Europe/Warsaw' },
  end: { dateTime: '2026-11-25T22:00:00.000Z', timeZone: 'Europe/Warsaw' },
};

function fakeCalendar(getImpl: () => Promise<{ data: calendar_v3.Schema$Event }>) {
  const events = { get: vi.fn(getImpl), insert: vi.fn(async () => ({})), patch: vi.fn(async () => ({})) };
  return { cal: { events } as unknown as calendar_v3.Calendar, events };
}

const notFound = () => Promise.reject(Object.assign(new Error('Not Found'), { status: 404 }));

describe('upsertEvent', () => {
  it('wstawia nowe wydarzenie przy 404', async () => {
    const { cal, events } = fakeCalendar(notFound);
    expect(await upsertEvent(cal, 'cal', desired)).toBe('created');
    expect(events.insert).toHaveBeenCalledWith({ calendarId: 'cal', requestBody: desired });
  });

  it('nic nie robi, gdy wydarzenie się nie zmieniło', async () => {
    const { cal, events } = fakeCalendar(async () => ({
      data: { ...desired, status: 'confirmed', start: { dateTime: '2026-11-25T20:00:00+01:00' }, end: { dateTime: '2026-11-25T23:00:00+01:00' } },
    }));
    expect(await upsertEvent(cal, 'cal', desired)).toBe('unchanged');
    expect(events.patch).not.toHaveBeenCalled();
  });

  it('aktualizuje zmienione wydarzenie', async () => {
    const { cal, events } = fakeCalendar(async () => ({ data: { ...desired, status: 'confirmed', location: 'Stare miejsce' } }));
    expect(await upsertEvent(cal, 'cal', desired)).toBe('updated');
    expect(events.patch).toHaveBeenCalledOnce();
  });

  it('nie przywraca wydarzenia usuniętego ręcznie', async () => {
    const { cal, events } = fakeCalendar(async () => ({ data: { ...desired, status: 'cancelled' } }));
    expect(await upsertEvent(cal, 'cal', desired)).toBe('deleted-by-user');
    expect(events.insert).not.toHaveBeenCalled();
    expect(events.patch).not.toHaveBeenCalled();
  });

  it('przepuszcza inne błędy API', async () => {
    const { cal } = fakeCalendar(() => Promise.reject(Object.assign(new Error('Forbidden'), { status: 403 })));
    await expect(upsertEvent(cal, 'cal', desired)).rejects.toThrow('Forbidden');
  });
});
