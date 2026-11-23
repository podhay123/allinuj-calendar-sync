import { buildDescription, eventEnd, eventSummary, TIME_ZONE } from './mapEvent.js';
import type { StoredEvent } from './store.js';

export const CALENDAR_NAME = 'All in UJ';

/** Escaping wartości TEXT wg RFC 5545 §3.3.11. */
export function escapeText(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Zawijanie linii do 75 bajtów (RFC 5545 §3.1) bez rozcinania znaków UTF-8. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const len = Buffer.byteLength(ch, 'utf8');
    const limit = out.length === 0 ? 75 : 74; // linie kontynuacji zaczynają się od spacji
    if (bytes + len > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += len;
  }
  out.push(current);
  return out.join('\r\n ');
}

/** 1795633200 → 20261125T190000Z */
export function icsDate(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function veventLines(e: StoredEvent): string[] {
  const summary = escapeText(eventSummary(e));
  const lines = [
    'BEGIN:VEVENT',
    `UID:allinujfb${e.fbId}@allinuj-calendar-sync`,
    `DTSTAMP:${icsDate(e.updatedAt)}`,
    `LAST-MODIFIED:${icsDate(e.updatedAt)}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(eventEnd(e))}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${escapeText(buildDescription(e))}`,
  ];
  if (e.locationText) lines.push(`LOCATION:${escapeText(e.locationText)}`);
  lines.push(`URL:${e.url}`);
  // Przypomnienia: Apple/Outlook/Thunderbird je respektują, Google przy subskrypcji zwykle ignoruje.
  for (const trigger of ['-P1D', '-PT2H']) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${summary}`, `TRIGGER:${trigger}`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

/** Deterministyczny plik .ics: zmienia się tylko, gdy zmieniają się wydarzenia. */
export function buildIcs(events: StoredEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//allinuj-calendar-sync//PL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${CALENDAR_NAME}`,
    `X-WR-TIMEZONE:${TIME_ZONE}`,
    `X-WR-CALDESC:${escapeText('Wydarzenia stowarzyszenia All in UJ, pobierane automatycznie z Facebooka.')}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...events.flatMap(veventLines),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
