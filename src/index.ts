import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { createCalendarClient, upsertEvent, type UpsertResult } from './calendar.js';
import { fetchUpcomingEvents } from './fetchEvents.js';
import { buildIcs } from './ics.js';
import { toCalendarEvent, TIME_ZONE } from './mapEvent.js';
import type { AllInEvent } from './normalize.js';
import { createTransport, sendNotifications, sendTestEmail, type NotifyConfig } from './notify.js';
import { buildPage } from './page.js';
import { loadStore, mergeEvents, saveStore, type StoredEvent } from './store.js';

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

/** Wysyła maile o nowych wydarzeniach i oznacza je w stanie jako powiadomione. Zwraca liczbę błędów. */
async function notifyNewEvents(events: StoredEvent[], cfg: NotifyConfig | undefined, nowSec: number): Promise<number> {
  const pending = events.filter((e) => e.notified === false);
  // Bez maila: wydarzenia, które już się zaczęły, i wszystko, gdy powiadomienia są wyłączone
  // (żeby po ich włączeniu nie przyszła lawina zaległych maili).
  const toSend = cfg ? pending.filter((e) => e.start > nowSec) : [];
  for (const e of pending) if (!toSend.includes(e)) e.notified = true;
  if (!cfg) {
    if (pending.length) console.log('Powiadomienia e-mail wyłączone (brak SMTP_USER / SMTP_PASS).');
    return 0;
  }
  if (toSend.length === 0) return 0;

  const { notifiedIds, errors } = await sendNotifications(createTransport(cfg), cfg, toSend, console.log);
  const ok = new Set(notifiedIds);
  for (const e of toSend) if (ok.has(e.fbId)) e.notified = true;
  // Nieudane zostają z notified=false, więc następny przebieg spróbuje ponownie.
  for (const err of errors) console.error(`  BŁĄD wysyłki powiadomienia: ${err}`);
  return errors.length;
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
    for (const e of merged.filter((e) => e.notified === false && e.start > now)) {
      console.log(`  [dry-run] powiadomienie e-mail: ${describe(e)}`);
    }
    console.log(`Dry-run: ${scraped.length} wydarzeń z FB (${added} nowych), w kalendarzu byłoby ${merged.length}. Nic nie zapisano.`);
    return failures.length > 0 ? 1 : 0;
  }

  mkdirSync(config.outDir, { recursive: true });
  writeFileSync(join(config.outDir, ICS_FILE), buildIcs(merged));
  writeFileSync(join(config.outDir, 'index.html'), buildPage(merged, ICS_FILE, now));
  console.log(
    `Zapisano ${join(config.outDir, ICS_FILE)}: ${merged.length} wydarzeń (${added} nowych).`,
  );

  let notifyErrors = await notifyNewEvents(merged, config.notify, now);
  saveStore(config.storePath, merged);

  if (config.notifyTest && !config.notify) {
    notifyErrors++;
    console.error('BŁĄD maila testowego: brak konfiguracji SMTP (ustaw sekrety SMTP_USER i SMTP_PASS).');
  } else if (config.notifyTest && config.notify) {
    try {
      await sendTestEmail(createTransport(config.notify), config.notify, merged.find((e) => e.start > now));
      console.log('Wysłano mail testowy.');
    } catch (err) {
      notifyErrors++;
      console.error(`BŁĄD maila testowego: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const apiErrors = config.calendarId
    ? await syncGoogleApi(scraped, config.calendarId, config.serviceAccountJson)
    : 0;

  // Niezerowy kod wyjścia = GitHub wyśle maila o nieudanym przebiegu.
  return failures.length + notifyErrors + apiErrors > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('Synchronizacja nie powiodła się:', err instanceof Error ? err.message : err);
    if (err instanceof Error && err.cause) console.error('Przyczyna:', (err.cause as Error).message ?? err.cause);
    process.exit(1);
  },
);
