# Shared by up.sh, resume.sh and down.sh: settings, the local-cluster guard,
# kubectl/helm wrappers and the OpenBao helpers. Sourced, never run.
# Settings: see settings.example.env.

LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${LOCAL_DIR}/../../.." && pwd)"

# A settings file (WSTACK_SETTINGS, default ./settings.env next to this file)
# is sourced when present (see settings.example.env); the environment can set
# the same values.
WSTACK_SETTINGS="${WSTACK_SETTINGS:-${LOCAL_DIR}/settings.env}"
if [ -f "${WSTACK_SETTINGS}" ]; then
    # shellcheck disable=SC1090
    . "${WSTACK_SETTINGS}"
fi

WSTACK_CLUSTER="${WSTACK_CLUSTER:-wstack}"
WSTACK_CONTEXT="${WSTACK_CONTEXT:-kind-${WSTACK_CLUSTER}}"
WSTACK_NODE="${WSTACK_NODE:-${WSTACK_CLUSTER}-control-plane}"
WSTACK_NETWORK="${WSTACK_NETWORK:-kind}"
WSTACK_ZONE="${WSTACK_ZONE:-}"
WSTACK_NODE_IP="${WSTACK_NODE_IP:-}"
WSTACK_HOST_PORTS="${WSTACK_HOST_PORTS:-0}"
TENANT="${TENANT:-connector}"
TENANT_NS="${TENANT_NS:-ocm-wstack}"
TENANT_GROUP="${TENANT_GROUP:-default}"
TENANT_KEY="${TENANT_KEY:-eckey}"
GW_NODEPORT="${GW_NODEPORT:-32091}"
DEPLOYMENT_DIR="${DEPLOYMENT_DIR:-$(cd "${REPO_ROOT}/.." && pwd)/deployment}"
WSTACK_LOCK="${WSTACK_LOCK:-${REPO_ROOT}/infrastructure/wstack/wstack-images.lock.tsv}"
WSTACK_STATE_DIR="${WSTACK_STATE_DIR:-${XDG_STATE_HOME:-${HOME}/.local/state}/facis-wstack-local/${WSTACK_CLUSTER}}"
WSTACK_TIMEOUT="${WSTACK_TIMEOUT:-300}"
# Without WSTACK_ZONE, up.sh uses <node address>.sslip.io once the node exists
# and records it, with the address, in ZONE_FILE: later runs and resume.sh keep
# the same zone, and refuse a node that came back with another address.
ZONE_FILE="${WSTACK_STATE_DIR}/zone.env"
if [ -z "${WSTACK_ZONE}" ] && [ -f "${ZONE_FILE}" ]; then
    # shellcheck disable=SC1090
    . "${ZONE_FILE}"
fi
SUPPORT_NS="wstack-local"   # local-only objects: the tenant certificate, the did:web ingress
NS_SEC=security
NS_INFRA=infrastructure
TENANT_HOST="${TENANT}.${WSTACK_ZONE}"
TENANT_DID="did:web:${TENANT_HOST}"

K=(kubectl --context "${WSTACK_CONTEXT}")
H=(helm --kube-context "${WSTACK_CONTEXT}")
did() { echo "  -> $*"; }
todo() { echo "  !! $* (--check: not done)"; }

# require_settings: the tools (WSTACK_ZONE has a default, see ZONE_FILE).
require_settings() {
    for t in kubectl helm jq curl openssl python3 docker; do
        command -v "${t}" >/dev/null || { echo "FAIL: missing tool: ${t}" >&2; return 1; }
    done
}

# require_local_context: refuse any context that is not a local cluster, and
# any other context than WSTACK_CONTEXT.
require_local_context() {
    case "${WSTACK_CONTEXT}" in
        kind-*|k3d-*|minikube|docker-desktop|rancher-desktop|orbstack) ;;
        *) [ "${ALLOW_ANY_CONTEXT:-}" = 1 ] || {
               echo "FAIL: refusing context ${WSTACK_CONTEXT}: not a local cluster (ALLOW_ANY_CONTEXT=1 to override)" >&2
               return 1; } ;;
    esac
    kubectl config get-contexts -o name 2>/dev/null | grep -qx "${WSTACK_CONTEXT}" || {
        echo "FAIL: no kube context ${WSTACK_CONTEXT} (is the cluster created?)" >&2; return 1; }
}

