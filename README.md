# allinuj-calendar-sync

Dwa razy dziennie pobiera nadchodzące wydarzenia ze strony [All in UJ na Facebooku](https://www.facebook.com/allinuj) i publikuje je jako **kalendarz do subskrypcji (.ics)** na GitHub Pages. Wklejasz adres raz do Google Calendar, Apple Calendar albo Outlooka, a nowe wydarzenia pojawiają się same, bez wchodzenia na FB/IG.

- **Darmowe:** scraping publicznej zakładki Wydarzenia (biblioteka [`facebook-event-scraper`](https://github.com/francescov1/facebook-event-scraper)), bez logowania, bez płatnych API i serwerów.
- **Stabilne ID:** każde wydarzenie ma stały `UID` oparty na ID z FB, więc zmiana godziny czy miejsca aktualizuje wpis, zamiast go dublować.
- **Historia:** stan trzymany jest w `data/events.json`, a workflow commituje go po każdej zmianie. Wydarzenia, które się odbyły albo zniknęły z FB, zostają w kalendarzu (przez 180 dni). Odwołane dostają prefiks `[ODWOŁANE]`.
- **Głośno pada:** błąd = nieudany workflow = mail od GitHuba.

## Adres kalendarza

Po wdrożeniu:

- strona z przyciskami „Kopiuj” / „Dodaj do Google Calendar”: `https://<twój-login>.github.io/<repo>/`
- sam kalendarz: `https://<twój-login>.github.io/<repo>/allinuj.ics`

**Google Calendar:** po lewej „Inne kalendarze” → **+** → **Z adresu URL** → wklej adres `.ics`. Musisz to zrobić w przeglądarce na komputerze; w aplikacji mobilnej tej opcji nie ma, ale kalendarz potem się w niej pokaże.

Ograniczenia subskrypcji w Google:
- Google sam decyduje, kiedy odświeżyć subskrypcję (zwykle co kilka do kilkunastu godzin).
- Zwykle ignoruje przypomnienia zapisane w pliku. Apple Calendar i Outlook je respektują (1 dzień i 2 h przed).

Jeśli potrzebujesz natychmiastowych zmian albo przypomnień w Google, zobacz [Opcjonalnie: Google Calendar API](#opcjonalnie-google-calendar-api).

## Wdrożenie (jednorazowo)

1. Utwórz **publiczne** repo na GitHubie i wypchnij kod. GitHub Pages w prywatnym repo wymaga GitHub Pro (za darmo w GitHub Student Developer Pack).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Actions → „Sync All in UJ → kalendarz (.ics)” → Run workflow.** Po ~1 min kalendarz jest pod adresem powyżej.

Potem workflow uruchamia się sam o 05:17 i 15:17 UTC. Jeśli przez 30 dni nic się nie zmieni (np. w wakacje), robi pusty commit „keepalive”, bo GitHub wyłącza crony w publicznych repo po 60 dniach bez aktywności.

## Lokalnie

```bash
npm install
npm test
npm run sync:dry   # tylko wypisuje wydarzenia z FB, nic nie zapisuje
npm run sync       # aktualizuje data/events.json i generuje public/allinuj.ics + public/index.html
```

## Gdy coś przestanie działać

- **„No event data found…” na GitHub Actions, a lokalnie działa:** FB blokuje IP serwerów GitHuba. Dodaj sekret `FB_COOKIES` (`c_user=...; xs=...` z pobocznego konta FB, z DevTools → Application → Cookies). Cookies wygasają co jakiś czas.
- **Błąd także lokalnie:** FB zmienił HTML. Zaktualizuj bibliotekę (`npm install facebook-event-scraper@latest`) i uruchom testy.
- Gdy pobieranie się nie uda, poprzednia wersja kalendarza zostaje online. Nic nie znika.

> Regulamin Facebooka zabrania automatycznego scrapowania. Skala jest minimalna (jedna publiczna strona, dwa razy dziennie, pauza 2 s między zapytaniami), ale korzystasz na własną odpowiedzialność.

## Opcjonalnie: Google Calendar API

Daje natychmiastowe wpisy i przypomnienia w Google, ale wymaga konta serwisowego.

1. W Google Calendar utwórz kalendarz „All in UJ”. W jego ustawieniach ustaw **Powiadomienia o wydarzeniach** i skopiuj **Identyfikator kalendarza**.
2. W [Google Cloud Console](https://console.cloud.google.com) włącz **Google Calendar API**, utwórz **konto serwisowe** i pobierz jego klucz JSON. To sekret: nie commituj go.
3. Udostępnij kalendarz e-mailowi konta serwisowego z uprawnieniem **„Wprowadzanie zmian w wydarzeniach”**.
4. Dodaj sekrety repo `GOOGLE_CALENDAR_ID` i `GOOGLE_SERVICE_ACCOUNT_JSON` (cała zawartość pliku JSON).

Skrypt nie przywraca wydarzeń, które usuniesz z tego kalendarza ręcznie.

## Struktura
| Plik | Rola |
|---|---|
| `src/fetchEvents.ts` | pobranie listy i szczegółów wydarzeń z FB (z ponawianiem) |
| `src/normalize.ts` | dane z FB → `AllInEvent` (wydarzenia wielodniowe rozbite na dni) |
| `src/store.ts` | stan między uruchomieniami (`data/events.json`), scalanie i retencja |
| `src/ics.ts` | generowanie pliku `.ics` (RFC 5545) |
| `src/page.ts` | strona `index.html` z adresem subskrypcji |
| `src/mapEvent.ts`, `src/calendar.ts` | opcjonalna synchronizacja przez Google Calendar API |
| `src/index.ts` | orkiestracja, log, kod wyjścia |
| `test/` | testy jednostkowe (`npm test`) |
