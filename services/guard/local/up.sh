#!/usr/bin/env bash
# Installs the guard with a stub verifier into a local Kubernetes cluster
# (kind, k3d, minikube...), in its own namespace, for the end-to-end check
# (e2e.sh). Local tests only: dev mode, http, a stub instead of the W-Stack.
#
# Usage: services/guard/local/up.sh            (from the repo root)
# Env:   KUBE_CONTEXT  kubectl context (default: the current one)
#        NAMESPACE     default guard-local
#        EXTRA_VALUES  extra values files for the chart, space separated (for
#                      example to point the login provider at a real verifier)
#        POLICY_DATA   directory of the policy deployment data (default: policy-data,
#                      which trusts the stub issuer)
# Needs: kubectl, helm, opa, openssl.
# Leaves `kubectl port-forward` to the edge running in the background:
# the guard is at http://localhost:8444. down.sh removes everything.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${here}/../../.." && pwd)"
ns="${NAMESPACE:-guard-local}"
ctx="${KUBE_CONTEXT:-$(kubectl config current-context)}"
k() { kubectl --context "${ctx}" -n "${ns}" "$@"; }
for t in kubectl helm opa openssl; do command -v "$t" >/dev/null || { echo "missing: $t" >&2; exit 2; }; done

echo "== context ${ctx}, namespace ${ns}"
case "${ctx}" in
    kind-*|k3d-*|minikube|docker-desktop|rancher-desktop|orbstack) ;;
    *) [ "${ALLOW_ANY_CONTEXT:-}" = 1 ] || { echo "refusing context ${ctx}: not a local cluster (ALLOW_ANY_CONTEXT=1 to override)" >&2; exit 2; } ;;
esac
kubectl --context "${ctx}" get ns "${ns}" >/dev/null 2>&1 || kubectl --context "${ctx}" create ns "${ns}"

work="$(mktemp -d)"; chmod 700 "${work}"; trap 'rm -rf "${work}"' EXIT

# Secrets: created once, kept across re-runs (Hydra encrypts its keys with the
# system secret). Values go through files, never the command line.
if ! k get secret guard-postgres-local >/dev/null 2>&1; then
    openssl rand -hex 24 | tr -d '\n' > "${work}/pg"
    openssl rand -hex 32 | tr -d '\n' > "${work}/system"
    printf 'postgres://hydra:%s@guard-postgres:5432/hydra?sslmode=disable' "$(cat "${work}/pg")" > "${work}/dsn"
    openssl rand -hex 32 | tr -d '\n' > "${work}/admin"
    k create secret generic guard-postgres-local --from-file=password="${work}/pg"
    k create secret generic guard-hydra-local --from-file=system-secret="${work}/system" --from-file=dsn="${work}/dsn"
    k create secret generic guard-login-local --from-file=admin-token="${work}/admin"
    echo "   secrets created"
fi

echo "== policy bundle: infrastructure/opa/bundle + deployment data ${POLICY_DATA:-${here}/policy-data}"
opa build "${repo}/infrastructure/opa/bundle" "${POLICY_DATA:-${here}/policy-data}" -o "${work}/bundle.tar.gz"
k create configmap guard-policy-bundle-local --from-file=bundle.tar.gz="${work}/bundle.tar.gz" --dry-run=client -o yaml | k apply -f -

echo "== stub verifier and edge proxy"
k create configmap guard-stub-verifier-code --from-file=stub-verifier.js="${here}/stub-verifier.js" --dry-run=client -o yaml | k apply -f -
k apply -f "${here}/manifests.yaml"
k rollout restart deployment/guard-stub-verifier >/dev/null

echo "== chart"
extra=()
for f in ${EXTRA_VALUES:-}; do [ -f "${f}" ] || { echo "no such values file: ${f}" >&2; exit 2; }; extra+=(-f "${f}"); done
"${repo}/services/guard/helm/facis-guard/sync-flows.sh" >/dev/null
helm --kube-context "${ctx}" -n "${ns}" upgrade --install guard "${repo}/services/guard/helm/facis-guard" \
    -f "${here}/values-local.yaml" ${extra[@]+"${extra[@]}"} --set networkPolicy.ingressNamespace="${ns}" --wait --timeout 10m
k rollout restart deployment/guard-edge >/dev/null
# the policy engine reads its bundle at start: a new bundle needs a restart
k rollout restart deployment/guard-policy >/dev/null
k rollout status deployment/guard-policy --timeout 120s >/dev/null
k rollout status deployment/guard-edge --timeout 120s >/dev/null

echo "== port-forward http://localhost:8444 -> guard-edge"
pkill -f "port-forward -n ${ns} svc/guard-edge" 2>/dev/null || true
nohup kubectl --context "${ctx}" port-forward -n "${ns}" svc/guard-edge 8444:8080 > "${TMPDIR:-/tmp}/guard-edge-port-forward.log" 2>&1 &
for _ in $(seq 1 20); do curl -sf -o /dev/null http://localhost:8444/.well-known/openid-configuration && break; sleep 1; done
curl -sf http://localhost:8444/.well-known/openid-configuration | grep -q '"issuer":"http://localhost:8444/"' \
    && echo "   guard up: http://localhost:8444 (run ${here}/e2e.sh)" \
    || { echo "   the guard does not answer on http://localhost:8444" >&2; exit 1; }
