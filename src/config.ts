import { existsSync } from 'node:fs';
import process from 'node:process';
import type { NotifyConfig } from './notify.js';

export interface Config {
  /** Strona FB, z której bierzemy wydarzenia, np. https://www.facebook.com/allinuj */
  fbPageUrl: string;
  /** Opcjonalne cookies FB ("c_user=...; xs=..."), gdyby FB zaczął wymagać logowania. */
  fbCookies: string | undefined;
  /** Pauza między zapytaniami do FB (ms). */
  requestDelayMs: number;
  /** Plik ze stanem (zapamiętane wydarzenia), commitowany do repo. */
  storePath: string;
  /** Katalog publikowany jako GitHub Pages (allinuj.ics + index.html). */
  outDir: string;
  /** Opcjonalnie: ID kalendarza Google, do którego wydarzenia trafiają też przez API. */
  calendarId: string | undefined;
  /** Zawartość JSON klucza konta serwisowego (alternatywnie GOOGLE_APPLICATION_CREDENTIALS). */
  serviceAccountJson: string | undefined;
  /** Powiadomienia e-mail o nowych wydarzeniach; undefined = wyłączone (brak SMTP_USER/SMTP_PASS). */
  notify: NotifyConfig | undefined;
  /** Wyślij mail testowy (sprawdzenie konfiguracji SMTP). */
  notifyTest: boolean;
  dryRun: boolean;
}

function loadNotifyConfig(env: NodeJS.ProcessEnv): NotifyConfig | undefined {
  const user = env.SMTP_USER?.trim();
  // Hasła aplikacji Google wyświetlają się ze spacjami („abcd efgh …”); SMTP ich nie chce.
  const pass = env.SMTP_PASS?.replace(/\s+/g, '');
  if (!user || !pass) return undefined;
  return {
    host: env.SMTP_HOST?.trim() || 'smtp.gmail.com',
    port: Number(env.SMTP_PORT?.trim() || 465),
    user,
    pass,
    to: env.NOTIFY_TO?.trim() || user,
    pageUrl: env.PAGE_URL?.trim() || undefined,
  };
}

export function loadConfig(argv: string[] = process.argv.slice(2)): Config {
  if (existsSync('.env')) process.loadEnvFile('.env');

  const env = process.env;
  const dryRun = argv.includes('--dry-run') || env.DRY_RUN === '1' || env.DRY_RUN === 'true';

  const config: Config = {
    fbPageUrl: env.FB_PAGE_URL?.trim() || 'https://www.facebook.com/allinuj',
    fbCookies: env.FB_COOKIES?.trim() || undefined,
    requestDelayMs: Number(env.REQUEST_DELAY_MS ?? 2000),
    storePath: env.STORE_PATH?.trim() || 'data/events.json',
    outDir: env.OUT_DIR?.trim() || 'public',
    calendarId: env.GOOGLE_CALENDAR_ID?.trim() || undefined,
    serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() || undefined,
    notify: loadNotifyConfig(env),
    notifyTest: env.NOTIFY_TEST === 'true' || env.NOTIFY_TEST === '1',
    dryRun,
  };

  if (config.calendarId && !config.serviceAccountJson && !env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'Ustawiono GOOGLE_CALENDAR_ID, ale brak danych konta serwisowego: ustaw GOOGLE_SERVICE_ACCOUNT_JSON ' +
        '(zawartość pliku) albo GOOGLE_APPLICATION_CREDENTIALS (ścieżka do pliku).',
    );
  }
  return config;
}
