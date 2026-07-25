# Żużel — gra multiplayer

Gra w żużel dla maksymalnie 4 graczy. Każdy zawodnik steruje motorem (kolorową linią) na owalnym torze. Jeden przycisk — skręt w lewo. Gaz cały czas włączony, jak na prawdziwym torze.

## Zasady

- Jazda **przeciwnie do ruchu wskazówek zegara**
- **4 okrążenia** — pierwszy na mecie wygrywa
- Skręcanie **tylko w lewo** (jeden przycisk na gracza)
- Wyjazd poza tor = spowolnienie
- Kolizje z innymi zawodnikami spowalniają

## Sterowanie

| Gracz | Klawisz | Kolor |
|-------|---------|-------|
| 1 | `A` | Czerwony |
| 2 | `S` | Niebieski |
| 3 | `K` | Zielony |
| 4 | `L` | Żółty |

## Uruchomienie lokalne

```bash
npm install
npm start
```

Gra dostępna pod adresem `http://localhost:3000`.

## Wdrożenie na serwer Hetzner (zuzel.hpkgrupa.pl)

Aplikacja trafia do:

```
/home/deploy/projects/zuzel
```

Domena: **https://zuzel.hpkgrupa.pl**

### Jak działa domena przy wielu projektach?

Rekord DNS **nie wskazuje na folder** — wskazuje tylko na **IP serwera**.

| Warstwa | Co robi |
|---------|---------|
| **DNS** (rekord A `zuzel`) | Kieruje `zuzel.hpkgrupa.pl` → IP serwera Hetzner |
| **nginx** | Na podstawie nazwy domeny przekierowuje ruch do właściwej aplikacji |
| **systemd** | Uruchamia proces Node.js z katalogu `~/projects/zuzel` na porcie `3080` |

Na jednym serwerze możesz mieć wiele domen i projektów:

```
zuzel.hpkgrupa.pl     → nginx → localhost:3080 → ~/projects/zuzel
stocklab.hpkgrupa.pl  → nginx → localhost:???? → ~/projects/stocklab
kroki.hpkgrupa.pl     → nginx → localhost:???? → ~/projects/kroki
```

Wszystkie rekordy A wskazują na **to samo IP**. Różnicę robi nginx — każda domena ma osobny plik konfiguracyjny w `/etc/nginx/sites-available/`.

### 1. DNS

W panelu domeny `hpkgrupa.pl` dodaj rekord:

| Typ | Nazwa | Wartość |
|-----|-------|---------|
| A | `zuzel` | IP serwera Hetzner (to samo co inne subdomeny) |

### 2. Pierwsza instalacja

```bash
# Na serwerze jako użytkownik deploy
cd ~/projects/zuzel
chmod +x deploy/install.sh
./deploy/install.sh
```

Jeśli katalog jeszcze nie istnieje:

```bash
cd ~/projects
git clone https://github.com/hpk-pl/zuzel.git
cd zuzel
chmod +x deploy/install.sh
./deploy/install.sh
```

Skrypt:
- instaluje zależności npm,
- uruchamia usługę systemd `zuzel` na porcie `3080`,
- konfiguruje nginx dla `zuzel.hpkgrupa.pl`.

### 3. Certyfikat SSL (jednorazowo)

```bash
sudo certbot --nginx -d zuzel.hpkgrupa.pl
```

### 4. Aktualizacja po zmianach w kodzie

```bash
cd ~/projects/zuzel
git pull
npm install --production
sudo systemctl restart zuzel
```

### 5. Przydatne komendy

```bash
# Status usługi
sudo systemctl status zuzel

# Logi
journalctl -u zuzel -f

# Health check
curl http://127.0.0.1:3080/health
```

### Pliki wdrożeniowe

| Plik | Opis |
|------|------|
| `deploy/zuzel.service` | Usługa systemd |
| `deploy/nginx-zuzel.hpkgrupa.pl.conf` | Reverse proxy nginx |
| `deploy/install.sh` | Skrypt instalacji/aktualizacji |

## Architektura

- **Node.js + Express** — serwer HTTP
- **Socket.IO** — synchronizacja multiplayer w czasie rzeczywistym
- **HTML5 Canvas** — renderowanie toru i motorów
- Serwer autorytatywny (60 ticków/s) — fizyka po stronie serwera

## Zmienne środowiskowe

| Zmienna | Domyślnie | Opis |
|---------|-----------|------|
| `PORT` | `3000` | Port serwera |

## Health check

```
GET /health
```

Zwraca `{"status":"ok","rooms":N}`.
