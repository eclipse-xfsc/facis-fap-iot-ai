#!/usr/bin/env bash
# =============================================================================
# build-and-package.sh
# Build the FACIS AI Insight Vue SPA and package the output for Helm deployment.
#
# Usage:
#   ./scripts/build-and-package.sh [--skip-install]
#
# What it does:
#   1. Installs npm dependencies (unless --skip-install is passed)
#   2. Runs `npm run build` (vite build) — outputs to ui/app/dist/
#   3. Copies dist/* into helm/facis-ai-insight-ui/files/ui/
#      so `helm package` / `helm upgrade` can embed the built files via .Files.Get
#
# After this script runs, deploy with:
#   helm upgrade <release> helm/facis-ai-insight-ui \
#     -n <namespace> \
#     -f helm/facis-ai-insight-ui/values.yaml
#
# For CI/CD pipelines that cannot bundle large assets into the chart, use:
#   helm upgrade ... \
#     --set-file uiFiles.inline.indexHtml=ui/app/dist/index.html
#   Then mount the full dist/ directory via a separate ConfigMap or PVC.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_ROOT="$SCRIPT_DIR/.."
APP_DIR="$SERVICE_ROOT/ui/app"
HELM_UI_DIR="$SERVICE_ROOT/helm/facis-ai-insight-ui/files/ui"

SKIP_INSTALL=false
for arg in "$@"; do
  [[ "$arg" == "--skip-install" ]] && SKIP_INSTALL=true
done

echo "============================================"
echo " FACIS AI Insight UI — Build & Package"
echo "============================================"
echo "App dir  : $APP_DIR"
echo "Helm dir : $HELM_UI_DIR"
echo ""

# ── Step 1: Install dependencies ──────────────────────────────────────────────
cd "$APP_DIR"

if [[ "$SKIP_INSTALL" == false ]]; then
  echo "[1/3] Installing npm dependencies..."
  npm ci --prefer-offline
else
  echo "[1/3] Skipping npm install (--skip-install)"
fi

# ── Step 2: Build the Vue app ─────────────────────────────────────────────────
echo "[2/3] Building Vue app (vite build)..."
npm run build

BUILD_SIZE=$(du -sh dist 2>/dev/null | cut -f1)
echo "      Build complete. Output size: ${BUILD_SIZE}"

# ── Step 3: Copy to Helm chart files directory ────────────────────────────────
echo "[3/3] Copying dist/* to Helm chart files directory..."
rm -rf "$HELM_UI_DIR"
mkdir -p "$HELM_UI_DIR"
cp -r dist/* "$HELM_UI_DIR/"

ASSET_COUNT=$(find "$HELM_UI_DIR" -type f | wc -l | tr -d ' ')
echo "      Copied ${ASSET_COUNT} files to $HELM_UI_DIR"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo " Build complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  helm upgrade <release> $SERVICE_ROOT/helm/facis-ai-insight-ui \\"
echo "    -n <namespace> \\"
echo "    -f $SERVICE_ROOT/helm/facis-ai-insight-ui/values.yaml"
echo ""
echo "Or to just update the ConfigMap:"
echo "  kubectl create configmap ai-insight-ui-files \\"
echo "    --from-file=index.html=$APP_DIR/dist/index.html \\"
echo "    -n <namespace> --dry-run=client -o yaml | kubectl apply -f -"
