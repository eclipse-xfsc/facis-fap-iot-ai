#!/usr/bin/env bash
# Local check of the AI Insight service's authorization with real access
# tokens of the guard (services/guard): the service's flows, in a throwaway
# ORCE container built from this directory, verify tokens issued by the local
# guard (services/guard/local/up.sh). A local check, not a deployment test.
#
# Checks, with real tokens on the real flows:
#   1. no token -> 401; a forged x-user-roles header alone -> 401
#   2. a guard token whose roles hold none of the required roles -> 403
#   3. a guard token with data_analyst passes the gate (any status but
#      400/401/403: Trino is not there locally, so the insight itself may fail)
#   4. the default roles claim is the guard's (roles); set to Keycloak's
#      (realm_access.roles), the same token carries no roles -> 403
#   5. AI_INSIGHT_POLICY__REQUIRED_ROLES='["operator"]' replaces the default
#
# Needs: docker, curl, jq; the guard up on http://localhost:8444
# (services/guard/local/up.sh, see services/guard/local/README.md).
# Usage: services/ai-insight-service/orce/local/guard-roles-check.sh
# Env:   GUARD (default http://localhost:8444), PORT (default 1881),
#        KUBE_CONTEXT, NAMESPACE (of the local guard, as up.sh)
#        With the guard pointed at a W-Stack (level 2), the tokens come from the
#        test wallet: set PRESENT_CMD to the absolute path of
#        services/guard/local/wstack/wallet-present.sh, with the level-2
#        settings sourced (see services/guard/local/README.md, Part B)
# Creates the container facis-ai-insight-check (host network, port PORT),
# removed at the end.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
orce="$(cd "${here}/.." && pwd)"
repo="$(cd "${orce}/../../.." && pwd)"
GUARD="${GUARD:-http://localhost:8444}"
PORT="${PORT:-1881}"
NAME=facis-ai-insight-check
IMAGE=facis-ai-insight-orce:local-check
BASE="http://localhost:${PORT}"
SCOPE=(-H 'x-agreement-id: agreement-1' -H 'x-asset-id: asset-7' -H 'content-type: application/json')
# A valid request: the endpoint checks the body before the token, so an empty
# body would answer 400 whatever the token.
REQ='{"start_ts":"2026-11-01T00:00:00Z","end_ts":"2026-11-02T00:00:00Z"}'
body="$(mktemp)"; trap 'rm -f "${body}"; docker rm -f "${NAME}" >/dev/null 2>&1 || true' EXIT
pass=0; fail=0
ok()  { echo "  ok    $1"; pass=$((pass + 1)); }
bad() { echo "  FAIL  $1"; fail=$((fail + 1)); }

for t in docker curl jq; do command -v "$t" >/dev/null || { echo "missing: $t" >&2; exit 2; }; done
curl -sf -o /dev/null "${GUARD}/.well-known/openid-configuration" \
    || { echo "the guard does not answer on ${GUARD}: run ${repo}/services/guard/local/up.sh first" >&2; exit 2; }
[ -x "${repo}/services/guard/local/e2e.sh" ] || { echo "services/guard is missing from this checkout" >&2; exit 2; }

guard_token() { "${repo}/services/guard/local/e2e.sh" --token "$1" facis-local-test; }

echo "== build ${IMAGE} from ${orce#"${repo}/"}"
docker build --progress=plain -t "${IMAGE}" "${orce}" > "${body}.build" 2>&1 \
    || { tail -30 "${body}.build" >&2; exit 1; }
rm -f "${body}.build"

start() { # extra -e flags
    docker rm -f "${NAME}" >/dev/null 2>&1 || true
    docker run -d --name "${NAME}" --network host -e PORT="${PORT}" \
        -e AI_INSIGHT_AUTH__ISSUER="${GUARD}/" \
        -e AI_INSIGHT_AUTH__JWKS_URL="${GUARD}/.well-known/jwks.json" \
        -e AI_INSIGHT_AUTH__AUDIENCE=facis-ai-insight \
        -e AI_INSIGHT_RATE_LIMIT__ENABLED=false \
        "$@" "${IMAGE}" >/dev/null
    for _ in $(seq 1 90); do
        curl -sf -o /dev/null "${BASE}/api/v1/health" && return 0
        sleep 2
    done
    echo "ORCE did not come up; last logs:" >&2; docker logs --tail 40 "${NAME}" >&2; exit 1
}
call() { # [token] -> http status of the anomaly report
    local h=()
    [ -n "${1:-}" ] && h=(-H "Authorization: Bearer $1")
    curl -s --max-time 40 -o "${body}" -w '%{http_code}' -X POST "${BASE}/api/v1/insights/anomaly-report" "${SCOPE[@]}" "${h[@]}" -d "${REQ}"
}
passes_gate() { [ "$1" != 401 ] && [ "$1" != 403 ] && [ "$1" != 400 ] && [ "$1" != 000 ]; }   # 400: the request itself was refused

# Guard tokens live 5 minutes: each phase takes fresh ones after the restart.
echo "== defaults: roles from the guard's top-level roles claim, any one of the schema roles"
start
T_ANALYST="$(guard_token data_analyst)"; T_OPERATOR="$(guard_token operator)"
s=$(call); [ "$s" = 401 ] && ok "no token -> 401" || bad "no token -> $s"
s=$(curl -s --max-time 40 -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/v1/insights/anomaly-report" "${SCOPE[@]}" -H 'x-user-roles: administrator' -d "${REQ}")
[ "$s" = 401 ] && ok "forged x-user-roles alone -> 401" || bad "forged header -> $s"
s=$(call "${T_OPERATOR}"); [ "$s" = 403 ] && grep -q 'none of the required roles' "${body}" \
    && ok "operator token -> 403 (none of the required roles)" || bad "operator token -> $s $(cat "${body}")"
s=$(call "${T_ANALYST}"); passes_gate "$s" && ok "data_analyst token passes the gate (HTTP $s)" || bad "data_analyst token -> $s $(cat "${body}")"

echo "== AI_INSIGHT_AUTH__ROLES_CLAIM=realm_access.roles (Keycloak's layout) finds no roles in a guard token"
start -e AI_INSIGHT_AUTH__ROLES_CLAIM=realm_access.roles
T_ANALYST="$(guard_token data_analyst)"
s=$(call "${T_ANALYST}"); [ "$s" = 403 ] && ok "data_analyst token -> 403 with the Keycloak roles claim" || bad "Keycloak roles claim -> $s"

echo "== AI_INSIGHT_POLICY__REQUIRED_ROLES='[\"operator\"]'"
start -e 'AI_INSIGHT_POLICY__REQUIRED_ROLES=["operator"]'
T_ANALYST="$(guard_token data_analyst)"; T_OPERATOR="$(guard_token operator)"
s=$(call "${T_OPERATOR}"); passes_gate "$s" && ok "operator passes with the configured list (HTTP $s)" || bad "configured list, operator -> $s"
s=$(call "${T_ANALYST}"); [ "$s" = 403 ] && ok "data_analyst refused with the configured list" || bad "configured list, analyst -> $s"

echo; echo "${pass} passed, ${fail} failed"
[ "${fail}" = 0 ]
