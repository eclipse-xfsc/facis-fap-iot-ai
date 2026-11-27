#!/usr/bin/env bash
# End-to-end check of the guard installed by up.sh: real OAuth2 logins
# (authorization code + PKCE) through Hydra and the login provider, with the
# stub verifier playing the wallet's presentation.
#
#   1. a valid presentation logs in: the access token is a JWT signed with the
#      guard's JWKS, issuer http://localhost:8444/, 5 minutes, no refresh
#      token, subject = holder DID, org_did/roles/purpose from the credential,
#      audience of the application; the ID token carries name and email
#   2. refused: revoked credential, issuer not trusted, role not allowed for
#      the application, wrong nonce, credential of another holder
#   3. five refusals lock the address out (429); an administrator lists and
#      lifts the lockout, and a login works again
#   4. a malformed login challenge, and the admin API not routed outside
#
# Usage: services/guard/local/e2e.sh                  run the checks
#        services/guard/local/e2e.sh --token ROLE [CLIENT]
#                                   print one access token (for other local tests)
# Env:   BASE (default http://localhost:8444), KUBE_CONTEXT, NAMESPACE (as up.sh)
#        PRESENT_CMD   present through a wallet instead of the stub verifier:
#                      called as  $PRESENT_CMD <openid4vp-link> <case-json>
#                      (case: roles, revoked, issuer, tamper...); exit 0 when it
#                      presented, 4 when the verifier refused the presentation
#                      (a refusal), 3 when it cannot play that case (skipped)
#        E2E_KEEP_STATE=1  do not restart the login provider first (by default the
#                      check starts from a fresh one: attempts and lockout counts
#                      are held in its memory, and leftovers of an earlier run
#                      would lock the test out)
#        E2E_ISSUER, E2E_ORG, E2E_HOLDER   with PRESENT_CMD only: the wallet
#                      credential's issuer, organisation and holder DID; without
#                      E2E_HOLDER, the subject is only checked to be a DID.
#                      Without PRESENT_CMD (the stub) they are ignored: the stub's
#                      values match the local policy data (policy-data/)
# Needs: curl, jq, openssl, opa, kubectl.
set -euo pipefail

BASE="${BASE:-http://localhost:8444}"
ns="${NAMESPACE:-guard-local}"
ctx="${KUBE_CONTEXT:-$(kubectl config current-context)}"
REDIRECT="${BASE}/callback"
STUB=$([ -n "${PRESENT_CMD:-}" ] || echo 1)
if [ -n "${STUB}" ]; then
    if [ -n "${E2E_ISSUER:-}${E2E_ORG:-}${E2E_HOLDER:-}" ]; then
        echo "note: E2E_ISSUER, E2E_ORG and E2E_HOLDER are ignored without PRESENT_CMD (the stub uses its own)"
    fi
    ISSUER_DID=did:web:issuer.local.test ORG=did:web:org-a.local.test HOLDER=did:key:z6MkLocalTestHolder
else
    ISSUER_DID="${E2E_ISSUER:-did:web:issuer.local.test}"
    ORG="${E2E_ORG:-did:web:org-a.local.test}"
    HOLDER="${E2E_HOLDER:-}"
