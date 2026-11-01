#!/usr/bin/env bash
set -euo pipefail

# Aktualizacja tylko instancji dev (branch develop). Nie restartuje zuzel ani playclub.
#
# Uruchom na serwerze jako deploy:
#   cd ~/projects/zuzel && git pull   # żeby mieć najnowszy dev-update.sh
#   ./deploy/dev-update.sh
#
# Opcjonalnie: DEV_BRANCH=feature/xyz ./deploy/dev-update.sh

APP_DIR="${APP_DIR:-$HOME/projects/zuzel-dev}"
DEV_BRANCH="${DEV_BRANCH:-develop}"
SERVICE_NAME="zuzel-dev"
PORT=3083
PROD_DIR="$HOME/projects/zuzel"

if [[ "$(realpath "$APP_DIR")" == "$(realpath "$PROD_DIR")" ]]; then
  echo "Błąd: odmowa — APP_DIR wskazuje katalog produkcyjny."
  exit 1
fi

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "Błąd: brak $APP_DIR — najpierw uruchom ./deploy/dev-install.sh"
  exit 1
fi

cd "$APP_DIR"
echo "==> Aktualizacja dev: $(pwd) ← origin/${DEV_BRANCH}"
git fetch origin
git checkout "$DEV_BRANCH"
git pull --ff-only origin "$DEV_BRANCH"
npm install --production
sudo systemctl restart "${SERVICE_NAME}"

echo ""
echo "Gotowe. Health: curl http://127.0.0.1:${PORT}/health"
echo "Produkcja (playclub / zuzel): bez zmian — restart tylko ${SERVICE_NAME}."
