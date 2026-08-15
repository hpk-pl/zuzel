# Grafiki i geometria torów

Konfiguracja torów jest w **`public/tracks.json`** (jeden plik dla serwera i klienta).

## Tor oficjalny (wbudowany, bez edycji)

1. Skalibruj tor w **edytorze** (`/track-builder.html`) i zapisz do gry.
2. Otwórz **`/promote-track.html`** w tej samej przeglądarce → **Pobierz JSON do importu**.
3. W katalogu projektu:
   ```bash
   npm run import-track -- color-chainz-stadium.json --id color-chainz-stadium --default --locked
   ```
4. Zacommituj `public/tracks.json` i `public/img/tracks/<id>.jpg`, wdróż na serwer.

Flagi w `tracks.json`:
- `"default": true` — domyślny wybór w menu gry
- `"locked": true` — brak edycji/usuwania; własna kopia z tej samej nazwy znika z localStorage

## Ukrywanie toru w menu gry

Ustaw `"hidden": true` w wpisie toru w `tracks.json`. Tor nadal działa na serwerze (np. jako domyślny fallback), ale nie pojawia się w wyborze przed meczem.

## Nowy tor (ręcznie w JSON)

1. Dodaj zdjęcie stadionu (widok z góry) do `public/img/tracks/`, np. `torun.jpg`
2. Skopiuj blok toru w `tracks.json` i ustaw:
   - **`geometry`** — wektor band i środka (centerX/Y, straightHalf, bendRadius, width)
   - **`visual`** — grafika, `showVectorLayer: true` do kalibracji

## Kalibracja geometrii

Włącz `showVectorLayer: true` w `visual` — na torze zobaczysz:
- **czerwona linia** — zewnętrzna banda (upadek)
- **zielona linia** — wewnętrzna krawędź (środek trawiasty)

Dopasuj `centerX`, `centerY`, `straightHalf`, `bendRadius`, `width` aż linie pokryją się z grafiką.

Canvas gry: **1000×700 px**.
