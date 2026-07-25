#!/usr/bin/env bash
set -euo pipefail

# Instalacja / aktualizacja Żużla na serwerze Hetzner.
# Uruchom jako użytkownik deploy:
#   cd ~/projects/zuzel && ./deploy/install.sh

APP_DIR="${APP_DIR:-$HOME/projects/zuzel}"
SERVICE_NAME="zuzel"
PORT=3080
DOMAIN="zuzel.hpkgrupa.pl"

echo "==> Katalog aplikacji: $APP_DIR"
cd "$APP_DIR"

echo "==> Pobieranie najnowszego kodu..."
git pull --ff-only origin main

echo "==> Instalacja zależności..."
npm install --production

echo "==> Instalacja usługi systemd..."
sudo cp deploy/zuzel.service /etc/systemd/system/${SERVICE_NAME}.service
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl restart ${SERVICE_NAME}

echo "==> Instalacja konfiguracji nginx..."
sudo mkdir -p /var/www/certbot/.well-known/acme-challenge
sudo cp deploy/nginx-zuzel.hpkgrupa.pl.conf /etc/nginx/sites-available/${DOMAIN}
sudo ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}
sudo nginx -t
sudo systemctl reload nginx

echo "==> Status usługi:"
sudo systemctl --no-pager status ${SERVICE_NAME} | head -15

echo ""
echo "Gotowe. Sprawdź: http://${DOMAIN}"
echo "Health check: curl http://127.0.0.1:${PORT}/health"
echo ""
echo "Jeśli SSL jeszcze nie działa, uruchom:"
echo "  sudo certbot --nginx -d ${DOMAIN}"
