# Grafiki i geometria torów

Konfiguracja torów jest w **`public/tracks.json`** (jeden plik dla serwera i klienta).

## Ukrywanie toru w menu gry

Ustaw `"hidden": true` w wpisie toru w `tracks.json`. Tor nadal działa na serwerze (np. jako domyślny fallback), ale nie pojawia się w wyborze przed meczem.

## Nowy tor

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
