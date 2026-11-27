#!/usr/bin/env bash
# Level 2 of the guard's local test, W-Stack side: exposes the
# credential verifier's internal API (create a presentation request, read the
# stored presentation) to the FAP cluster's node only.
#
#   - Service cvs-internal-for-fap: a NodePort (default 32093) -> the verifier's port 8080,
#     externalTrafficPolicy Local so the verifier sees the caller's address;
#   - NetworkPolicy cvs-ingress: the verifier accepts the W-Stack's own
#     namespaces, the gateway and the ingress controller, and from outside
#     the cluster only the FAP node's address (connect-clusters.sh prints it).
#
# This is the local answer to "how does the FAP reach the verifier's internal
# API": a dedicated exposure restricted to the FAP cluster. On FACIS's clusters
# it is the same question (open point: traffic between the clusters).
#
# Usage: FAP_NODE_IP=<the FAP node's address on the W-Stack network> expose-verifier.sh
# Env:   WSTACK_CONTEXT (required: the W-Stack cluster), NS (default ocm-wstack),
#        NODE_PORT (default 32093). --delete removes what it added.
set -euo pipefail
ctx="${WSTACK_CONTEXT:?set WSTACK_CONTEXT (kubectl context of the W-Stack cluster)}"
ns="${NS:-ocm-wstack}"
k() { kubectl --context "${ctx}" -n "${ns}" "$@"; }
np="${NODE_PORT:-32093}"
if [ "${1:-}" = --delete ]; then
    k delete svc cvs-internal-for-fap --ignore-not-found
    k delete networkpolicy cvs-ingress --ignore-not-found
    exit 0
fi
ip="${FAP_NODE_IP:?set FAP_NODE_IP (connect-clusters.sh prints it)}"

sel="$(k get svc credential-verification-service -o json | jq -c '.spec.selector')"
[ -n "${sel}" ] && [ "${sel}" != null ] || { echo "credential-verification-service has no selector in ${ns}" >&2; exit 1; }
port="$(k get svc credential-verification-service -o json | jq -r '.spec.ports[0].targetPort')"
echo "verifier pods: ${sel}, target port ${port}"

jq -n --argjson sel "${sel}" --arg port "${port}" --arg ip "${ip}" --arg np "${np}" '
{apiVersion: "v1", kind: "List", items: [
  {apiVersion: "v1", kind: "Service",
   metadata: {name: "cvs-internal-for-fap", labels: {"app.kubernetes.io/part-of": "guard-local"}},
   spec: {type: "NodePort", externalTrafficPolicy: "Local", selector: $sel,
          ports: [{name: "http", port: 8080, targetPort: ($port | tonumber? // $port), nodePort: ($np | tonumber)}]}},
  {apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy",
   metadata: {name: "cvs-ingress", labels: {"app.kubernetes.io/part-of": "guard-local"}},
   spec: {podSelector: {matchLabels: $sel}, policyTypes: ["Ingress"],
          ingress: [
            {from: [
              {namespaceSelector: {matchLabels: {"kubernetes.io/metadata.name": "ocm-wstack"}}},
              {namespaceSelector: {matchLabels: {"kubernetes.io/metadata.name": "infrastructure"}}},
              {namespaceSelector: {matchLabels: {"kubernetes.io/metadata.name": "ingress-nginx"}}}]},
            {from: [{ipBlock: {cidr: ($ip + "/32")}}],
             ports: [{protocol: "TCP", port: ($port | tonumber? // $port)}]}]}}]}' | k apply -f -
echo "verifier internal API for the FAP node ${ip}: http://<W-Stack node address>:${np}"
