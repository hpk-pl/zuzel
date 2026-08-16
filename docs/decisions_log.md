# Decisions Log — Żużel & PlayClub

> Format: data · decyzja · kontekst · konsekwencje  
> Ostatnia aktualizacja: 2026-07-25

---

## 2026-07 — PlayClub jako osobna marka

**Decyzja:** PlayClub to osobna platforma (`playclub.pl`), nie podmarka Żużla. ColorChainz jest sponsorem, nie właścicielem marki gry.

**Kontekst:** Brief PlayClub — casualowe gry bez rejestracji, lobby z katalogiem gier.

**Konsekwencje:**
- Osobne lobby z brandingiem PlayClub
- Gra pod `/gry/zuzel/` (nie root domeny na playclub.pl)
- `zuzel.hpkgrupa.pl` zostaje do czasu 301

---

## 2026-07 — Bez logowania i bez Airtable

**Decyzja:** Brak kont użytkowników. Analityka do pliku `events.jsonl`. Brak integracji Airtable.

**Kontekst:** Filozofia „bez bzdur”, szybki start gry.

**Konsekwencje:**
- Nick + `sessionId` w localStorage do reconnect
- Leaderboard po czasach biegów (anonimowe nicki)

---

## 2026-07 — „Nowa gra” zamiast „Inna gra”

**Decyzja:** Przycisk na ekranie końca meczu nazywa się **Nowa gra** i resetuje mecz w tym samym pokoju. Nie wraca do lobby platformy.

**Kontekst:** PR #43. Mockup PlayClub miał „Inna gra” — uzgodniono zmianę semantyki.

**Konsekwencje:**
- Powrót do PlayClub = link „← PlayClub” (pod `/gry/zuzel/`) lub wyjście z pokoju
- Osobny przycisk „Inna gra” / powrót do lobby może pojawić się później

---

## 2026-07 — Karta gry: „do 4 graczy”, nie „1v1”

**Decyzja:** W lobby PlayClub opis Żużla: **drużynowy · do 4 graczy · online**.

**Kontekst:** Mockup brandingowy miał „1v1” — to uproszczenie marketingowe, niezgodne z mechaniką (drużyny A/B, do 4 graczy).

---

## 2026-07 — CTA ColorChainz: subtelny, bez nachalności

**Decyzja:** Na razie zostawiamy obecną implementację:
- „Matchday powered by COLORCHAINZ” zawsze po meczu
- Pełne CTA „Wear your colors →” co 3 mecze

**Kontekst:** Użytkownik uzgodnił, że graficzne elementy (podium, zdjęcie w łańcuchach) to **kolejny krok**, bez aktywnego namawiania do zakupu.

**Konsekwencje:**
- Nie implementujemy dużego CTA ze zdjęciem produktu teraz
- Kolejny krok: podium na ekranie końca + łańcuchy wizualnie

**Odrzucone na teraz:** Agresywny e-commerce overlay jak w pełnym mockupie brandingowym.

---

## 2026-07 — Statystyki końca meczu: bez rozbudowy teraz

**Decyzja:** Zostawiamy obecny ekran końca (wynik drużyn + tabela graczy w trybie lokalnym).

**Nice-to-have (zapisane na później):**
- Punkty indywidualne przy wyniku drużyn (online też — dane są w `matchSummary.players`)
- Najlepszy czas biegu w całych zawodach + kto go osiągnął (wymaga agregacji po stronie serwera)

**Odrzucone na teraz:** Pełny ekran ze statystykami jak w mockupie (najlepszy zawodnik, najlepsze okrążenie itd.).

---

## 2026-07 — Share wyniku 9:16

**Decyzja:** Odłożone. Mockup social share (Instagram/WhatsApp) — faza późniejsza.

---

## 2026-07 — Regulamin i polityka prywatności

**Decyzja:** Placeholdery w `public/lobby/regulamin.html` i `prywatnosc.html`. Pełne dokumenty przed publicznym startem `playclub.pl`.

**Kontekst:** Wymóg prawny przed pełnym launch platformy.

---

## 2026-07 — Reconnect: zachowanie sesji w lobby

