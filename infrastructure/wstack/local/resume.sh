#!/usr/bin/env bash
# Brings the local W-Stack (up.sh) back after a reboot or a restart of its kind
# node. Idempotent: on a healthy cluster every step is a no-op.
#
# What a restart breaks, and what this does about it:
#   0. Calico's CNI token can go stale: new pods no longer start -> restart
#      calico-node (only when a probe pod cannot start).
#   1. OpenBao comes back sealed -> unseal it from the bootstrap shares
#      (secret security/openbao-bootstrap-root, sent over stdin).
#   2. While it was sealed, the XFSC kubernetes-operator could not reconcile
#      the database users (ResourceClaims), and Redis lost its users -> resync
#      the claims' secrets, nudge the operator, restart it once if it sits in
#      its back-off, and wait until every claim is Ready.
#   3. External Secrets marked its secret stores invalid while OpenBao was
#      sealed and re-checks them only on its back-off; its secrets refresh
#      hourly -> revalidate the stores, wait until they are Ready, force a
#      resync of every ExternalSecret and wait for them.
#   4. Deployments that crash-looped meanwhile (on a sealed OpenBao, on Redis
#      refusing a stale password) sit in back-off -> restart them.
#   5. Services that started before NATS can run without a NATS connection and
#      never reconnect (no crash, so step 4 misses them) -> restart the pods
#      that have a NATS setting but no client connection on the NATS server.
#   6. Tenant registrations live in memory -> register the tenant again.
#
# It does not reinstall anything (that is up.sh).
#
# Usage: infrastructure/wstack/local/resume.sh [--check]
#        --check  reports what it would do, changes nothing
# Settings: as up.sh (settings.example.env).
set -Eeuo pipefail
trap 'echo "FAIL: resume.sh stopped at line ${LINENO}: ${BASH_COMMAND}" >&2' ERR
# shellcheck source=lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

CHECK=0
case "${1:-}" in
    --check) CHECK=1 ;;
    "") ;;
    -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "FAIL: unknown argument '${1}' (expected nothing or --check)" >&2; exit 2 ;;
esac
TIMEOUT="${WSTACK_TIMEOUT}"
APP_NAMESPACES=("${TENANT_NS}" "${NS_INFRA}")

require_local_context || exit 1
check_node_ip || exit 1
if ! "${K[@]}" get --raw /readyz >/dev/null 2>&1; then
    echo "FAIL: cluster ${WSTACK_CONTEXT} not reachable: is the node running? (docker start ${WSTACK_NODE})" >&2
    exit 1
fi
if ! "${K[@]}" get namespace "${NS_SEC}" >/dev/null 2>&1; then
    echo "FAIL: namespace ${NS_SEC} missing: the W-Stack is not installed here (${LOCAL_DIR}/up.sh)" >&2
    exit 1
fi
"${K[@]}" -n "${NS_SEC}" wait pod/openbao-0 --for=jsonpath='{.status.phase}'=Running --timeout="${TIMEOUT}s" >/dev/null

# --- 0. pod creation ------------------------------------------------------------
echo "== 0. new pods start (Calico)"
if [ "${CHECK}" = 1 ]; then
    echo "  skipped in --check (the probe schedules a pod)"
else
    health_gate
fi

# --- 1. OpenBao ----------------------------------------------------------------------
echo "== 1. OpenBao seal state"
sealed="$(bao_sealed)"
if [ "${sealed}" = "false" ]; then
    echo "  unsealed"
elif [ "${CHECK}" = 1 ]; then
    todo "OpenBao is sealed (${sealed:-no status}): would unseal it from ${NS_SEC}/openbao-bootstrap-root"
else
    bao_unseal
fi

# --- 2. ResourceClaims ------------------------------------------------------------
echo "== 2. XFSC ResourceClaims (database users)"
RC=resourceclaims.resources.xfsc.io   # full name: Kubernetes 1.34+ has a core ResourceClaim too
not_ready_claims() {
    "${K[@]}" get "${RC}" -A -o json | jq -r '.items[]
        | select(([.status.conditions[]? | select(.type=="Ready" and .status=="True")] | length) == 0)
        | "\(.metadata.namespace)/\(.metadata.name)  \([.status.conditions[]? | select(.type=="Ready")][0].reason // "no status")"'
}
# A claim reads its database user from the Secret of its ExternalSecret; that
# Secret can have been synced while OpenBao was half written: resync it.
resync_claim_secrets() {
    "${K[@]}" get "${RC}" -A -o json | jq -r '.items[]
        | select(([.status.conditions[]? | select(.type=="Ready" and .status=="True")] | length) == 0)
        | select(.spec.externalSecretRef.name != null)
        | "\(.metadata.namespace) \(.spec.externalSecretRef.name)"' \
    | while read -r ns es; do
        "${K[@]}" -n "${ns}" annotate externalsecrets.external-secrets.io "${es}" \
            "force-sync=$(date +%s)" --overwrite >/dev/null 2>&1 \
            && did "force-synced ExternalSecret ${ns}/${es} (claim pending)"
    done
}
pending="$(not_ready_claims)"
if [ -z "${pending}" ]; then
    echo "  all Ready"
