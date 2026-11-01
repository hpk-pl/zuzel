#!/usr/bin/env bash
set -euo pipefail

# Jednorazowa instalacja instancji deweloperskiej (staging) — NIE dotyka produkcji.
#
# Produkcja PlayClub + legacy żużel: ~/projects/zuzel → zuzel.service (3080), playclub.service (3081)
# Ta instancja: ~/projects/zuzel-dev → zuzel-dev.service (3083) → zuzel-dev.hpkgrupa.pl
#
# Uruchom JEDNORAZOWO na serwerze jako deploy (po utworzeniu brancha develop na GitHub):
#   cd ~/projects/zuzel && git pull
#   chmod +x deploy/dev-install.sh
#   ./deploy/dev-install.sh
#
# Zmienne (opcjonalnie):
#   DEV_BRANCH=develop   — branch śledzony przez staging (domyślnie develop)
#   APP_DIR=~/projects/zuzel-dev

REPO_URL="${REPO_URL:-https://github.com/hpk-pl/zuzel.git}"
APP_DIR="${APP_DIR:-$HOME/projects/zuzel-dev}"
DEV_BRANCH="${DEV_BRANCH:-develop}"
SERVICE_NAME="zuzel-dev"
PORT=3083
DOMAIN="zuzel-dev.hpkgrupa.pl"
PROD_DIR="$HOME/projects/zuzel"

if [[ "$(realpath "$APP_DIR" 2>/dev/null || echo "$APP_DIR")" == "$(realpath "$PROD_DIR")" ]]; then
  echo "Błąd: APP_DIR nie może być katalogiem produkcyjnym $PROD_DIR"
  exit 1
fi

echo "==> Instancja dev: $APP_DIR (branch: $DEV_BRANCH)"
echo "==> Produkcja pozostaje w: $PROD_DIR (bez restartu zuzel/playclub w tym skrypcie)"

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "==> Klonowanie repozytorium do $APP_DIR..."
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

echo "==> Pobieranie brancha $DEV_BRANCH..."
git fetch origin
if ! git show-ref --verify --quiet "refs/remotes/origin/${DEV_BRANCH}"; then
  echo ""
  echo "Błąd: na GitHub brak brancha origin/${DEV_BRANCH}."
  echo "Utwórz go raz (lokalnie lub na GitHub):"
  echo "  git push origin main:${DEV_BRANCH}"
  exit 1
fi
git checkout "$DEV_BRANCH"
git pull --ff-only origin "$DEV_BRANCH"

echo "==> Instalacja zależności npm..."
npm install --production

echo "==> Instalacja usługi systemd (${SERVICE_NAME})..."
sudo cp deploy/zuzel-dev.service /etc/systemd/system/${SERVICE_NAME}.service
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"

echo "==> Instalacja nginx (${DOMAIN})..."
sudo mkdir -p /var/www/certbot/.well-known/acme-challenge
sudo cp deploy/nginx-zuzel-dev.hpkgrupa.pl.conf "/etc/nginx/sites-available/${DOMAIN}"
sudo ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "==> Status usługi dev:"
sudo systemctl --no-pager status "${SERVICE_NAME}" | head -15

echo ""
echo "Gotowe (staging dev)."
echo "  Gra:    http://${DOMAIN}/"
echo "  Health: curl http://127.0.0.1:${PORT}/health"
echo ""
echo "DNS (jeśli jeszcze brak rekordu A): zuzel-dev → IP serwera Hetzner"
echo "SSL: sudo certbot --nginx -d ${DOMAIN}"
echo ""
echo "Aktualizacje po pushu na ${DEV_BRANCH}:"
echo "  cd ~/projects/zuzel && git pull && ./deploy/dev-update.sh"
echo ""
echo "Produkcja playclub.pl NIE została zrestartowana."
