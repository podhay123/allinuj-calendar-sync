import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { eventSummary, TIME_ZONE } from './mapEvent.js';
import type { AllInEvent } from './normalize.js';

export interface NotifyConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** Adresat powiadomień (domyślnie ten sam adres, z którego wysyłamy). */
  to: string;
  /** Strona z kalendarzem, linkowana w mailu. */
  pageUrl: string | undefined;
}

export interface Email {
  subject: string;
  text: string;
  html: string;
}

/** Powyżej tylu nowych wydarzeń naraz wysyłamy jeden zbiorczy mail zamiast serii. */
export const DIGEST_THRESHOLD = 5;
const DESCRIPTION_PREVIEW_CHARS = 600;

const fmt = new Intl.DateTimeFormat('pl-PL', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});
const fmtShort = new Intl.DateTimeFormat('pl-PL', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const when = (e: AllInEvent) => fmt.format(new Date(e.start * 1000));

function preview(description: string): string {
  return description.length > DESCRIPTION_PREVIEW_CHARS
    ? description.slice(0, DESCRIPTION_PREVIEW_CHARS).trimEnd() + '…'
    : description;
}

interface Detail {
  label: string;
  /** Wersja tekstowa (mail bez HTML). */
  value: string;
  /** Wersja HTML: link z czytelnym opisem. */
  href?: string;
  linkText?: string;
}

function eventDetails(e: AllInEvent): Detail[] {
  const details: Detail[] = [{ label: 'Kiedy', value: when(e) }];
  if (e.locationText) {
    details.push({ label: 'Gdzie', value: e.locationText, href: e.mapsUrl ?? undefined, linkText: e.locationText });
  }
  if (e.ticketUrl) details.push({ label: 'Bilety / zapisy', value: e.ticketUrl, href: e.ticketUrl, linkText: 'otwórz formularz' });
  details.push({ label: 'Facebook', value: e.url, href: e.url, linkText: 'wydarzenie na Facebooku' });
  return details;
}

function htmlLayout(title: string, body: string, pageUrl: string | undefined): string {
  const footer = pageUrl
    ? `<p style="color:#6b7280;font-size:13px">Wydarzenie jest już w kalendarzu: <a href="${esc(pageUrl)}">${esc(pageUrl)}</a></p>`
    : '';
  return `<!DOCTYPE html><html lang="pl"><body style="font-family:system-ui,sans-serif;line-height:1.5;max-width:600px">
<h2 style="margin-bottom:4px">${esc(title)}</h2>
${body}
${footer}
</body></html>`;
}

export function buildEventEmail(e: AllInEvent, pageUrl?: string): Email {
  const details = eventDetails(e);
  const desc = preview(e.description);
  const text = [
    eventSummary(e),
    '',
    ...details.map((d) => `${d.label}: ${d.value}`),
    ...(desc ? ['', desc] : []),
    ...(pageUrl ? ['', `Wydarzenie jest już w kalendarzu: ${pageUrl}`] : []),
  ].join('\n');

  const rows = details
    .map(
      (d) =>
        `<tr><td style="color:#6b7280;padding:2px 12px 2px 0;vertical-align:top">${esc(d.label)}</td>` +
        `<td>${d.href ? `<a href="${esc(d.href)}">${esc(d.linkText ?? d.value)}</a>` : esc(d.value)}</td></tr>`,
    )
    .join('');
  const body =
    `<table style="border-collapse:collapse;margin:12px 0">${rows}</table>` +
    (desc ? `<p style="white-space:pre-line">${esc(desc)}</p>` : '');

  return {
    subject: `Nowe wydarzenie All in UJ: ${eventSummary(e)} (${fmtShort.format(new Date(e.start * 1000))})`,
    text,
    html: htmlLayout(eventSummary(e), body, pageUrl),
  };
}

export function buildDigestEmail(events: AllInEvent[], pageUrl?: string): Email {
  const text = [
    `Nowe wydarzenia All in UJ (${events.length}):`,
    '',
    ...events.map((e) => `• ${fmtShort.format(new Date(e.start * 1000))}: ${eventSummary(e)}${e.locationText ? ` (${e.locationText})` : ''}\n  ${e.url}`),
    ...(pageUrl ? ['', `Wszystkie są już w kalendarzu: ${pageUrl}`] : []),
  ].join('\n');

  const items = events
    .map(
      (e) =>
        `<li style="margin-bottom:8px"><span style="color:#6b7280">${esc(fmtShort.format(new Date(e.start * 1000)))}</span><br>` +
        `<a href="${esc(e.url)}">${esc(eventSummary(e))}</a>${e.locationText ? `<br><span style="color:#6b7280">${esc(e.locationText)}</span>` : ''}</li>`,
    )
    .join('');

  return {
    subject: `${events.length} nowych wydarzeń All in UJ`,
    text,
    html: htmlLayout(`Nowe wydarzenia All in UJ (${events.length})`, `<ul style="padding-left:18px">${items}</ul>`, pageUrl),
  };
}

export function createTransport(cfg: NotifyConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

/**
 * Wysyła powiadomienia o nowych wydarzeniach: po jednym mailu na wydarzenie albo jeden zbiorczy,
 * gdy jest ich więcej niż DIGEST_THRESHOLD. Zwraca ID wydarzeń, o których udało się powiadomić.
 */
export async function sendNotifications(
  transport: Transporter,
  cfg: Pick<NotifyConfig, 'user' | 'to' | 'pageUrl'>,
  events: AllInEvent[],
  log: (msg: string) => void = () => {},
): Promise<{ notifiedIds: string[]; errors: string[] }> {
  const from = { name: 'All in UJ: kalendarz', address: cfg.user };
  const send = (email: Email) => transport.sendMail({ from, to: cfg.to, ...email });

  if (events.length > DIGEST_THRESHOLD) {
    try {
      await send(buildDigestEmail(events, cfg.pageUrl));
      log(`  Wysłano zbiorcze powiadomienie o ${events.length} wydarzeniach.`);
      return { notifiedIds: events.map((e) => e.fbId), errors: [] };
    } catch (err) {
      return { notifiedIds: [], errors: [err instanceof Error ? err.message : String(err)] };
    }
  }

  const notifiedIds: string[] = [];
  const errors: string[] = [];
  for (const e of events) {
    try {
      await send(buildEventEmail(e, cfg.pageUrl));
      notifiedIds.push(e.fbId);
      log(`  Wysłano powiadomienie: ${e.name}`);
    } catch (err) {
      errors.push(`${e.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { notifiedIds, errors };
}

/** Mail testowy (przycisk „Run workflow” z zaznaczonym test_email): sprawdza konfigurację SMTP. */
export async function sendTestEmail(transport: Transporter, cfg: Pick<NotifyConfig, 'user' | 'to' | 'pageUrl'>, sample: AllInEvent | undefined): Promise<void> {
  const from = { name: 'All in UJ: kalendarz', address: cfg.user };
  const email: Email = sample
    ? buildEventEmail(sample, cfg.pageUrl)
    : { subject: 'All in UJ', text: 'Brak nadchodzących wydarzeń.', html: '<p>Brak nadchodzących wydarzeń.</p>' };
  await transport.sendMail({
    from,
    to: cfg.to,
    subject: `[TEST] ${email.subject}`,
    text: `To jest mail testowy: powiadomienia działają. Tak będzie wyglądać powiadomienie o nowym wydarzeniu:\n\n${email.text}`,
    html: `<p style="color:#6b7280">To jest mail testowy: powiadomienia działają. Tak będzie wyglądać powiadomienie o nowym wydarzeniu:</p>${email.html}`,
  });
}
