#!/usr/bin/env bash
# Presents a test role credential, through the stub verifier, for the login
# that is waiting in a browser (the guard's login page shows the QR code and
# polls): stands in for a wallet in the local test setup.
#
# Usage: services/guard/local/present.sh [ROLE...]     (default: data_analyst)
# Env:   BASE (default http://localhost:8444), ORG, ISSUER, HOLDER (defaults:
#        the local policy data's test organisation and issuer)
set -euo pipefail
BASE="${BASE:-http://localhost:8444}"
roles="$(printf '%s\n' "${@:-data_analyst}" | jq -R . | jq -sc .)"
state="$(curl -sf "${BASE}/stub/pending" | jq -r .state)" \
    || { echo "no login is waiting: open the application (or the guard's login page) first" >&2; exit 1; }
jq -cn --arg s "${state}" --argjson r "${roles}" \
    --arg o "${ORG:-did:web:org-a.local.test}" --arg i "${ISSUER:-did:web:issuer.local.test}" \
    --arg h "${HOLDER:-did:key:z6MkLocalTestHolder}" \
    '{state: $s, roles: $r, org_did: $o, issuer: $i, holder: $h, purposes: ["analytics", "ai_insight"]}' \
  | curl -sf -o /dev/null -X POST -H 'content-type: application/json' --data @- "${BASE}/stub/present"
echo "presented roles ${roles} for the waiting login: the browser continues within a few seconds"