# node_ip: the W-Stack node's address on its Docker network (empty if none).
node_ip() {
    docker inspect -f "{{with index .NetworkSettings.Networks \"${WSTACK_NETWORK}\"}}{{.IPAddress}}{{end}}" \
        "${WSTACK_NODE}" 2>/dev/null || true
}

# check_node_ip: when WSTACK_NODE_IP is set, the node must hold that address:
# the zone, the certificates and the guard's settings are built on it.
check_node_ip() {
    local ip; ip="$(node_ip)"
    [ -n "${WSTACK_NODE_IP}" ] || { echo "  node ${WSTACK_NODE}: ${ip:-not running} on ${WSTACK_NETWORK} (WSTACK_NODE_IP not set, not checked)"; return 0; }
    if [ "${ip}" != "${WSTACK_NODE_IP}" ]; then
        echo "FAIL: node ${WSTACK_NODE} has address '${ip}' on ${WSTACK_NETWORK}, the settings say ${WSTACK_NODE_IP}." >&2
        echo "      After a reboot another container on that network may have taken it: stop it, restart ${WSTACK_NODE}, then start the other one again." >&2
        return 1
    fi
    echo "  node ${WSTACK_NODE}: ${ip} (as set)"
}

# --- OpenBao (the W-Stack's, namespace security) ------------------------------
# Unseal shares and the root token are read from the bootstrap secret and sent
# over stdin, never on a command line.
bao_status_json() {
    # `bao status` exits 2 when sealed while still printing the JSON
    "${K[@]}" -n "${NS_SEC}" exec openbao-0 -- env VAULT_ADDR=http://127.0.0.1:8200 \
        bao status -format=json 2>/dev/null || true
}
# not `.sealed // "unknown"`: jq's // treats false as missing
bao_sealed() { bao_status_json | jq -r 'if has("sealed") then .sealed else "unknown" end' 2>/dev/null || echo unknown; }
bao_unseal() {
    local threshold i key
    threshold="$(bao_status_json | jq -r '.t // 3' 2>/dev/null || echo 3)"
    for i in $(seq 1 "${threshold}"); do
        key="$("${K[@]}" -n "${NS_SEC}" get secret openbao-bootstrap-root \
            -o jsonpath="{.data.unseal_key_${i}}" | base64 -d)"
        [ -n "${key}" ] || { echo "FAIL: unseal_key_${i} missing in ${NS_SEC}/openbao-bootstrap-root" >&2; return 1; }
        # not `bao operator unseal -`, which takes "-" as the key: `bao write … key=-` reads stdin
        printf '%s' "${key}" | "${K[@]}" -n "${NS_SEC}" exec -i openbao-0 -- \
            env VAULT_ADDR=http://127.0.0.1:8200 bao write sys/unseal key=- >/dev/null \
            || { echo "FAIL: unseal share ${i} refused" >&2; return 1; }
    done
    unset key
    # the last share starts the post-unseal setup: poll rather than check once
    for _ in $(seq 1 30); do [ "$(bao_sealed)" = "false" ] && break; sleep 1; done
    [ "$(bao_sealed)" = "false" ] || { echo "FAIL: OpenBao still sealed 30s after ${threshold} shares" >&2; return 1; }
    did "OpenBao unsealed (${threshold} shares)"
}
# bao_login / bao / bao_logout: root token through stdin, cached in the pod
# for the session and removed by bao_logout (call it on exit).
bao_login() {
    "${K[@]}" -n "${NS_SEC}" get secret openbao-bootstrap-root -o jsonpath='{.data.root_token}' | base64 -d \
        | "${K[@]}" -n "${NS_SEC}" exec -i openbao-0 -- env VAULT_ADDR=http://127.0.0.1:8200 bao login - >/dev/null 2>&1
}
bao() { "${K[@]}" -n "${NS_SEC}" exec openbao-0 -- env VAULT_ADDR=http://127.0.0.1:8200 bao "$@"; }
bao_logout() { "${K[@]}" -n "${NS_SEC}" exec openbao-0 -- env VAULT_ADDR=http://127.0.0.1:8200 bao logout >/dev/null 2>&1 || true; }

# --- pod creation health (Calico) ----------------------------------------------
# After a host or Docker restart, Calico's CNI plugin can keep a stale token:
# every NEW pod then fails sandbox creation ("connection is unauthorized")
# while running pods carry on. A throwaway pod proves creation works; if not,
# restarting calico-node rewrites the token.
pod_can_start() {
    "${K[@]}" run "podcheck-$$" --rm -i --restart=Never \
        --image=docker.io/library/nginx:alpine --timeout=90s -- true >/dev/null 2>&1
}
health_gate() {
    if pod_can_start; then did "new pods start (CNI healthy)"; return 0; fi
    echo "  new pods blocked: restarting calico-node (stale CNI token after a reboot)"
    "${K[@]}" -n kube-system delete pod -l k8s-app=calico-node >/dev/null 2>&1 || true
    "${K[@]}" -n kube-system wait --for=condition=Ready pod -l k8s-app=calico-node --timeout=180s >/dev/null 2>&1 || true
    if pod_can_start; then did "pod creation restored after the calico-node restart"; return 0; fi
    echo "FAIL: new pods still cannot start; see: kubectl --context ${WSTACK_CONTEXT} get events -A --sort-by=.lastTimestamp | tail -30" >&2
    return 1
}

# --- tenant registration ---------------------------------------------------------
# The tenant-aware W-Stack services keep tenant registrations in memory only:
# after any pod restart they answer "tenant ... not registered" until the
# tenant chart's cron job runs again (every 15 minutes). Run it now, and
# re-register the tenant on the dummy content signer, which has its own
# in-memory registry.
register_tenant() {
    local cron="${TENANT_CRONJOB:-${TENANT}-xfsc-tenant-gateway-registration}" job=register-now pf port=28082
    if "${K[@]}" -n "${TENANT_NS}" get cronjob "${cron}" >/dev/null 2>&1; then
        "${K[@]}" -n "${TENANT_NS}" delete job "${job}" --ignore-not-found >/dev/null 2>&1 || true
        "${K[@]}" -n "${TENANT_NS}" create job --from="cronjob/${cron}" "${job}" >/dev/null
        if "${K[@]}" -n "${TENANT_NS}" wait --for=condition=complete "job/${job}" --timeout=90s >/dev/null 2>&1 \
           && "${K[@]}" -n "${TENANT_NS}" logs "job/${job}" 2>/dev/null | grep -q "registered successfully"; then
            did "tenant ${TENANT} registered on the W-Stack services"
        else
            echo "  WARN: tenant registration job did not confirm (the cron job retries every 15 minutes)" >&2
        fi
        "${K[@]}" -n "${TENANT_NS}" delete job "${job}" --ignore-not-found >/dev/null 2>&1 || true
    else
        echo "  WARN: no cron job ${TENANT_NS}/${cron}: tenant not registered (TENANT_CRONJOB to name it)" >&2
    fi
    "${K[@]}" -n "${TENANT_NS}" get svc dummycontentsigner >/dev/null 2>&1 || return 0
    "${K[@]}" -n "${TENANT_NS}" port-forward svc/dummycontentsigner "${port}:8080" >/dev/null 2>&1 & pf=$!
    for _ in $(seq 1 20); do curl -s -o /dev/null "http://127.0.0.1:${port}/" && break; sleep 0.5; done
    jq -n --arg h "https://${TENANT_HOST}" '{credentialIssuer: $h, credentialEndpoint: ($h + "/api/credential"),
        nonceEndpoint: ($h + "/api/nonce"), statusEndpoint: ($h + "/api/status"), authorizationServers: [$h]}' \
      | curl -s --max-time 10 -X PUT "http://127.0.0.1:${port}/internal/tenants/${TENANT}" \
            -H 'Content-Type: application/json' --data @- -o /dev/null -w '%{http_code}' \
      | grep -q '^2' && did "tenant ${TENANT} registered on the dummy content signer" \
      || echo "  WARN: the dummy content signer did not accept the tenant" >&2
    kill "${pf}" 2>/dev/null || true
}
