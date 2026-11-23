import { describe, expect, it } from 'vitest';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { buildDigestEmail, buildEventEmail, DIGEST_THRESHOLD, sendNotifications } from '../src/notify.js';
import { mergeEvents, type StoredEvent } from '../src/store.js';
import type { AllInEvent } from '../src/normalize.js';

const NOW = 1795600000; // 2026-11-25

function ev(overrides: Partial<AllInEvent> = {}): AllInEvent {
  return {
    fbId: '2057585598277236',
    name: 'Bilard Studencki <by> All In UJ',
    description: 'Zapisz się na bilard! 🎱',
    url: 'https://www.facebook.com/events/2057585598277236/',
    start: 1795633200, // śr. 25.11, 20:00
    end: null,
    locationText: 'Forum Fun & Food',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=50.04503,19.93589',
    isOnline: false,
    onlineUrl: null,
    ticketUrl: 'https://docs.google.com/forms/d/e/xyz/viewform',
    isCanceled: false,
    ...overrides,
  };
}

const cfg = { user: 'bot@example.com', to: 'me@example.com', pageUrl: 'https://example.github.io/kal/' };

describe('mergeEvents: flaga powiadomień', () => {
  it('nowe wydarzenie czeka na powiadomienie', () => {
    expect(mergeEvents([], [ev()], NOW)[0].notified).toBe(false);
  });

  it('wydarzenia sprzed powiadomień (bez pola) nie wywołują maila', () => {
    const old: StoredEvent = { ...ev(), updatedAt: 1 };
    expect(mergeEvents([old], [ev()], NOW)[0].notified).toBeUndefined();
    expect(mergeEvents([old], [ev({ name: 'Zmieniona nazwa' })], NOW)[0].notified).toBeUndefined();
  });

  it('zmiana treści nie kasuje oczekującego powiadomienia ani nie wysyła drugiego', () => {
    const pending: StoredEvent = { ...ev(), updatedAt: 1, notified: false };
    const done: StoredEvent = { ...ev({ fbId: '1111111111' }), updatedAt: 1, notified: true };
    const merged = mergeEvents([pending, done], [ev({ name: 'X' }), ev({ fbId: '1111111111', name: 'Y' })], NOW);
    expect(merged.find((e) => e.fbId === '2057585598277236')?.notified).toBe(false);
    expect(merged.find((e) => e.fbId === '1111111111')?.notified).toBe(true);
  });
});

describe('treść maili', () => {
  it('pojedyncze wydarzenie: temat z datą, szczegóły i linki', () => {
    const mail = buildEventEmail(ev(), cfg.pageUrl);
    expect(mail.subject).toBe('Nowe wydarzenie All in UJ: Bilard Studencki <by> All In UJ (śr., 25.11, 20:00)');
    expect(mail.text).toContain('Gdzie: Forum Fun & Food');
    expect(mail.text).toContain('Bilety / zapisy: https://docs.google.com/forms/d/e/xyz/viewform');
    expect(mail.text).toContain('Facebook: https://www.facebook.com/events/2057585598277236/');
    expect(mail.text).toContain('https://example.github.io/kal/');
    // HTML jest escapowany
    expect(mail.html).toContain('Bilard Studencki &lt;by&gt; All In UJ');
    expect(mail.html).not.toContain('<by>');
  });

  it('odwołane wydarzenie ma prefiks w temacie', () => {
    expect(buildEventEmail(ev({ isCanceled: true })).subject).toContain('[ODWOŁANE] Bilard');
  });

  it('zbiorczy mail wymienia wszystkie wydarzenia', () => {
    const mail = buildDigestEmail([ev(), ev({ fbId: '1111111111', name: 'Kręgle' })]);
    expect(mail.subject).toBe('2 nowych wydarzeń All in UJ');
    expect(mail.text).toContain('Kręgle');
    expect(mail.text).toContain('Bilard');
  });
});

describe('sendNotifications', () => {
  const jsonTransport = () => nodemailer.createTransport({ jsonTransport: true });

  it('wysyła osobny mail dla każdego wydarzenia', async () => {
    const transport = jsonTransport();
    const sent: string[] = [];
    const spy = { sendMail: async (m: { subject: string }) => { sent.push(m.subject); return transport.sendMail(m); } };
    const res = await sendNotifications(spy as unknown as Transporter, cfg, [ev(), ev({ fbId: '1111111111' })]);
    expect(res.notifiedIds).toEqual(['2057585598277236', '1111111111']);
    expect(sent).toHaveLength(2);
  });

  it('powyżej progu wysyła jeden zbiorczy mail', async () => {
    const sent: string[] = [];
    const spy = { sendMail: async (m: { subject: string }) => { sent.push(m.subject); return {}; } };
    const many = Array.from({ length: DIGEST_THRESHOLD + 1 }, (_, i) => ev({ fbId: String(1000000000 + i) }));
    const res = await sendNotifications(spy as unknown as Transporter, cfg, many);
    expect(sent).toEqual([`${DIGEST_THRESHOLD + 1} nowych wydarzeń All in UJ`]);
    expect(res.notifiedIds).toHaveLength(DIGEST_THRESHOLD + 1);
  });

  it('nieudana wysyłka zostaje oznaczona jako błąd, reszta idzie dalej', async () => {
    let n = 0;
    const flaky = { sendMail: async () => { if (n++ === 0) throw new Error('535 auth failed'); return {}; } };
    const res = await sendNotifications(flaky as unknown as Transporter, cfg, [ev(), ev({ fbId: '1111111111' })]);
    expect(res.notifiedIds).toEqual(['1111111111']);
    expect(res.errors[0]).toContain('535 auth failed');
  });

  it('tworzy poprawną wiadomość MIME (nadawca, adresat, polskie znaki)', async () => {
    const info = await jsonTransport().sendMail({ from: { name: 'All in UJ: kalendarz', address: cfg.user }, to: cfg.to, ...buildEventEmail(ev({ name: 'Kręgle Studenckie' })) });
    const msg = JSON.parse(info.message as string);
    expect(msg.to[0].address).toBe('me@example.com');
    expect(msg.from.address).toBe('bot@example.com');
    expect(msg.subject).toContain('Kręgle Studenckie');
  });
});
