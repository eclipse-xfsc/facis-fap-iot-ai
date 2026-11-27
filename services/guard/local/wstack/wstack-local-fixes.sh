#!/usr/bin/env bash
# Level 2 of the guard's local test: the changes a local W-Stack needs before a
# wallet login with an SD-JWT VC works end to end. Local deviations from the
# pinned baseline, each one a known fault of the release it replaces:
#   - the credential verifier and the SD-JWT service at the releases given
#     (VERIFIER_IMAGE, SDJWT_IMAGE): the verifier must match a disclosed SD-JWT
#     against its query (fixed after 1.3.7) and the SD-JWT service must return
#     the key binding (missing in 1.2.13);
#   - the SD-JWT service trusts the CA bundle mounted for it: it is a Node.js
#     service, which ignores SSL_CERT_FILE (NODE_EXTRA_CA_CERTS instead).
# Usage: VERIFIER_IMAGE=<image@digest> SDJWT_IMAGE=<image@digest> wstack-local-fixes.sh
# Env:   WSTACK_CONTEXT (required: the W-Stack cluster), NS (default ocm-wstack)
set -euo pipefail
ctx="${WSTACK_CONTEXT:?set WSTACK_CONTEXT (kubectl context of the W-Stack cluster)}"; ns="${NS:-ocm-wstack}"
k() { kubectl --context "${ctx}" -n "${ns}" "$@"; }
for pair in "credential-verification-service=${VERIFIER_IMAGE:-}" "sd-jwt-service=${SDJWT_IMAGE:-}"; do
    d="${pair%%=*}"; img="${pair#*=}"
    [ -n "${img}" ] || continue
    c="$(k get deploy "${d}" -o jsonpath='{.spec.template.spec.containers[0].name}')"
    k set image "deploy/${d}" "${c}=${img}" >/dev/null && echo "${d}: ${img}"
done
ca="$(k get deploy sd-jwt-service -o json | jq -r '[.spec.template.spec.containers[0].env[]? | select(.name == "SSL_CERT_FILE") | .value][0] // empty')"
if [ -n "${ca}" ]; then
    k set env deploy/sd-jwt-service "NODE_EXTRA_CA_CERTS=${ca}" >/dev/null && echo "sd-jwt-service: NODE_EXTRA_CA_CERTS=${ca}"
fi
k rollout status deploy/credential-verification-service --timeout 300s >/dev/null
k rollout status deploy/sd-jwt-service --timeout 300s >/dev/null
echo "local W-Stack fixes applied"
