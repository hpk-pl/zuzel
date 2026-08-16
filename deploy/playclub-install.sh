#!/usr/bin/env bash
set -euo pipefail

# Instalacja PlayClub (playclub.pl) na serwerze Hetzner.
# Uruchom jako deploy:
#   cd ~/projects/zuzel && ./deploy/playclub-install.sh
#
# Wymaga działającego zuzel.service (zuzel.hpkgrupa.pl) — ten skrypt dodaje
# osobną instancję na porcie 3081 z BASE_PATH=/gry/zuzel.

APP_DIR="${APP_DIR:-$HOME/projects/zuzel}"
SERVICE_NAME="playclub"
PORT=3081
DOMAIN="playclub.pl"

echo "==> Katalog aplikacji: $APP_DIR"
cd "$APP_DIR"

echo "==> Pobieranie najnowszego kodu..."
git pull --ff-only origin main

echo "==> Instalacja zależności..."
npm install --production

echo "==> Instalacja usługi systemd (playclub)..."
sudo cp deploy/playclub.service /etc/systemd/system/${SERVICE_NAME}.service
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl restart ${SERVICE_NAME}

echo "==> Instalacja konfiguracji nginx..."
sudo mkdir -p /var/www/certbot/.well-known/acme-challenge
sudo cp deploy/nginx-playclub.pl.conf /etc/nginx/sites-available/${DOMAIN}
sudo ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}
sudo nginx -t
sudo systemctl reload nginx

echo "==> Status usługi:"
sudo systemctl --no-pager status ${SERVICE_NAME} | head -15

echo ""
echo "Gotowe."
echo "  Lobby:  http://${DOMAIN}/"
echo "  Gra:    http://${DOMAIN}/gry/zuzel/"
echo "  Health: curl http://127.0.0.1:${PORT}/gry/zuzel/health"
echo ""
echo "SSL (jeśli jeszcze brak):"
echo "  sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
