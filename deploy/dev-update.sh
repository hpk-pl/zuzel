#!/usr/bin/env bash
set -euo pipefail

# Aktualizacja tylko instancji dev (branch develop). Nie restartuje zuzel ani playclub.
#
# Uruchom na serwerze jako deploy:
#   cd ~/projects/zuzel-dev && ./deploy/staging-deploy.sh
#   — albo z klonu prod (skrypty): cd ~/projects/zuzel && ./deploy/dev-update.sh
#
# Po pushu na develop: GitHub Actions (.github/workflows/deploy-staging.yml)
#
# Opcjonalnie: DEV_BRANCH=feature/xyz ./deploy/dev-update.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

APP_DIR="${APP_DIR:-$HOME/projects/zuzel-dev}"
DEV_BRANCH="${DEV_BRANCH:-develop}"
SERVICE_NAME="zuzel-dev"
PORT=3083
PROD_DIR="$HOME/projects/zuzel"

if [[ "$(realpath "$REPO_ROOT")" != "$(realpath "$PROD_DIR")" ]]; then
  APP_DIR="$(realpath "$REPO_ROOT")"
fi

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
npm install --omit=dev
sudo systemctl restart "${SERVICE_NAME}"

echo ""
echo "Gotowe. Health: curl http://127.0.0.1:${PORT}/health"
echo "Produkcja (playclub / zuzel): bez zmian — restart tylko ${SERVICE_NAME}."
