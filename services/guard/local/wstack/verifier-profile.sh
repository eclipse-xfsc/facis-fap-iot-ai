#!/usr/bin/env bash
# Level 2 of the guard's local test, W-Stack side: adds the permission set the
# guard asks for (default facis-login) to the verifier's human presentation
# profile: a DCQL query for one SD-JWT VC of the given type with an
# organisation and roles. The profile's other permission sets are kept.
#
# Usage: VCT=<credential type (vct)> verifier-profile.sh
# Env:   WSTACK_CONTEXT (required: the W-Stack cluster), NS (default ocm-wstack),
#        TENANT (default connector), GROUP (default), PERMISSION_SET (facis-login)
set -euo pipefail
ctx="${WSTACK_CONTEXT:?set WSTACK_CONTEXT (kubectl context of the W-Stack cluster)}"; ns="${NS:-ocm-wstack}"
vct="${VCT:?set VCT to the vct of the role credential the issuer produces}"
tenant="${TENANT:-connector}"; group="${GROUP:-default}"; set_name="${PERMISSION_SET:-facis-login}"
port=28083
kubectl --context "${ctx}" -n "${ns}" port-forward svc/credential-verification-service "${port}:8080" >/dev/null 2>&1 & pf=$!
trap 'kill ${pf} 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do curl -s -o /dev/null "http://127.0.0.1:${port}/" && break; sleep 0.5; done
url="http://127.0.0.1:${port}/v1/tenants/${tenant}/internal/presentation-profiles/verifier/human"
current="$(curl -sf --max-time 10 -H "x-groupid: ${group}" "${url}")" || { echo "no verifier/human profile for tenant ${tenant}" >&2; exit 1; }
jq --arg s "${set_name}" --arg v "${vct}" '
  {enabled, did, origin, keyGroup, keyNamespace, keyId, signingAlgorithm, responseMode, requestObjectTtlSeconds, presentationPolicies}
  | .presentationPolicies[$s] = {credentials: [{id: "role", format: "dc+sd-jwt", meta: {vct_values: [$v]},
      claims: [{path: ["org_did"]}, {path: ["roles"]}]}]}' <<<"${current}" \
  | curl -sf --max-time 10 -X PUT -H "x-groupid: ${group}" -H 'Content-Type: application/json' --data @- "${url}" -o /dev/null
echo "permission set ${set_name} (dc+sd-jwt, vct ${vct}) on the verifier/human profile of ${tenant}"
