# Grafiki i geometria torów

Konfiguracja torów jest w **`public/tracks.json`** (jeden plik dla serwera i klienta).

## Nowy tor

1. Dodaj zdjęcie stadionu (widok z góry) do `public/img/tracks/`, np. `torun.jpg`
2. Skopiuj blok toru w `tracks.json` i ustaw:
   - **`geometry`** — wektor band i środka (centerX/Y, straightHalf, bendRadius, width)
   - **`visual`** — grafika, `showVectorLayer: true` do kalibracji

## Kalibracja geometrii (Leszno itd.)

Włącz `showVectorLayer: true` w `visual` — na torze zobaczysz:
- **czerwona linia** — zewnętrzna banda (upadek)
- **zielona linia** — wewnętrzna krawędź (środek trawiasty)

Dopasuj `centerX`, `centerY`, `straightHalf`, `bendRadius`, `width` aż linie pokryją się z grafiką.

Canvas gry: **1000×700 px**.
