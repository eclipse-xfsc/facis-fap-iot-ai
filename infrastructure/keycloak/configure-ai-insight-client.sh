#!/usr/bin/env bash
# Idempotently add the production redirect URI + web origin for the Vue
# UI served from ORCE/uibuilder at https://fap-iotai.facis.cloud/aiInsight/.
#
# Why:
#   The `facis-ai-insight` Keycloak client (in realm `facis`) was created
#   with localhost / dev-host redirect URIs only. After we moved the UI
#   into the ORCE pod, Keycloak rejected the post-login redirect with
#   "Invalid parameter: redirect_uri" until this entry was added.
#
# Behaviour:
#   - Reads the existing client config, takes the union of redirectUris /
#     webOrigins with the production values below, PUTs it back.
#   - No-op on second run (the union is the same set).
#
# Inputs (env vars, with defaults):
#   KEYCLOAK_BASE   default https://identity.facis.cloud
#   KEYCLOAK_REALM  default facis
#   KEYCLOAK_CLIENT default facis-ai-insight
#   KEYCLOAK_ADMIN_USER, KEYCLOAK_ADMIN_PASSWORD — required (master realm)
#
# Usage:
#   KEYCLOAK_ADMIN_USER=admin KEYCLOAK_ADMIN_PASSWORD=... \
#     bash infrastructure/keycloak/configure-ai-insight-client.sh
set -euo pipefail

KC_BASE="${KEYCLOAK_BASE:-https://identity.facis.cloud}"
REALM="${KEYCLOAK_REALM:-facis}"
CLIENT="${KEYCLOAK_CLIENT:-facis-ai-insight}"

: "${KEYCLOAK_ADMIN_USER:?KEYCLOAK_ADMIN_USER must be set (master realm admin)}"
: "${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD must be set}"

# Edit these to add more origins (e.g. staging hosts).
NEW_REDIRECT_URIS=(
  "https://fap-iotai.facis.cloud/aiInsight/*"
)
NEW_WEB_ORIGINS=(
  "https://fap-iotai.facis.cloud"
)

echo "[kc] obtaining master-realm admin token"
TOKEN=$(curl -sS --fail -X POST \
  "$KC_BASE/realms/master/protocol/openid-connect/token" \
  -d grant_type=password \
  -d client_id=admin-cli \
  -d "username=$KEYCLOAK_ADMIN_USER" \
  -d "password=$KEYCLOAK_ADMIN_PASSWORD" | \
  python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

echo "[kc] looking up client uuid for clientId=$CLIENT"
CLIENT_UUID=$(curl -sS --fail \
  -H "Authorization: Bearer $TOKEN" \
  "$KC_BASE/admin/realms/$REALM/clients?clientId=$CLIENT" | \
  python3 -c "import sys,json;c=json.load(sys.stdin);print(c[0]['id']) if c else sys.exit('client not found')")

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "[kc] fetching current client config ($CLIENT_UUID)"
curl -sS --fail -H "Authorization: Bearer $TOKEN" \
  "$KC_BASE/admin/realms/$REALM/clients/$CLIENT_UUID" \
  > "$TMP/client.json"

python3 - "$TMP/client.json" "$TMP/client-new.json" \
  "${NEW_REDIRECT_URIS[*]}" "${NEW_WEB_ORIGINS[*]}" <<'PY'
import json, sys
src, dst, redirs, origins = sys.argv[1:5]
c = json.load(open(src))
c['redirectUris'] = sorted(set(c.get('redirectUris') or []) | set(redirs.split()))
c['webOrigins']   = sorted(set(c.get('webOrigins')   or []) | set(origins.split()))
json.dump(c, open(dst, 'w'))
print('[kc] redirectUris:', c['redirectUris'])
print('[kc] webOrigins:  ', c['webOrigins'])
PY

echo "[kc] PUT updated client"
curl -sS --fail -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "@$TMP/client-new.json" \
  "$KC_BASE/admin/realms/$REALM/clients/$CLIENT_UUID"
echo
echo "[kc] done"
