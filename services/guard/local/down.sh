#!/usr/bin/env bash
# Removes the local test setup of up.sh: the port-forward and the namespace.
# Usage: services/guard/local/down.sh   Env: KUBE_CONTEXT, NAMESPACE (as up.sh)
set -euo pipefail
ns="${NAMESPACE:-guard-local}"
ctx="${KUBE_CONTEXT:-$(kubectl config current-context)}"
pkill -f "port-forward -n ${ns} svc/guard-edge" 2>/dev/null || true
helm --kube-context "${ctx}" -n "${ns}" uninstall guard 2>/dev/null || true
kubectl --context "${ctx}" delete ns "${ns}" --wait=false
echo "removed namespace ${ns} from ${ctx}"
