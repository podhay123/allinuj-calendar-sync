import { auth, calendar, type calendar_v3 } from '@googleapis/calendar';
import { needsUpdate } from './mapEvent.js';

export type UpsertResult = 'created' | 'updated' | 'unchanged' | 'deleted-by-user';

export function createCalendarClient(serviceAccountJson?: string): calendar_v3.Calendar {
  const googleAuth = new auth.GoogleAuth({
    // Bez credentials biblioteka sama użyje pliku z GOOGLE_APPLICATION_CREDENTIALS.
    credentials: serviceAccountJson ? JSON.parse(serviceAccountJson) : undefined,
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  });
  return calendar({ version: 'v3', auth: googleAuth });
}

const httpStatus = (err: unknown): number | undefined => {
  const e = err as { status?: number; code?: number | string; response?: { status?: number } };
  return e.response?.status ?? e.status ?? (typeof e.code === 'number' ? e.code : undefined);
};

export async function upsertEvent(
  cal: calendar_v3.Calendar,
  calendarId: string,
  desired: calendar_v3.Schema$Event,
): Promise<UpsertResult> {
  const eventId = desired.id!;
  let existing: calendar_v3.Schema$Event | null = null;
  try {
    existing = (await cal.events.get({ calendarId, eventId })).data;
  } catch (err) {
    if (httpStatus(err) !== 404) throw err;
  }

  if (!existing) {
    await cal.events.insert({ calendarId, requestBody: desired });
    return 'created';
  }

  // Skrypt nigdy sam nie usuwa wydarzeń, więc status „cancelled” oznacza,
  // że usunąłeś je ręcznie z kalendarza. Nie przywracamy go.
  if (existing.status === 'cancelled') return 'deleted-by-user';

  if (!needsUpdate(existing, desired)) return 'unchanged';

  await cal.events.patch({ calendarId, eventId, requestBody: desired });
  return 'updated';
}
