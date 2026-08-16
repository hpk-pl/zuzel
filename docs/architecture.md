# Architektura — Żużel & PlayClub

> Ostatnia aktualizacja: 2026-07-25  
> Repo: `hpk-pl/zuzel` · Produkcja gry: `zuzel.hpkgrupa.pl` · Platforma (plan): `playclub.pl`

## 1. Wizja produktu

**PlayClub** (`playclub.pl`) to osobna marka — platforma casualowych gier przeglądarkowych dla znajomych i rodziny. Bez rejestracji, bez konta. „Gierki z ekipą. Bez rejestracji. Bez bzdur.”

**Żużel** jest pierwszą grą na platformie. **ColorChainz** jest sponsorem (most do sklepu po meczu, branding toru Color Chainz Stadium).

Fazy:

| Faza | Zakres | Status |
|------|--------|--------|
| **1** | Lobby `playclub.pl`, gra pod `/gry/zuzel/`, subtelny CTA ColorChainz, analityka | W toku (PR #47) |
| **2** | Pełny regulamin/prywatność, rebranding UI gry, podium końca meczu | Zaplanowane |
| **3** | Kolejne gry, share wyniku 9:16, 301 z `zuzel.hpkgrupa.pl` | Później |

---

## 2. Struktura repozytorium (obecna)

```
zuzel/
├── public/
│   ├── index.html          # Gra online (mobile)
│   ├── local.html          # Gra lokalna PC
│   ├── lobby/              # PlayClub lobby (playclub.pl /)
│   │   ├── index.html
│   │   ├── regulamin.html  # placeholder
│   │   ├── prywatnosc.html # placeholder
│   │   └── css/playclub.css
│   ├── js/
│   │   ├── app-base.js     # BASE_PATH auto-detect
│   │   ├── online-client.js
│   │   ├── playclub-config.js
│   │   ├── playclub-bridge.js
│   │   └── playclub-analytics.js
│   └── ...
├── server/
│   ├── index.js            # Express + Socket.IO
│   ├── config.js           # BASE_PATH
│   ├── game.js             # Logika pokoi i meczu
│   ├── leaderboard.js
│   └── analytics.js
├── data/
│   ├── leaderboard.json
│   └── events.jsonl
└── deploy/
    ├── zuzel.service           # zuzel.hpkgrupa.pl :3080
    ├── playclub.service        # playclub.pl :3081
    ├── nginx-zuzel.hpkgrupa.pl.conf
    ├── nginx-playclub.pl.conf
    ├── install.sh
    └── playclub-install.sh
```

### Docelowa struktura na serwerze (przyszłość)

> **Nie wdrażać teraz** — migracja przy drugiej grze lub większym lobby.

```
~/projects/playclub/
├── lobby/          # statyki playclub.pl (nginx bez Node)
├── zuzel/          # obecne repo (tylko gra)
├── quiz/           # przyszła gra
└── shared/         # opcjonalnie: wspólny CSS, analytics
```

Nginx wtedy:

```
playclub.pl/              → ~/projects/playclub/lobby/public/
playclub.pl/gry/zuzel/    → proxy → zuzel :3081
playclub.pl/gry/quiz/     → proxy → quiz :3082
```

---

## 3. Architektura runtime

### 3.1 Dwa deploye z jednego repo

| Domena | Usługa | Port | `BASE_PATH` | Co serwuje |
|--------|--------|------|-------------|------------|
| `zuzel.hpkgrupa.pl` | `zuzel` | 3080 | *(pusty)* | Gra pod `/` (legacy) |
| `playclub.pl` | `playclub` | 3081 | `/gry/zuzel` | Lobby `/` + gra `/gry/zuzel/` |

### 3.2 Routing PlayClub (BASE_PATH=/gry/zuzel)

```
playclub.pl/
├── /                      → public/lobby/     (statyczne lobby)
├── /regulamin.html
├── /prywatnosc.html
└── /gry/zuzel/
    ├── /                  → public/index.html (gra online)
    ├── /socket.io/        → Socket.IO
    ├── /api/leaderboard
    ├── /api/events
    └── /health
```

Klient wykrywa prefiks przez `app-base.js` (regex `/gry/zuzel` w URL).

### 3.3 Stack techniczny

| Warstwa | Technologia |
|---------|-------------|
| Backend | Node.js ≥18, Express |
| Realtime | Socket.IO (pokoje, stan gry, reconnect) |
| Frontend gry | Vanilla HTML/CSS/JS, Canvas |
| Lobby | Statyczne HTML + CSS (Poppins, Inter) |
| Dane | `leaderboard.json`, `events.jsonl` (bez bazy, bez Airtable) |
| Reverse proxy | nginx + certbot |
| Process manager | systemd (`deploy` user) |

### 3.4 Model multiplayer

- **Pokój online**: host tworzy, kod 6 znaków, max 4 gracze, drużyny A/B
- **Serwer autorytatywny**: fizyka 60 Hz, stan emitowany do klientów
- **Reconnect**: `disconnectedSessions` w lobby i `match_finished`; sesja w localStorage
- **Cleanup pokoju**: przy świadomym `leave-room` sesja nie jest zachowywana → pokój znika gdy nikt nie zostaje
- **Lista pokoi**: tylko lobby/match_finished, max 3/4 graczy, host nick + kod

---

## 4. PlayClub — integracje

### 4.1 Most do sklepu (`playclub-bridge.js`)

- Po meczu: „Matchday powered by **COLORCHAINZ**”
- Pełne CTA „Wear your colors →” co **3** mecze (`ctaEveryNMatches` w config)
- URL: `https://colorchainz.pl/kategoria/zuzel` + UTM (`source=playclub`)
- Kategoria sklepu może się zmienić — wystarczy edycja `playclub-config.js`

### 4.2 Analityka (`playclub-analytics.js`)

Zdarzenia → `POST /api/events` → `data/events.jsonl`:

- `game_view`, `game_start`, `game_complete`
- `rematch_click`, `colorchainz_impression`, `colorchainz_click`

Bez logowania użytkownika. Nick w grze nie jest powiązany z kontem.

### 4.3 Branding (z mockupu PlayClub)

| Token | Wartość | Użycie |
|-------|---------|--------|
| Arcade Black | `#0D0D0D` | Tło |
| Off White | `#F0F0E8` | Tekst |
| Play Green | `#39FF14` | Akcent, CTA |
| Play Yellow | `#FFE135` | CTA sklepu (przyszłość) |
| Screen Blue | `#00BFFF` | Akcent pomocniczy |

Typografia: **Poppins ExtraBold** (nagłówki), **Inter** (body), **Press Start 2P** (retro/pixel — opcjonalnie).

Zasada: ~70% czerni/bieli, neonowe akcenty oszczędnie.

---

## 5. Ekrany i UX (ustalenia)

### Lobby PlayClub
- Karta **Żużel · do 4 graczy · online** (nie „1v1”)
- 3 gry „Wkrótce”: Papierowe piłkarzyki, Quiz sportowy, Rzuty karne
- Link do sklepu ColorChainz w headerze

### Gra — ekran końca meczu
- **Rewanż** (host) — reset meczu w pokoju
- **Nowa gra** (host) — nowy mecz od zera (nie „Inna gra” = powrót do menu platformy)
- Gość: podpowiedź z nickiem hosta gdy nie może kliknąć Nowa gra
- CTA sklepu: na razie tekstowe, bez nachalnego namawiania

### Zaplanowane ulepszenia ekranu końca (nie teraz)
- **Podium** + zdjęcie w łańcuchach na podium (wizualnie, bez agresywnego CTA)
- **Statystyki**: punkty indywidualne przy wyniku drużyn + najlepszy czas biegu w zawodach i kto go osiągnął  
  *(dane częściowo są: `matchSummary.players[].totalPoints`; brak agregacji best heat time)*
- **Share 9:16** do social mediów

### Dokumenty prawne
- Placeholdery: `/regulamin.html`, `/prywatnosc.html`
- Pełne wersje przed publicznym startem platformy

---

## 6. DNS i domeny

| Domena | DNS | Cel |
|--------|-----|-----|
| `playclub.pl` | A → Hetzner | Platforma PlayClub |
| `zuzel.hpkgrupa.pl` | A → Hetzner | Legacy (docelowo 301 → `playclub.pl/gry/zuzel/`) |

---

## 7. Deploy

### Żużel legacy
```bash
cd ~/projects/zuzel && ./deploy/install.sh
sudo systemctl restart zuzel
```

### PlayClub
```bash
cd ~/projects/zuzel && ./deploy/playclub-install.sh
sudo certbot --nginx -d playclub.pl -d www.playclub.pl
```

### Zmienne środowiskowe

| Zmienna | Domyślnie | Opis |
|---------|-----------|------|
| `PORT` | `3000` | Port serwera |
| `BASE_PATH` | *(pusty)* | Prefiks URL gry, np. `/gry/zuzel` |

---

## 8. Historia PR (kontekst techniczny)

| PR | Temat |
|----|--------|
| #39 | Lista pokoi + kod fallback |
| #40 | Color Chainz Stadium w repo |
| #41 | Czasy biegów + Top 20 leaderboard |
| #42 | PlayClub bridge, analityka, ekran końca |
| #43 | „Nowa gra” zamiast „Inna gra” |
| #44 | Overlay końca odświeża się przy zmianie hosta |
| #45 | Reconnect w lobby, `pendingRejoinOnConnect` |
| #46 | Usuwanie pokoju przy świadomym wyjściu |
| #47 | Lobby PlayClub + BASE_PATH |

---

## 9. Świadomie nie robimy

- Logowania / kont użytkowników
- Integracji z Airtable
- Bazy danych (na razie pliki JSON/JSONL)
- Monorepo wszystkich gier w jednym `package.json` (dopóki nie ma 2+ gier)
- TTL na `disconnectedSessions` (na razie — patrz `decisions_log.md`)
