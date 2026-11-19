#!/usr/bin/env bash
# Assemble la plateforme de contrôle dans admin/dist.
# Elle réutilise les modules et la charte de l'Académie (dossier web) sans les dupliquer.
# Cloudflare Pages : commande de build « bash admin/build.sh », dossier de sortie « admin/dist ».
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist
mkdir -p dist/js dist/assets
cp index.html config.js _headers dist/
cp js/*.js dist/js/
cp ../web/js/api.js ../web/js/md.js ../web/js/ui.js dist/js/
cp ../web/assets/tokens.css ../web/assets/app.css ../web/assets/logo.png ../web/assets/favicon.png dist/assets/
cp assets/admin.css dist/assets/
echo "Plateforme de contrôle prête dans admin/dist"
