import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AllInEvent } from './normalize.js';

/** Wydarzenie zapamiętane między uruchomieniami (stan trzymany w repo, w data/events.json). */
export interface StoredEvent extends AllInEvent {
  /** Kiedy (unix, s) treść wydarzenia ostatnio się zmieniła; trafia do LAST-MODIFIED w .ics. */
  updatedAt: number;
}

/** Jak długo trzymamy w kalendarzu wydarzenia, które już się odbyły. */
export const RETENTION_DAYS = 180;

const contentKey = (e: AllInEvent) =>
  JSON.stringify([
    e.fbId, e.name, e.description, e.url, e.start, e.end, e.locationText,
    e.mapsUrl, e.isOnline, e.onlineUrl, e.ticketUrl, e.isCanceled,
  ]);

/**
 * Łączy zapamiętane wydarzenia ze świeżo pobranymi.
 * - Pobrane z FB wygrywają; `updatedAt` zmienia się tylko przy faktycznej zmianie treści.
 * - Wydarzenia, których nie ma już na liście FB, zostają: przeszłe dla historii, przyszłe na wypadek
 *   chwilowego błędu albo stronicowania listy. Nic nie znika po cichu.
 * - Wydarzenia zakończone ponad RETENTION_DAYS temu są usuwane, żeby plik nie rósł bez końca.
 */
export function mergeEvents(
  stored: StoredEvent[],
  scraped: AllInEvent[],
  nowSec: number,
  retentionDays = RETENTION_DAYS,
): StoredEvent[] {
  const byId = new Map(stored.map((e) => [e.fbId, e]));
  for (const s of scraped) {
    const prev = byId.get(s.fbId);
    byId.set(s.fbId, prev && contentKey(prev) === contentKey(s) ? prev : { ...s, updatedAt: Math.floor(nowSec) });
  }
  const cutoff = nowSec - retentionDays * 86400;
  return [...byId.values()]
    .filter((e) => (e.end ?? e.start) >= cutoff)
    .sort((a, b) => a.start - b.start || a.fbId.localeCompare(b.fbId));
}

export function loadStore(path: string): StoredEvent[] {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8')) as StoredEvent[];
}

export function saveStore(path: string, events: StoredEvent[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(events, null, 2) + '\n');
}
