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

## Wdrożenie na serwer Hetzner

### 1. Przygotowanie serwera

```bash
# Na serwerze Hetzner (Ubuntu/Debian)
sudo apt update && sudo apt install -y nodejs npm nginx certbot python3-certbot-nginx git

# Sklonuj repozytorium
cd ~
git clone <twoje-repo> zuzel
cd zuzel
npm install --production
```

### 2. Usługa systemd

Utwórz plik `/etc/systemd/system/zuzel.service`:

```ini
[Unit]
Description=Zuzel multiplayer game
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/home/TWOJ_USER/zuzel
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Uruchom usługę:

```bash
sudo systemctl daemon-reload
sudo systemctl enable zuzel
sudo systemctl start zuzel
sudo systemctl status zuzel
```

### 3. Nginx (reverse proxy + HTTPS)

Utwórz `/etc/nginx/sites-available/zuzel`:

```nginx
server {
    listen 80;
    server_name twoja-domena.pl;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Aktywuj i uzyskaj certyfikat SSL:

```bash
sudo ln -s /etc/nginx/sites-available/zuzel /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d twoja-domena.pl
```

### 4. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### 5. Gra

Otwórz `https://twoja-domena.pl` w przeglądarce. Do 4 graczy może dołączyć do tego samego pokoju (domyślnie `main`), kliknąć **Gotowy**, a host uruchamia wyścig.

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