elif [ "${CHECK}" = 1 ]; then
    todo "not Ready:"; echo "${pending}" | sed 's/^/       /'
else
    resync_claim_secrets
    while read -r nsname _; do
        "${K[@]}" -n "${nsname%%/*}" annotate "${RC}" "${nsname#*/}" "resume.local/at=$(date +%s)" --overwrite >/dev/null
    done <<<"${pending}"
    deadline=$((SECONDS + TIMEOUT)); kicked=0
    while pending="$(not_ready_claims)"; [ -n "${pending}" ]; do
        # an annotation does not bump the generation, and the operator backs off
        # (up to about 16 minutes) after failures: after a minute, recreate the
        # secrets still missing keys and restart the operator once
        if [ "${kicked}" = 0 ] && [ "${SECONDS}" -ge $((deadline - TIMEOUT + 60)) ]; then
            resync_claim_secrets; sleep 10
            "${K[@]}" get "${RC}" -A -o json | jq -r '.items[]
                | select(([.status.conditions[]? | select(.type=="Ready" and (.message // "" | test("missing one of keys")))] | length) > 0)
                | select(.spec.externalSecretRef.name != null)
                | "\(.metadata.namespace) \(.spec.externalSecretRef.name)"' \
            | while read -r ns es; do
                "${K[@]}" -n "${ns}" delete secret "${es}" --ignore-not-found >/dev/null \
                    && did "recreated Secret ${ns}/${es} (claim still missing keys)"
            done
            resync_claim_secrets; sleep 10
            "${K[@]}" -n "${NS_SEC}" rollout restart deploy/kubernetes-operator >/dev/null
            "${K[@]}" -n "${NS_SEC}" rollout status deploy/kubernetes-operator --timeout="${TIMEOUT}s" >/dev/null
            did "restarted kubernetes-operator (claims still pending after 60s)"
            kicked=1
        fi
        if [ "${SECONDS}" -ge "${deadline}" ]; then
            echo "FAIL: ResourceClaims still not Ready after ${TIMEOUT}s:" >&2; echo "${pending}" >&2; exit 1
        fi
        sleep 5
    done
    did "all Ready"
fi

# --- 3. secret stores and ExternalSecrets ---------------------------------------
echo "== 3. secret stores and ExternalSecrets"
invalid_stores() {
    "${K[@]}" get clustersecretstores.external-secrets.io,secretstores.external-secrets.io -A -o json 2>/dev/null \
        | jq -r '.items[] | select(([.status.conditions[]? | select(.type=="Ready" and .status=="True")] | length) == 0)
                 | "\(.kind) \(.metadata.namespace // "-")/\(.metadata.name)"'
}
not_synced() {
    local ns
    for ns in "${APP_NAMESPACES[@]}"; do
        "${K[@]}" -n "${ns}" get externalsecrets.external-secrets.io -o json 2>/dev/null | jq -r '.items[]
            | select(([.status.conditions[]? | select(.type=="Ready" and .status=="True")] | length) == 0)
            | "\(.metadata.namespace)/\(.metadata.name)"'
    done
}
if [ "${CHECK}" = 1 ]; then
    bad="$(invalid_stores)"; stale="$(not_synced)"
    if [ -z "${bad}" ]; then echo "  secret stores Ready"; else todo "would revalidate:"; echo "${bad}" | sed 's/^/       /'; fi
    if [ -z "${stale}" ]; then echo "  ExternalSecrets synced"; else todo "would force-sync:"; echo "${stale}" | sed 's/^/       /'; fi
else
    # a metadata change makes External Secrets revalidate a store now
    "${K[@]}" annotate clustersecretstores.external-secrets.io --all "resume.local/revalidate=$(date +%s)" --overwrite >/dev/null 2>&1 || true
    "${K[@]}" annotate secretstores.external-secrets.io -A --all "resume.local/revalidate=$(date +%s)" --overwrite >/dev/null 2>&1 || true
    deadline=$((SECONDS + TIMEOUT))
    while bad="$(invalid_stores)"; [ -n "${bad}" ]; do
        if [ "${SECONDS}" -ge "${deadline}" ]; then
            echo "FAIL: secret stores not Ready after ${TIMEOUT}s (is OpenBao unsealed?):" >&2; echo "${bad}" >&2; exit 1
        fi
        sleep 3
    done
    did "secret stores Ready"
    # resync all of them: a claim the operator re-provisioned may carry a new
    # password even where its ExternalSecret still reads Ready
    for ns in "${APP_NAMESPACES[@]}"; do
        "${K[@]}" -n "${ns}" annotate externalsecrets.external-secrets.io --all "force-sync=$(date +%s)" --overwrite >/dev/null 2>&1 || true
    done
    deadline=$((SECONDS + TIMEOUT))
    while stale="$(not_synced)"; [ -n "${stale}" ]; do
        if [ "${SECONDS}" -ge "${deadline}" ]; then
            echo "FAIL: ExternalSecrets not synced after ${TIMEOUT}s:" >&2; echo "${stale}" >&2; exit 1
        fi
        sleep 5
    done
    did "ExternalSecrets synced"
fi

# --- 4. crash-looping Deployments ----------------------------------------------
echo "== 4. Deployments with failing pods"
failing_deployments() {
    local ns
    for ns in "${APP_NAMESPACES[@]}"; do
        "${K[@]}" -n "${ns}" get pods -o json | jq -r '.items[]
            | select(.metadata.ownerReferences[]?.kind == "ReplicaSet")
            | select([.status.containerStatuses[]?
                      | select(.ready == false
                               and (((.state.waiting.reason // "") | test("CrashLoopBackOff|Error|CreateContainerConfigError"))
                                    or (.state.terminated != null)))] | length > 0)
            | "\(.metadata.namespace) \(.metadata.ownerReferences[0].name)"'
    done | while read -r ns rs; do
        "${K[@]}" -n "${ns}" get rs "${rs}" -o jsonpath='{.metadata.namespace}{" "}{.metadata.ownerReferences[0].name}{"\n"}' 2>/dev/null
    done | sort -u
}
restart_all() { # lines "namespace deployment"
    local ns deploy
    while read -r ns deploy; do
        "${K[@]}" -n "${ns}" rollout restart "deploy/${deploy}" >/dev/null; did "restarted ${ns}/${deploy}"
    done <<<"$1"
    while read -r ns deploy; do
        "${K[@]}" -n "${ns}" rollout status "deploy/${deploy}" --timeout="${TIMEOUT}s" >/dev/null \
            || { echo "FAIL: ${ns}/${deploy} did not become available: kubectl -n ${ns} logs deploy/${deploy}" >&2; exit 1; }
    done <<<"$1"
}
failing="$(failing_deployments)"
if [ -z "${failing}" ]; then echo "  none"
elif [ "${CHECK}" = 1 ]; then todo "would restart:"; echo "${failing}" | sed 's/^/       /'
else restart_all "${failing}"; did "all available"
fi

# --- 5. NATS clients without a connection ---------------------------------------
echo "== 5. NATS clients without a connection"
nats_orphans() {
    local conns ns
    conns="$("${K[@]}" -n "${NS_INFRA}" exec nats-0 -c nats -- wget -qO- 'http://127.0.0.1:8222/connz?limit=4096' 2>/dev/null \
        | jq -r '.connections[].ip' 2>/dev/null)" || return 0
    [ -n "${conns}" ] || return 0   # monitoring unreachable: do not guess
    for ns in "${APP_NAMESPACES[@]}"; do
        "${K[@]}" -n "${ns}" get pods -o json | jq -r '.items[]
            | select(.status.phase=="Running" and (.status.podIP // "") != "")
            | select(.metadata.ownerReferences[]?.kind == "ReplicaSet")
            | select([.spec.containers[].env[]?.name] | any(test("NATS"; "i")))
            | "\(.metadata.namespace) \(.metadata.ownerReferences[0].name) \(.status.podIP)"'
    done | while read -r ns rs ip; do
        grep -qxF "${ip}" <<<"${conns}" && continue
        "${K[@]}" -n "${ns}" get rs "${rs}" -o jsonpath='{.metadata.namespace}{" "}{.metadata.ownerReferences[0].name}{"\n"}' 2>/dev/null
    done | sort -u
}
orphans="$(nats_orphans)"
if [ -z "${orphans}" ]; then echo "  none"
elif [ "${CHECK}" = 1 ]; then todo "would restart (no NATS connection):"; echo "${orphans}" | sed 's/^/       /'
else
    restart_all "${orphans}"; sleep 5
    left="$(nats_orphans)"
    [ -z "${left}" ] || { echo "FAIL: still no NATS connection after a restart:" >&2; echo "${left}" >&2; exit 1; }
    did "all NATS clients connected"
fi

# --- 6. tenant registrations -----------------------------------------------------
echo "== 6. tenant registrations"
if [ "${CHECK}" = 1 ]; then
    echo "  skipped in --check (runs the registration job)"
else
    register_tenant
fi

echo
[ "${CHECK}" = 1 ] && echo "CHECK done: nothing was changed." || echo "Local W-Stack resumed (${TENANT_DID})."