**Decyzja:** Przy **niezamierzonym** disconnect (utrata sieci, minimalizacja) sesja trafia do `disconnectedSessions` — pokój żyje, gracz może wrócić.

**Implementacja:** PR #45
- `pendingRejoinOnConnect` — rejoin tylko po disconnect/odświeżeniu, nie przy każdym `connect`
- `keepAlive` pokoju gdy `disconnectedSessions.size > 0` (także w lobby)
- Banner reconnect tylko w lobby/grze

---

## 2026-07 — Cleanup pokoju: świadome wyjście vs disconnect

**Decyzja:** Przy **`leave-room`** (przycisk „Wróć”) sesja **nie** jest zapisywana w `disconnectedSessions`. Pokój znika, gdy ostatni gracz świadomie wychodzi.

**Kontekst:** Po rewanżu host wychodził — pokój zostawał w liście na zawsze (brak TTL).

**Implementacja:** PR #46 — `voluntaryLeave: true` w `removeClient`.

**Odrzucone na teraz:** TTL (np. 10 min) na `disconnectedSessions`.

| Scenariusz | Zachowanie |
|------------|------------|
| Wszyscy klikają „Wróć” | Pokój znika od razu |
| Ktoś traci sieć na chwilę | Pokój zostaje, reconnect działa |
| Ktoś traci sieć i nigdy nie wraca | Pokój zostaje do restartu serwera |

**Kiedy rozważyć TTL:** Jeśli w praktyce pojawią się „zombie pokoje” po przypadkowych rozłączeniach. Na start nie jest potrzebny.

---

## 2026-07 — Struktura folderów na serwerze

**Decyzja:** **Na razie** zostawiamy `~/projects/zuzel` (jedno repo, lobby + gra).

**Docelowo (przy 2. grze lub większym lobby):**
```
~/projects/playclub/lobby/   # statyki, nginx bez Node
~/projects/playclub/zuzel/   # gra (obecne repo)
```

**Kontekst:** Pytanie użytkownika o `projects/playclub/zuzel`. Uzgodniono: sensowne, ale przedwczesne przy jednej grze.

**Trigger migracji:** Druga gra na platformie LUB lobby wymaga osobnego cyklu deploy.

**Odrzucone na teraz:** Monorepo wszystkich gier w jednym `package.json`.

---

## 2026-07 — Dwa systemd + BASE_PATH

**Decyzja:** Dwa deploye z jednego repo:
- `zuzel.service` — port 3080, bez `BASE_PATH` (legacy `zuzel.hpkgrupa.pl`)
- `playclub.service` — port 3081, `BASE_PATH=/gry/zuzel` (lobby + gra)

**Kontekst:** PR #47. Unikamy łamania istniejącej domeny podczas wdrażania PlayClub.

**Alternatywa odrzucona:** Jeden proces z routingiem po `Host` — możliwe, ale dwa serwisy są prostsze w debugowaniu i rollbacku.

---

## 2026-07 — Lobby w tym samym repo (faza 1)

**Decyzja:** Lobby PlayClub w `public/lobby/`, serwowane przez ten sam Node gdy `BASE_PATH` ustawiony.

**Konsekwencje:**
- Jeden `git pull` aktualizuje lobby i grę
- W przyszłości lobby można wydzielić do `projects/playclub/lobby/` (statyki nginx)

---

## 2026-07 — Sklep ColorChainz: URL w configu

**Decyzja:** Kategoria sklepu nie jest gotowa. Wystarczy późniejsza zmiana `shop.baseUrl` w `playclub-config.js`.

**Brak:** Integracji API sklepu, listy produktów w grze.

---

## 2026-07 — 301 z zuzel.hpkgrupa.pl

**Decyzja:** Odłożone. Docelowo przekierowanie na `playclub.pl/gry/zuzel/`.

**Status:** `zuzel.hpkgrupa.pl` działa bez zmian do czasu świadomego przełączenia.

---

## Szablon na przyszłe wpisy

```markdown
## RRRR-MM-DD — Tytuł decyzji

**Decyzja:** Co postanowiliśmy.

**Kontekst:** Dlaczego.

**Konsekwencje:** Co z tego wynika w kodzie/deployu.

**Odrzucone:** Co rozważaliśmy i odrzuciliśmy (opcjonalnie).
```
