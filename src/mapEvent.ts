import type { calendar_v3 } from '@googleapis/calendar';
import type { AllInEvent } from './normalize.js';

export const TIME_ZONE = 'Europe/Warsaw';
/** Gdy FB nie podaje godziny zakończenia, zakładamy tyle. */
export const DEFAULT_DURATION_SECONDS = 3 * 60 * 60;
export const SOURCE_TAG = 'allinuj-fb';
const MAX_DESCRIPTION_CHARS = 6000;

/**
 * ID wydarzenia w Google Calendar: dozwolone są tylko znaki base32hex (a–v, 0–9),
 * 5–1024 znaków. Stały prefiks + ID z FB daje idempotentny upsert bez pliku stanu.
 */
export function calendarEventId(fbId: string): string {
  if (!/^\d+$/.test(fbId)) throw new Error(`Nieoczekiwane ID wydarzenia FB: ${fbId}`);
  return `allinujfb${fbId}`;
}

const toIso = (unixSec: number) => new Date(unixSec * 1000).toISOString();

export function buildDescription(e: AllInEvent): string {
  const footer = [
    `Wydarzenie na Facebooku: ${e.url}`,
    e.ticketUrl && `Bilety / zapisy: ${e.ticketUrl}`,
    e.onlineUrl && `Link online: ${e.onlineUrl}`,
    e.mapsUrl && `Mapa: ${e.mapsUrl}`,
  ].filter(Boolean);

  let body = e.description;
  if (body.length > MAX_DESCRIPTION_CHARS) body = body.slice(0, MAX_DESCRIPTION_CHARS) + '…';

  return [body, '—', ...footer, '(dodane automatycznie przez allinuj-calendar-sync)']
    .filter((s) => s !== '')
    .join('\n');
}

/** Koniec wydarzenia (unix, s); gdy FB go nie podaje, start + DEFAULT_DURATION_SECONDS. */
export function eventEnd(e: AllInEvent): number {
  return e.end && e.end > e.start ? e.end : e.start + DEFAULT_DURATION_SECONDS;
}

export function eventSummary(e: AllInEvent): string {
  return (e.isCanceled ? '[ODWOŁANE] ' : '') + e.name;
}

export function toCalendarEvent(e: AllInEvent): calendar_v3.Schema$Event {
  return {
    id: calendarEventId(e.fbId),
    summary: eventSummary(e),
    description: buildDescription(e),
    location: e.locationText ?? undefined,
    start: { dateTime: toIso(e.start), timeZone: TIME_ZONE },
    end: { dateTime: toIso(eventEnd(e)), timeZone: TIME_ZONE },
    source: { title: 'Facebook', url: e.url },
    // Przypomnienia w Google są per użytkownik, więc korzystamy z domyślnych
    // powiadomień ustawionych dla kalendarza „All in UJ” (patrz README).
    reminders: { useDefault: true },
    extendedProperties: { private: { source: SOURCE_TAG, fbEventId: e.fbId } },
  };
}

const sameInstant = (a?: string | null, b?: string | null) =>
  !!a && !!b && Date.parse(a) === Date.parse(b);

/** Czy wydarzenie w kalendarzu różni się od tego, co wynika z FB (pola, które ustawiamy). */
export function needsUpdate(existing: calendar_v3.Schema$Event, desired: calendar_v3.Schema$Event): boolean {
  return (
    (existing.summary ?? '') !== (desired.summary ?? '') ||
    (existing.description ?? '') !== (desired.description ?? '') ||
    (existing.location ?? '') !== (desired.location ?? '') ||
    !sameInstant(existing.start?.dateTime, desired.start?.dateTime) ||
    !sameInstant(existing.end?.dateTime, desired.end?.dateTime)
  );
}
