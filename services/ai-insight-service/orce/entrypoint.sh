#!/usr/bin/env bash
set -Eeuo pipefail

TARGET="/data/node_modules"
mkdir -p "${TARGET}"

# ── A. Load bundled runtime env/certs (if present) ───────────────────
RUNTIME_DIR="/opt/ai-insight-runtime"
RUNTIME_ENV_FILE="${RUNTIME_DIR}/.env"
RUNTIME_CERTS_DIR="${RUNTIME_DIR}/certs"
APP_CERTS_DIR="/app/certs"

if [ -f "${RUNTIME_ENV_FILE}" ]; then
    echo "[entrypoint] Loading bundled runtime environment from ${RUNTIME_ENV_FILE}"
    set -a
    # shellcheck disable=SC1090
    . "${RUNTIME_ENV_FILE}"
    set +a
fi

if [ -d "${RUNTIME_CERTS_DIR}" ] && [ "$(ls -A "${RUNTIME_CERTS_DIR}" 2>/dev/null | wc -l | tr -d ' ')" -gt 0 ]; then
    mkdir -p "${APP_CERTS_DIR}"
    cp -a "${RUNTIME_CERTS_DIR}/." "${APP_CERTS_DIR}/" 2>/dev/null || true
    chmod -R a+r "${APP_CERTS_DIR}" 2>/dev/null || true
    echo "[entrypoint] Runtime certificates prepared at ${APP_CERTS_DIR}"

    if [ -z "${NODE_EXTRA_CA_CERTS:-}" ] && [ -f "${APP_CERTS_DIR}/ca.crt" ]; then
        export NODE_EXTRA_CA_CERTS="${APP_CERTS_DIR}/ca.crt"
        echo "[entrypoint] NODE_EXTRA_CA_CERTS set to ${NODE_EXTRA_CA_CERTS}"
    fi
fi

# ── 0. Bootstrap /data from ORCE defaults if empty ───────────────────
if [ ! -f /data/settings.js ]; then
    ORCE_HOME="/opt/maestro/MBE/.node-red"
    echo "[entrypoint] First boot - seeding /data from ORCE defaults (${ORCE_HOME})"

    if [ -d "${ORCE_HOME}" ]; then
        for f in $(ls -1A "${ORCE_HOME}/" 2>/dev/null); do
            if [ "${f}" = "node_modules" ]; then
                continue
            fi
            if [ ! -e "/data/${f}" ]; then
                cp -a "${ORCE_HOME}/${f}" "/data/${f}"
                echo "[entrypoint]   copied ${f}"
            fi
        done
    else
        echo "[entrypoint] WARN: ${ORCE_HOME} not found, trying /home/user/.node-red/"
        for f in settings.js package.json flows.json flows_cred.json .config.nodes.json; do
            if [ -f "/home/user/.node-red/${f}" ]; then
                cp "/home/user/.node-red/${f}" "/data/${f}"
                echo "[entrypoint]   copied ${f}"
            fi
        done
    fi

    chown -R node-red:node-red /data/ 2>/dev/null || true
fi

# ── 1. Seed /data/flows.json from bundled flow exports ───────────────
FLOW_EXPORTS_DIR="/opt/ai-insight-flows"
if [ -d "${FLOW_EXPORTS_DIR}" ]; then
    node -e "
        const fs = require('fs');
        const path = '${FLOW_EXPORTS_DIR}';
        const files = fs.readdirSync(path)
            .filter((f) => f.endsWith('.json'))
            .sort();
        if (files.length === 0) {
            process.exit(0);
        }
        const merged = [];
        for (const file of files) {
            const full = path + '/' + file;
            const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
            if (!Array.isArray(parsed)) {
                throw new Error('flow file must export an array: ' + full);
            }
            merged.push(...parsed);
        }
        fs.writeFileSync('/data/flows.json', JSON.stringify(merged, null, 2) + '\n');
        console.log('[entrypoint] wrote /data/flows.json from ' + files.length + ' flow export(s)');
    "
fi

# ── 2. Ownership + handoff to original ORCE entrypoint ───────────────
chown -R node-red:node-red "${TARGET}" 2>/dev/null || true

exec /usr/src/node-red/entrypoint.sh "$@"
