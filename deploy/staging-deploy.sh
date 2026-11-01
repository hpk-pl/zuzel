#!/usr/bin/env bash
# Samodzielne wdrożenie stagingu (develop → zuzel-dev.hpkgrupa.pl).
# Uruchom na serwerze jako deploy:
#   cd ~/projects/zuzel-dev && ./deploy/staging-deploy.sh
#
# Wymaga sudoers: NOPASSWD tylko dla `systemctl restart zuzel-dev`
# (patrz deploy/sudoers-staging-deploy.example)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/dev-update.sh"
