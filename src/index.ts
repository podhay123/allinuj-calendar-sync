import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { createCalendarClient, upsertEvent, type UpsertResult } from './calendar.js';
import { fetchUpcomingEvents } from './fetchEvents.js';
import { buildIcs } from './ics.js';
import { toCalendarEvent, TIME_ZONE } from './mapEvent.js';
import type { AllInEvent } from './normalize.js';
import { buildPage } from './page.js';
import { loadStore, mergeEvents, saveStore } from './store.js';

const ICS_FILE = 'allinuj.ics';

const fmt = new Intl.DateTimeFormat('pl-PL', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const describe = (ev: AllInEvent) =>
  `${fmt.format(new Date(ev.start * 1000))} | ${ev.isCanceled ? '[ODWOŁANE] ' : ''}${ev.name}` +
  (ev.locationText ? ` @ ${ev.locationText}` : '');

const LABELS: Record<UpsertResult, string> = {
  created: 'DODANO',
  updated: 'ZAKTUALIZOWANO',
  unchanged: 'bez zmian',
  'deleted-by-user': 'pominięto (usunięte ręcznie)',
};

/** Opcjonalna synchronizacja przez Google Calendar API (gdy ustawiono GOOGLE_CALENDAR_ID). */
async function syncGoogleApi(events: AllInEvent[], calendarId: string, serviceAccountJson?: string): Promise<number> {
  const cal = createCalendarClient(serviceAccountJson);
  let errors = 0;
  for (const ev of events) {
    try {
      const result = await upsertEvent(cal, calendarId, toCalendarEvent(ev));
      console.log(`  API: ${LABELS[result].padEnd(14)} ${describe(ev)}`);
    } catch (err) {
      errors++;
      console.error(`  API BŁĄD: ${describe(ev)}\n    ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return errors;
}

async function main(): Promise<number> {
  const config = loadConfig();
  const now = Date.now() / 1000;

  console.log(`Pobieram wydarzenia z ${config.fbPageUrl}${config.fbCookies ? ' (z cookies)' : ''}…`);
  const { events: scraped, failures } = await fetchUpcomingEvents({
    pageUrl: config.fbPageUrl,
    cookies: config.fbCookies,
    delayMs: config.requestDelayMs,
    log: console.log,
  });
  for (const ev of scraped) console.log(`  ${describe(ev)}`);
  for (const f of failures) console.error(`  BŁĄD pobierania szczegółów: ${f.name} (${f.id}): ${f.error}`);

  const stored = loadStore(config.storePath);
  const merged = mergeEvents(stored, scraped, now);
  const storedIds = new Set(stored.map((e) => e.fbId));
  const added = scraped.filter((e) => !storedIds.has(e.fbId)).length;

  if (config.dryRun) {
    console.log(`Dry-run: ${scraped.length} wydarzeń z FB (${added} nowych), w kalendarzu byłoby ${merged.length}. Nic nie zapisano.`);
    return failures.length > 0 ? 1 : 0;
  }

  saveStore(config.storePath, merged);
  mkdirSync(config.outDir, { recursive: true });
  writeFileSync(join(config.outDir, ICS_FILE), buildIcs(merged));
  writeFileSync(join(config.outDir, 'index.html'), buildPage(merged, ICS_FILE, now));
  console.log(
    `Zapisano ${join(config.outDir, ICS_FILE)}: ${merged.length} wydarzeń (${added} nowych). Stan: ${config.storePath}.`,
  );

  const apiErrors = config.calendarId
    ? await syncGoogleApi(scraped, config.calendarId, config.serviceAccountJson)
    : 0;

  // Niezerowy kod wyjścia = GitHub wyśle maila o nieudanym przebiegu.
  return failures.length + apiErrors > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('Synchronizacja nie powiodła się:', err instanceof Error ? err.message : err);
    if (err instanceof Error && err.cause) console.error('Przyczyna:', (err.cause as Error).message ?? err.cause);
    process.exit(1);
  },
);
