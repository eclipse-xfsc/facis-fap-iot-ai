#!/usr/bin/env bash
# Level 2 of the guard's local test, with the guard and the W-Stack in two kind
# clusters on separate Docker networks (as the FAP deployment and the federation
# trust services are separate): joins the guard cluster's node to the W-Stack's
# network, so the guard's pods reach the W-Stack node. Idempotent. Refuses
# unless the W-Stack node is running with the address its hosts are built on
# (when the guard node joined first, it would take that address).
# Usage: WSTACK_NODE_IP=<the W-Stack node's address> connect-clusters.sh
# Env:   FAP_NODE (default facis-control-plane), WSTACK_NODE, WSTACK_NETWORK
set -euo pipefail
node="${FAP_NODE:-facis-control-plane}"
wnode="${WSTACK_NODE:?set WSTACK_NODE (kind node of the W-Stack cluster)}"
net="${WSTACK_NETWORK:?set WSTACK_NETWORK (Docker network of the W-Stack)}"
want="${WSTACK_NODE_IP:?set WSTACK_NODE_IP (the address the W-Stack hosts resolve to)}"
docker inspect "${node}" >/dev/null 2>&1 || { echo "kind node ${node} not found" >&2; exit 2; }
wip="$(docker inspect -f "{{if .State.Running}}{{(index .NetworkSettings.Networks \"${net}\").IPAddress}}{{end}}" "${wnode}" 2>/dev/null || true)"
if [ "${wip}" != "${want}" ]; then
    echo "refusing: ${wnode} must be running on ${net} with ${want} (it has: ${wip:-not running}). Start the W-Stack cluster first." >&2
    exit 2
fi
if docker inspect -f "{{json .NetworkSettings.Networks}}" "${node}" | grep -q "\"${net}\""; then
    echo "${node} is already on ${net}"
else
    docker network connect "${net}" "${node}" && echo "connected ${node} to ${net}"
fi
echo "guard node on ${net}: $(docker inspect -f "{{(index .NetworkSettings.Networks \"${net}\").IPAddress}}" "${node}")  (FAP_NODE_IP for expose-verifier.sh)"
echo "W-Stack node:        ${wip}"
