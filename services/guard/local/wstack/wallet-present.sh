#!/usr/bin/env bash
# PRESENT_CMD for e2e.sh at level 2: presents with test-wallet.js, and first has
# the W-Stack issue a credential with the case's roles when the wallet has none.
# Usage (by e2e.sh): wallet-present.sh <openid4vp-link> <case-json>
# Env: as issue.sh and test-wallet.js
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
link="$1"; case_json="${2:-{\}}"
roles="$(jq -c '.roles // ["data_analyst"]' <<<"${case_json}")"
if ! node "${here}/../test-wallet.js" has "${roles}"; then
    "${here}/issue.sh" "${roles}" >&2
fi
exec node "${here}/../test-wallet.js" present "${link}" "${case_json}"
