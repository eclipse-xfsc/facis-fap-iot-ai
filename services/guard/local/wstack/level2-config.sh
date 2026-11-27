#!/usr/bin/env bash
# Level 2 of the guard's local test, guard side: writes the settings that
# point the local guard (up.sh) at a real W-Stack instead of the stub:
#   <out>/values.yaml        chart values: the verifier's internal API, its
#                            tenant and permission set, the status list origin
#                            and the CA bundle
#   <out>/policy-data/       policy deployment data: the W-Stack issuer trusted
#                            for its organisations, the applications and roles
# and creates the CA ConfigMap guard-wstack-ca in the guard's namespace.
# Then:  EXTRA_VALUES=<out>/values.yaml POLICY_DATA=<out>/policy-data up.sh
#
# Usage: level2-config.sh <out-dir>
# Env (required): WSTACK_HOST        the tenant's public host (issuer, verifier, status lists)
#                 VERIFIER_URL       the verifier's internal API as the guard reaches it
#                                    (expose-verifier.sh)
#                 CA_FILE            PEM file of the CA the W-Stack's certificates chain to
# Env (optional): TENANT (default: the host's first label), GROUP (default),
#                 PERMISSION_SET (facis-login), ISSUER_DID (did:web:<host>),
#                 ORG_DIDS (space separated; default: the issuer DID),
#                 KUBE_CONTEXT, NAMESPACE (as up.sh)
set -euo pipefail
out="${1:?usage: level2-config.sh <out-dir>}"
host="${WSTACK_HOST:?set WSTACK_HOST}"
verifier="${VERIFIER_URL:?set VERIFIER_URL (the verifier internal API, see expose-verifier.sh)}"
ca="${CA_FILE:?set CA_FILE}"
[ -s "${ca}" ] || { echo "no such CA file: ${ca}" >&2; exit 2; }
tenant="${TENANT:-${host%%.*}}"
issuer="${ISSUER_DID:-did:web:${host}}"
orgs="${ORG_DIDS:-${issuer}}"
ns="${NAMESPACE:-guard-local}"
ctx="${KUBE_CONTEXT:-$(kubectl config current-context)}"

mkdir -p "${out}/policy-data/facis/login_config"
cat > "${out}/values.yaml" <<EOF
# Level 2: the guard against a real W-Stack (written by level2-config.sh)
loginProvider:
  verifier:
    url: ${verifier}
    api: cvs-1.3
    tenant: ${tenant}
    group: ${GROUP:-default}
    permissionSet: ${PERMISSION_SET:-facis-login}
  statusListOrigins: [https://${host}]
  caBundle:
    configMap: guard-wstack-ca
    key: ca.crt
EOF
jq -n --arg i "${issuer}" --arg o "${orgs}" '{
  comment: "Level 2 deployment data (level2-config.sh): the W-Stack issuer vouches for these organisations.",
  trusted_issuers: {($i): {organisations: ($o | split(" ") | map(select(. != "")))}},
  clients: {
    "facis-ai-insight-ui": {allowed_roles: ["administrator", "data_scientist", "data_analyst"]},
    "facis-local-test": {allowed_roles: ["administrator", "data_engineer", "data_scientist", "data_analyst", "operator"]}}}' \
  > "${out}/policy-data/facis/login_config/data.json"
kubectl --context "${ctx}" get ns "${ns}" >/dev/null 2>&1 || kubectl --context "${ctx}" create ns "${ns}"
kubectl --context "${ctx}" -n "${ns}" create configmap guard-wstack-ca --from-file=ca.crt="${ca}" --dry-run=client -o yaml \
  | kubectl --context "${ctx}" -n "${ns}" apply -f - >/dev/null
echo "level 2 settings in ${out}: values.yaml, policy-data/ (issuer ${issuer}); CA ConfigMap guard-wstack-ca in ${ns}"
echo "next: EXTRA_VALUES=${out}/values.yaml POLICY_DATA=${out}/policy-data $(cd "$(dirname "$0")/.." && pwd)/up.sh"
