import { existsSync } from 'node:fs';
import process from 'node:process';

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
  dryRun: boolean;
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
