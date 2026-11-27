#!/usr/bin/env bash
# Deletes the local W-Stack's kind cluster (up.sh). The local CA and the
# patched chart copies in WSTACK_STATE_DIR are kept unless --purge is given.
#
# Usage: infrastructure/wstack/local/down.sh [--purge]
# Settings: as up.sh (settings.example.env).
set -Eeuo pipefail
# shellcheck source=lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
case "${WSTACK_CONTEXT}" in
    kind-*) ;;
    *) echo "FAIL: down.sh only deletes kind clusters (context ${WSTACK_CONTEXT})" >&2; exit 2 ;;
esac
command -v kind >/dev/null || { echo "FAIL: missing tool: kind" >&2; exit 1; }
if kind get clusters 2>/dev/null | grep -qx "${WSTACK_CLUSTER}"; then
    kind delete cluster --name "${WSTACK_CLUSTER}"
else
    echo "no kind cluster ${WSTACK_CLUSTER}"
fi
if [ "${1:-}" = --purge ]; then
    rm -rf "${WSTACK_STATE_DIR}" && echo "removed ${WSTACK_STATE_DIR}"
fi
