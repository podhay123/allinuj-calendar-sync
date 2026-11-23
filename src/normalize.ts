import type { EventData } from 'facebook-event-scraper';

/** Jedno wystąpienie wydarzenia (wydarzenia wielodniowe z FB rozbijamy na kilka). */
export interface AllInEvent {
  /** ID tego konkretnego wystąpienia na FB (dla wielodniowych: ID „siostrzanej” daty). */
  fbId: string;
  name: string;
  description: string;
  url: string;
  /** Unix, sekundy. */
  start: number;
  /** Unix, sekundy; null gdy FB nie podaje końca. */
  end: number | null;
  locationText: string | null;
  mapsUrl: string | null;
  isOnline: boolean;
  onlineUrl: string | null;
  ticketUrl: string | null;
  isCanceled: boolean;
}

/** Wystąpienia, które skończyły się dawniej niż tyle sekund temu, pomijamy. */
const PAST_GRACE_SECONDS = 24 * 60 * 60;

// Biblioteka typuje część pól jako string, ale w praktyce FB zwraca tam null.
const clean = (s: string | null | undefined): string | null => {
  const t = s?.trim();
  return t ? t : null;
};

export function locationText(data: EventData): string | null {
  if (data.isOnline) return 'Online';
  const loc = data.location;
  if (!loc) return null;
  const parts = [clean(loc.name), clean(loc.address), clean(loc.city?.name)].filter(
    (p): p is string => p !== null,
  );
  // Usuń powtórzenia, np. gdy adres już zawiera nazwę miasta.
  const unique = parts.filter((p, i) => !parts.slice(0, i).some((q) => q.includes(p)));
  return unique.length ? unique.join(', ') : null;
}

export function normalizeEvent(data: EventData, nowSec: number = Date.now() / 1000): AllInEvent[] {
  const base = {
    name: data.name.trim(),
    description: clean(data.description) ?? '',
    locationText: locationText(data),
    mapsUrl: data.location?.coordinates
      ? `https://www.google.com/maps/search/?api=1&query=${data.location.coordinates.latitude},${data.location.coordinates.longitude}`
      : null,
    isOnline: data.isOnline,
    onlineUrl: data.onlineDetails?.url ?? null,
    ticketUrl: clean(data.ticketUrl),
    isCanceled: data.isCanceled,
  };

  const occurrences =
    data.siblingEvents.length > 0
      ? data.siblingEvents.map((s) => ({
          fbId: s.id,
          url: `https://www.facebook.com/events/${s.id}/`,
          start: s.startTimestamp,
          end: s.endTimestamp,
        }))
      : [{ fbId: data.id, url: data.url, start: data.startTimestamp, end: data.endTimestamp }];

  return occurrences
    .filter((o) => (o.end ?? o.start) >= nowSec - PAST_GRACE_SECONDS)
    .map((o) => ({ ...base, ...o }));
}
