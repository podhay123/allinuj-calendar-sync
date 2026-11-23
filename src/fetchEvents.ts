import {
  EventType,
  scrapeFbEventFromFbid,
  scrapeFbEventList,
  type ScrapeOptions,
} from 'facebook-event-scraper';
import { normalizeEvent, type AllInEvent } from './normalize.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ponawia zapytanie przy chwilowych problemach z siecią (zdarzają się timeouty połączenia z FB). */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, backoffMs = 5000): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw err;
      await sleep(backoffMs * i);
    }
  }
}

/** Biblioteka nie akceptuje końcowego „/” ani parametrów w URL strony. */
export function normalizePageUrl(url: string): string {
  return url.split(/[?#]/)[0].replace(/\/+$/, '');
}

export interface FetchResult {
  events: AllInEvent[];
  /** Wydarzenia z listy, których szczegółów nie udało się pobrać. */
  failures: { id: string; name: string; error: string }[];
}

export async function fetchUpcomingEvents(opts: {
  pageUrl: string;
  cookies?: string;
  delayMs: number;
  log?: (msg: string) => void;
}): Promise<FetchResult> {
  const log = opts.log ?? (() => {});
  const scrapeOpts: ScrapeOptions = opts.cookies ? { cookies: opts.cookies } : {};

  // Błąd tutaj (np. ekran logowania FB) przerywa cały przebieg.
  const list = await withRetry(() =>
    scrapeFbEventList(normalizePageUrl(opts.pageUrl), EventType.Upcoming, scrapeOpts),
  );
  log(`Na FB jest ${list.length} nadchodzących wydarzeń.`);

  const byId = new Map<string, AllInEvent>();
  const failures: FetchResult['failures'] = [];

  for (const [i, item] of list.entries()) {
    if (item.isPast) continue;
    if (i > 0) await sleep(opts.delayMs);
    try {
      const data = await withRetry(() => scrapeFbEventFromFbid(item.id, scrapeOpts));
      // Wydarzenia wielodniowe mogą pojawić się na liście kilka razy, więc deduplikujemy po ID.
      for (const ev of normalizeEvent(data)) byId.set(ev.fbId, ev);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ id: item.id, name: item.name, error: msg });
    }
  }

  const events = [...byId.values()].sort((a, b) => a.start - b.start);
  return { events, failures };
}
