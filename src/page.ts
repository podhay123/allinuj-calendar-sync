import { CALENDAR_NAME } from './ics.js';
import { eventSummary, TIME_ZONE } from './mapEvent.js';
import type { StoredEvent } from './store.js';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmt = new Intl.DateTimeFormat('pl-PL', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

/** Prosta strona z adresem subskrypcji i listą najbliższych wydarzeń. */
export function buildPage(events: StoredEvent[], icsFile: string, nowSec: number): string {
  const upcoming = events.filter((e) => (e.end ?? e.start) >= nowSec);
  const items = upcoming
    .map(
      (e) => `<li><time>${esc(fmt.format(new Date(e.start * 1000)))}</time>
        <a href="${esc(e.url)}">${esc(eventSummary(e))}</a>${e.locationText ? `<span>${esc(e.locationText)}</span>` : ''}</li>`,
    )
    .join('\n      ');

  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${CALENDAR_NAME}: kalendarz wydarzeń</title>
<style>
  :root { color-scheme: light dark; --muted: #6b7280; --line: #d1d5db; --accent: #2563eb; }
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 42rem; margin: 2.5rem auto; padding: 0 1.25rem; }
  h1 { font-size: 1.6rem; margin-bottom: .25rem; }
  p { margin: .5rem 0; }
  .muted { color: var(--muted); font-size: .9rem; }
  .feed { display: flex; gap: .5rem; margin: 1rem 0; }
  .feed input { flex: 1; font: inherit; font-size: .9rem; padding: .5rem .6rem; border: 1px solid var(--line); border-radius: 6px; }
  button, .btn { font: inherit; font-size: .9rem; padding: .5rem .9rem; border-radius: 6px; border: 1px solid var(--line);
    background: transparent; color: inherit; cursor: pointer; text-decoration: none; display: inline-block; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .actions { display: flex; flex-wrap: wrap; gap: .5rem; }
  ul { list-style: none; padding: 0; margin: 1rem 0; }
  li { padding: .6rem 0; border-bottom: 1px solid var(--line); display: grid; gap: .1rem; }
  li time { font-size: .85rem; color: var(--muted); }
  li span { font-size: .85rem; color: var(--muted); }
  a { color: var(--accent); }
</style>
</head>
<body>
  <h1>${CALENDAR_NAME}: kalendarz wydarzeń</h1>
  <p class="muted">Wydarzenia pobierane automatycznie z Facebooka All in UJ co 6 godzin.</p>

  <div class="feed">
    <input id="feed" readonly aria-label="Adres kalendarza">
    <button id="copy" type="button">Kopiuj</button>
  </div>
  <div class="actions">
    <a id="google" class="btn primary">Dodaj do Google Calendar</a>
    <a id="webcal" class="btn">Apple / Outlook (webcal)</a>
  </div>
  <p class="muted">Google Calendar: Inne kalendarze → + → „Z adresu URL” → wklej adres. Google odświeża subskrypcje co kilka–kilkanaście godzin.</p>

  <h2>Najbliższe wydarzenia</h2>
  <ul>
      ${items || '<li>Brak zaplanowanych wydarzeń.</li>'}
  </ul>

<script>
  const url = new URL('${icsFile}', location.href).href;
  const webcal = url.replace(/^https?:/, 'webcal:');
  document.getElementById('feed').value = url;
  document.getElementById('webcal').href = webcal;
  document.getElementById('google').href = 'https://calendar.google.com/calendar/render?cid=' + encodeURIComponent(webcal);
  document.getElementById('copy').onclick = async (ev) => {
    await navigator.clipboard.writeText(url);
    ev.target.textContent = 'Skopiowano';
  };
</script>
</body>
</html>
`;
}
