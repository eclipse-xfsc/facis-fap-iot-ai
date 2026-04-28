#!/usr/bin/env bash
# Copy ORCE flow + dataset config files into the chart's files/ directory so
# Helm can bundle them into the orce-flows + orce-datasets ConfigMaps at
# render time.
#
# Run before `helm install/upgrade` whenever the source flow JSON or the
# datasets.json mirror changes.
#
# Usage:
#   cd services/dsp-connector/helm/facis-dsp-connector
#   ./sync-flows.sh
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCE_DIR="${SCRIPT_DIR}/../../orce"
FLOWS_DEST="${SCRIPT_DIR}/files/orce-flows"
CONFIG_DEST="${SCRIPT_DIR}/files/orce-config"

if [[ ! -d "${ORCE_DIR}/flows" ]]; then
    echo "error: ${ORCE_DIR}/flows not found" >&2
    exit 1
fi

mkdir -p "${FLOWS_DEST}" "${CONFIG_DEST}"

# Wipe stale copies first so removed flows don't linger in the ConfigMap.
find "${FLOWS_DEST}" -maxdepth 1 -type f -name '*.json' -delete
find "${CONFIG_DEST}" -maxdepth 1 -type f -name '*.json' -delete

cp -v "${ORCE_DIR}"/flows/*.json "${FLOWS_DEST}/"

if [[ -f "${ORCE_DIR}/config/datasets.json" ]]; then
    cp -v "${ORCE_DIR}/config/datasets.json" "${CONFIG_DEST}/datasets.json"
else
    echo "warn: ${ORCE_DIR}/config/datasets.json not found — catalogue tab will serve empty list" >&2
fi

echo
echo "Synced flows to ${FLOWS_DEST}"
ls -1 "${FLOWS_DEST}"/*.json | sed 's|.*/|  |'
echo
echo "Synced datasets to ${CONFIG_DEST}"
ls -1 "${CONFIG_DEST}"/*.json 2>/dev/null | sed 's|.*/|  |' || true