fi
work="$(mktemp -d)"; trap 'rm -rf "${work}"; [ -n "${pf:-}" ] && kill "${pf}" 2>/dev/null || true' EXIT
pass=0; fail=0; skipped=0
skip() { echo "  skip  $1"; skipped=$((skipped + 1)); }
ok()  { echo "  ok    $1"; pass=$((pass + 1)); }
bad() { echo "  FAIL  $1"; fail=$((fail + 1)); }
for t in curl jq openssl opa kubectl; do command -v "$t" >/dev/null || { echo "missing: $t" >&2; exit 2; }; done
curl -sf --max-time 20 -o /dev/null "${BASE}/.well-known/openid-configuration" || { echo "the guard does not answer on ${BASE}: run up.sh first" >&2; exit 2; }

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt_payload() { local p; p="$(cut -d. -f2 <<<"$1" | tr '_-' '/+')"; while [ $(( ${#p} % 4 )) -ne 0 ]; do p="${p}="; done; base64 -d <<<"${p}" 2>/dev/null || true; }
urldecode() { local s="${1//+/ }"; printf '%b' "${s//%/\\x}"; }
# A failed or timed-out request never ends the script: it yields an empty value
# or a state that the checks then report as a failure.
location() { curl -s --max-time 20 -b "${work}/jar" -c "${work}/jar" -o /dev/null -w '%{redirect_url}' "$1" || true; }

# login CLIENT PRESENT_JSON -> sets LOGIN_STATE (done|refused|...), CODE, VERIFIER
login() {
    local client="$1" present="$2" verifier challenge auth url html id link state s
    rm -f "${work}/jar"
    VERIFIER="$(openssl rand 32 | b64url)"
    challenge="$(printf '%s' "${VERIFIER}" | openssl dgst -sha256 -binary | b64url)"
    auth="${BASE}/oauth2/auth?response_type=code&client_id=${client}&redirect_uri=$(jq -rn --arg u "${REDIRECT}" '$u|@uri')"
    auth="${auth}&scope=openid&audience=facis-ai-insight&state=$(openssl rand -hex 8)&nonce=$(openssl rand -hex 8)"
    auth="${auth}&code_challenge=${challenge}&code_challenge_method=S256"
    url="$(location "${auth}")"
    LOGIN_HTTP="$(curl -s --max-time 20 -b "${work}/jar" -c "${work}/jar" -o "${work}/page.html" -w '%{http_code}' "${url}" || true)"
    LOGIN_STATE=""; CODE=""
    [ "${LOGIN_HTTP}" = 200 ] || { LOGIN_STATE="page-${LOGIN_HTTP}"; return 0; }
    html="$(cat "${work}/page.html")"
    id="$(grep -o 'var id="[0-9a-f]\{64\}"' <<<"${html}" | cut -d'"' -f2)"
    link="$(grep -o 'href="openid4vp://[^"]*"' <<<"${html}" | head -1 | cut -d'"' -f2 | sed 's/&amp;/\&/g')"
    state="$(urldecode "$(sed -n 's/.*request_uri=\([^&]*\).*/\1/p' <<<"${link}")" | sed -n 's#.*/proof/\([^/]*\)/request-object.*#\1#p')"
    [ -n "${id}" ] && [ -n "${state}" ] || { LOGIN_STATE="page-unreadable"; return 0; }
    if [ -n "${STUB}" ]; then
        curl -sf --max-time 20 -o /dev/null -X POST -H 'content-type: application/json' "${BASE}/stub/present" \
            -d "$(jq -c --arg s "${state}" '. + {state: $s}' <<<"${present}")" || { LOGIN_STATE=stub-unreachable; return 0; }
    else
        local rc=0
        # the wallet reports on stderr: stdout carries only --token's token
        "${PRESENT_CMD}" "${link}" "${present}" >&2 || rc=$?
        [ "${rc}" = 3 ] && { LOGIN_STATE=unsupported; return 0; }
        [ "${rc}" = 4 ] && { LOGIN_STATE=refused-by-verifier; return 0; }
        [ "${rc}" = 0 ] || { LOGIN_STATE="wallet-failed-${rc}"; return 0; }
    fi
    for _ in $(seq 1 20); do
        s="$(curl -s --max-time 20 "${BASE}/guard/login/status?attempt=${id}" || true)"
        LOGIN_STATE="$(jq -r .state <<<"${s}" 2>/dev/null || echo status-unreadable)"
        [ "${LOGIN_STATE}" = pending ] || break
        sleep 1
    done
    [ "${LOGIN_STATE}" = done ] || return 0
    url="$(jq -r .redirect_to <<<"${s}")"
    for _ in 1 2 3 4; do      # authorization server -> consent -> authorization server -> callback
        url="$(location "${url}")"
        case "${url}" in "${REDIRECT}"*) break ;; esac
    done
    CODE="$(sed -n 's/.*[?&]code=\([^&]*\).*/\1/p' <<<"${url}")"
}
present() { # roles-json [extra-json]
    # the stub mints whatever it is told; a wallet only gets the roles and the
    # case (issuer, organisation and holder are those of its real credential)
    if [ -n "${STUB}" ]; then
        jq -cn --argjson r "$1" --argjson x "${2:-{\}}" --arg i "${ISSUER_DID}" --arg o "${ORG}" --arg h "${HOLDER}" \
            '{roles: $r, issuer: $i, org_did: $o, holder: $h, purposes: ["analytics", "ai_insight"]} + $x'
    else
        jq -cn --argjson r "$1" --argjson x "${2:-{\}}" '{roles: $r} + $x'
    fi
}
token() { # client -> token response JSON
    curl -s --max-time 20 -X POST "${BASE}/oauth2/token" -d grant_type=authorization_code --data-urlencode "code=${CODE}" \
        --data-urlencode "redirect_uri=${REDIRECT}" -d client_id="$1" --data-urlencode "code_verifier=${VERIFIER}" || echo '{}'
}

if [ "${1:-}" = --token ]; then
    login "${3:-facis-local-test}" "$(present "[\"${2:?role}\"]")"
    [ "${LOGIN_STATE}" = done ] && [ -n "${CODE}" ] || { echo "login refused (${LOGIN_STATE})" >&2; exit 1; }
    token "${3:-facis-local-test}" | jq -r .access_token
    exit 0
fi

if [ "${E2E_KEEP_STATE:-}" != 1 ]; then
    echo "== 0. fresh login provider (no attempts, no lockout counts)"
    kubectl --context "${ctx}" -n "${ns}" rollout restart deployment/guard-login >/dev/null
    kubectl --context "${ctx}" -n "${ns}" rollout status deployment/guard-login --timeout 180s >/dev/null
    # a malformed challenge answers 400 as soon as the login provider is up with
    # a valid configuration, without asking the authorization server
    up=""
    for _ in $(seq 1 60); do
        [ "$(curl -s --max-time 20 -o /dev/null -w '%{http_code}' "${BASE}/guard/login?login_challenge=%21")" = 400 ] && { up=1; break; }
        sleep 2
    done
    [ -n "${up}" ] || { echo "the login provider does not answer after its restart" >&2; exit 1; }
fi

echo "== 1. a valid presentation logs in"
login facis-ai-insight-ui "$(present '["data_analyst"]')"
if [ "${LOGIN_STATE}" = done ] && [ -n "${CODE}" ]; then
    ok "login accepted, authorization code issued"
    tr="$(token facis-ai-insight-ui)"
    at="$(jq -r .access_token <<<"${tr}")"
    [ "$(jq -r '.refresh_token // empty' <<<"${tr}")" = "" ] && ok "no refresh token" || bad "a refresh token was issued"
    curl -s --max-time 20 "${BASE}/.well-known/jwks.json" > "${work}/jwks.json" || echo '{}' > "${work}/jwks.json"
    jq -n --arg t "${at}" --slurpfile k "${work}/jwks.json" '{t: $t, jwks: ($k[0] | tostring)}' > "${work}/in.json"
    v="$(opa eval -I --format raw 'io.jwt.decode_verify(input.t, {"cert": input.jwks, "iss": "http://localhost:8444/", "aud": "facis-ai-insight"})' < "${work}/in.json")"
    [ "$(jq -r '.[0]' <<<"${v}")" = true ] && ok "access token signature, issuer and audience verified against the JWKS" || bad "access token does not verify: ${v}"
    p="$(jq '.[2]' <<<"${v}")"
    if [ -n "${HOLDER}" ]; then
        [ "$(jq -r .sub <<<"${p}")" = "${HOLDER}" ] && ok "subject is the holder DID" || bad "sub $(jq -r .sub <<<"${p}")"
    else
        jq -e '.sub | startswith("did:")' >/dev/null <<<"${p}" && ok "subject is a DID ($(jq -r .sub <<<"${p}"))" || bad "sub $(jq -r .sub <<<"${p}")"
    fi
    jq -e --arg o "${ORG}" '.org_did == $o and .roles == ["data_analyst"] and (.purpose | type) == "array"' >/dev/null <<<"${p}" \
        && ok "org_did, roles and purpose at the top level, from the credential" || bad "claims $(jq -c . <<<"${p}")"
    if [ -n "${STUB}" ]; then
        jq -e '.purpose == ["analytics", "ai_insight"]' >/dev/null <<<"${p}" && ok "purposes as presented" || bad "purpose $(jq -c .purpose <<<"${p}")"
    fi
    # 5 minutes; exp and iat are rounded to the second at slightly different
    # moments, so allow a few seconds (a wrong setting, 1 hour, still fails)
    life="$(jq '.exp - .iat' <<<"${p}")"
    [ "${life}" -ge 290 ] && [ "${life}" -le 305 ] && ok "access token lives 5 minutes (${life}s)" || bad "lifetime ${life}s"
    it="$(jwt_payload "$(jq -r .id_token <<<"${tr}")")"
    if [ -n "${STUB}" ]; then
        jq -e '.name == "Local Test" and .email == "local.test@example.org" and .roles == ["data_analyst"]' >/dev/null 2>&1 <<<"${it}" \
            && ok "ID token carries name, email and the roles" || bad "ID token claims ${it}"
    else
        jq -e '(.name | type) == "string" and .roles == ["data_analyst"]' >/dev/null 2>&1 <<<"${it}" \
            && ok "ID token carries the name and the roles" || bad "ID token claims ${it}"
    fi
    jq -e 'has("name") | not' >/dev/null <<<"${p}" && ok "name and email stay out of the access token" || bad "display claims in the access token"
else
    bad "valid presentation not accepted (${LOGIN_STATE})"
fi

echo "== 2. refusals (each one counts toward the lockout)"
check_refused() { # name client roles-json [extra-json]
    login "$2" "$(present "$3" "${4:-}")"
    if [ "${LOGIN_STATE}" = unsupported ]; then skip "$1 (the wallet cannot play this case)"; return 0; fi
    if [ "${LOGIN_STATE}" = refused-by-verifier ]; then ok "$1 -> refused by the verifier"; return 0; fi
    [ "${LOGIN_STATE}" = refused ] && [ -z "${CODE}" ] && { ok "$1 -> refused"; refusals=$((refusals + 1)); } || bad "$1 -> ${LOGIN_STATE}"
}
refusals=0
check_refused "revoked credential" facis-ai-insight-ui '["data_analyst"]' '{"revoked": true}'
check_refused "issuer not trusted" facis-ai-insight-ui '["data_analyst"]' '{"issuer": "did:web:untrusted.local.test"}'
check_refused "role not allowed for the application" facis-ai-insight-ui '["operator"]'
check_refused "wrong nonce" facis-ai-insight-ui '["data_analyst"]' '{"tamper": "nonce"}'
check_refused "credential of another holder" facis-ai-insight-ui '["data_analyst"]' '{"tamper": "holder"}'

echo "== 3. lockout"
if [ "${refusals}" -lt 5 ]; then
    skip "lockout: only ${refusals} refusals could be played"
else
login facis-ai-insight-ui "$(present '["data_analyst"]')"
[ "${LOGIN_STATE}" = page-429 ] && ok "after five refusals the next login is paused (429)" || bad "no lockout (${LOGIN_STATE})"
kubectl --context "${ctx}" -n "${ns}" get secret guard-login-local -o jsonpath='{.data.admin-token}' | base64 -d > "${work}/admin"
kubectl --context "${ctx}" -n "${ns}" port-forward svc/guard-login 18800:1880 > /dev/null 2>&1 & pf=$!
for _ in $(seq 1 20); do curl -s --max-time 20 -o /dev/null http://localhost:18800/guard/health && break; sleep 0.5; done
ah="Authorization: Bearer $(cat "${work}/admin")"
keys="$(curl -s --max-time 20 -H @<(printf '%s' "${ah}") http://localhost:18800/guard/admin/lockouts | jq -r '.lockouts[].key' 2>/dev/null || true)"
[ -n "${keys}" ] && ok "lockouts listed: $(tr '\n' ' ' <<<"${keys}" | sed 's/did:key:[^ ]*/<holder>/')" || bad "no lockout listed"
for key in ${keys}; do curl -s --max-time 20 -o /dev/null -X DELETE -H @<(printf '%s' "${ah}") "http://localhost:18800/guard/admin/lockouts?key=$(jq -rn --arg k "${key}" '$k|@uri')"; done
[ "$(curl -s --max-time 20 -o /dev/null -w '%{http_code}' http://localhost:18800/guard/admin/lockouts)" = 401 ] && ok "lockout endpoints need the admin token" || bad "lockout endpoints open"
login facis-ai-insight-ui "$(present '["data_analyst"]')"
[ "${LOGIN_STATE}" = done ] && ok "lockout lifted, login works again" || bad "after lifting: ${LOGIN_STATE}"
fi

echo "== 4. edge cases"
[ "$(curl -s --max-time 20 -o /dev/null -w '%{http_code}' "${BASE}/guard/login?login_challenge=%3Cbad%3E")" = 400 ] && ok "malformed login challenge -> 400" || bad "malformed challenge accepted"
[ "$(curl -s --max-time 20 -o /dev/null -w '%{http_code}' "${BASE}/admin/clients")" = 404 ] && ok "authorization server admin API not routed" || bad "admin API reachable from outside"
[ "$(curl -s --max-time 20 -o /dev/null -w '%{http_code}' "${BASE}/guard/admin/lockouts")" = 404 ] && ok "lockout endpoints not routed" || bad "lockout endpoints reachable from outside"

echo; echo "${pass} passed, ${fail} failed, ${skipped} skipped"
[ "${fail}" = 0 ]
