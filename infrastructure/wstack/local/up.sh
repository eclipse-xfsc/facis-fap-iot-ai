#!/usr/bin/env bash
# Brings up the OCM W-Stack on a local one-node kind cluster, from the charts of
# eclipse-xfsc/deployment at the commit pinned in
# infrastructure/wstack/wstack-images.lock.tsv. Local tests only.
#
#   1. the cluster: kind without a CNI, then Calico (NetworkPolicies enforced),
#      ingress-nginx (TLS 1.3, the tenant host on 443), cert-manager and its
#      self-signed issuer, the External Secrets Operator;
#   2. the W-Stack as its ApplicationSets install it: OpenBao, the XFSC
#      kubernetes-operator, the Postgres and Redis operators, Postgres, Redis,
#      Cassandra, NATS, the universal resolver, the envoy gateway, the
#      namespaces' OpenBao access, every chart of "OCM W-Stack/*" except those
#      the ApplicationSet excludes (tenant, Policies, Didcomm, Tools), then the
#      tenant chart;
#   3. what wallets and relying parties need locally: the tenant's signing key
#      in OpenBao, a local CA and the tenant's certificate, the tenant's
#      did:web document on 443 inside and outside the cluster, the CA trusted
#      by the W-Stack services, the verifier's presentation profile, and the
#      tenant registrations.
#
# Every step is idempotent (helm upgrade --install, kubectl apply): re-run it
# after a failure or a change.
#
# Usage: infrastructure/wstack/local/up.sh [--check]
#        --check  prints the plan and checks the settings, the deployment clone,
#                 its pin and its chart paths; touches no cluster (it only
#                 prepares the patched chart copies in WSTACK_STATE_DIR)
# Settings: settings.example.env. Without WSTACK_ZONE, the cluster is created
#           first and the zone is <node address>.sslip.io (kept in WSTACK_STATE_DIR).
# Needs: docker, kind, kubectl, helm (3.8+ or 4), jq, curl, openssl, python3;
#        about 10 GiB of memory for the node; fs.inotify.max_user_instances
#        of 1024 or more (see README.md).
set -Eeuo pipefail
# shellcheck source=lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

MODE=run
case "${1:-}" in
    "") ;;
    --check|--dry-run) MODE=check ;;
    -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "FAIL: unknown argument '${1}' (expected nothing or --check)" >&2; exit 2 ;;
esac
require_settings || exit 1

# --- pinned dependencies of the cluster ---------------------------------------
# The Calico manifest is pinned by URL and SHA256 (the apply fails closed on a
# mismatch); chart versions are the stable releases at pin time.
CALICO_VERSION="v3.28.2"
CALICO_MANIFEST_URL="https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION}/manifests/calico.yaml"
CALICO_MANIFEST_SHA256="be59408bf990e96276f631d2f9285c2a0f9802194c0ad1cecdb6d9c52623a1c8"
INGRESS_NGINX_CHART_VERSION="4.15.1"
CERT_MANAGER_CHART_VERSION="v1.21.3"
ESO_CHART_VERSION="2.14.0"
# The OpenBao wrapper renders a PrometheusRule and a ServiceMonitor, the
# postgres chart a PodMonitor: without their CRDs helm aborts ("no matches for
# kind"). Only the CRDs are installed, no Prometheus.
PROM_CRD_BASE="https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/v0.86.2/example/prometheus-operator-crd"

# helm 4 waits by default and runs post-install hooks only after the wait:
# wait on hooks only. The deployment repo ignores every chart's charts/ and
# Chart.lock, so subcharts are fetched on install (public repositories and the
# public XFSC registry).
WAIT_FLAG="--wait=hookOnly"
DEP_FLAG="--dependency-update"
WSTACK_EXCLUDES="tenant Policies Didcomm Tools"   # as the ocm-wstack ApplicationSet

mkdir -p "${WSTACK_STATE_DIR}"
chmod 700 "${WSTACK_STATE_DIR}"
CHARTS="${WSTACK_STATE_DIR}/charts"

# --- the deployment clone and its pin ----------------------------------------
deployment_pin_check() {
    local want head dirty
    want="$(sed -n '1s/^# deployment @ \([0-9a-f]\{7,40\}\).*/\1/p' "${WSTACK_LOCK}" 2>/dev/null || true)"
    [ -n "${want}" ] || { echo "FAIL: no '# deployment @ <sha>' header in ${WSTACK_LOCK}" >&2; return 1; }
    head="$(git -C "${DEPLOYMENT_DIR}" rev-parse HEAD 2>/dev/null || true)"
    [ -n "${head}" ] || { echo "FAIL: ${DEPLOYMENT_DIR} is not a git checkout" >&2; return 1; }
    if [ "${head#"${want}"}" = "${head}" ]; then
        if [ "${ALLOW_UNPINNED:-0}" = 1 ]; then
            echo "WARN: deployment clone at ${head:0:7}, the lock says ${want}: ALLOW_UNPINNED=1, continuing; this is not the pinned W-Stack" >&2
            return 0
        fi
        echo "FAIL: deployment clone at ${head:0:7}, but ${WSTACK_LOCK##*/} was built from ${want}:" >&2
        echo "  git -C \"${DEPLOYMENT_DIR}\" fetch && git -C \"${DEPLOYMENT_DIR}\" checkout ${want}" >&2
        echo "  (or ALLOW_UNPINNED=1 to deploy another commit knowingly)" >&2
        return 1
    fi
    dirty="$(git -C "${DEPLOYMENT_DIR}" status --porcelain --untracked-files=no 2>/dev/null || true)"
    [ -z "${dirty}" ] || echo "WARN: the deployment clone has local changes; the charts may differ from the pin" >&2
    echo "  deployment clone at ${want} (the lock's commit)"
}

# --- patched chart copies (the deployment clone is never modified) ------------
# The app-namespace hook reads the type of an existing secrets engine with a
# sed over `bao secrets list -format=json` that stops at the first nested "}":
# on OpenBao 2.5 it never finds it ("Could not determine mount type"), so every
# re-run of a namespace's access fails. The copy reads the table format instead.
APPNS_SRC="${DEPLOYMENT_DIR}/INFRA/app-management/app-namespace"
APPNS_CHART="${CHARTS}/app-namespace"
APPNS_VALUES="${DEPLOYMENT_DIR}/INFRA/app-management/app-namespace-values"
prepare_appns_chart() {
    [ -d "${APPNS_SRC}" ] || { echo "  MISSING: ${APPNS_SRC}" >&2; return 1; }
    rm -rf "${APPNS_CHART}" && mkdir -p "${CHARTS}" && cp -r "${APPNS_SRC}" "${APPNS_CHART}"
    python3 - "${APPNS_CHART}/templates/openbao-access-provision-job.yaml" <<'PYEOF'
import re, sys
p = sys.argv[1]; s = open(p).read()
pat = re.compile(r'echo "\$MOUNTS_JSON" \|\s*\n\s*sed -n \\\s*\n\s*"s#[^\n]*#p"')
new = 'bao secrets list | awk -v m="${STORE_MOUNT}/" \'$1 == m {print $2}\''
s2, n = pat.subn(new, s)
if n != 1:
    sys.exit("app-namespace patch: expected 1 sed mount-type detection, found %d: the upstream chart changed, re-check the workaround" % n)
open(p, 'w').write(s2)
PYEOF
    echo "  patched app-namespace chart (mount type detection): ${APPNS_CHART}"
}
# The cassandra chart sets MAX_HEAP_SIZE/HEAP_NEWSIZE on the init container
# only: the main container sizes its heap from the host's memory and is killed
# at its limit on a large machine, or restarted in a loop by its 1 s probes on
# a loaded one. A patch after the install cannot help (the install waits on a
# hook that waits for cassandra), so the copy sets the heap on the main
# container and gives the probes time; the install sets a small heap.
CASS_SRC="${DEPLOYMENT_DIR}/INFRA/storage/cassandra"
CASS_CHART="${CHARTS}/cassandra"
CASS_SET="--set cluster.heap.max=512M --set cluster.heap.new=128M --set resources.requests.memory=1Gi --set resources.limits.memory=3Gi"
prepare_cassandra_chart() {
    [ -d "${CASS_SRC}" ] || { echo "  MISSING: ${CASS_SRC}" >&2; return 1; }
    rm -rf "${CASS_CHART}" && mkdir -p "${CHARTS}" && cp -r "${CASS_SRC}" "${CASS_CHART}"
    python3 - "${CASS_CHART}/templates/statefulset.yaml" <<'PYEOF'
import sys
p = sys.argv[1]; s = open(p).read()
seeds = ("            - name: CASSANDRA_SEEDS\n"
         "              value: {{ include \"cass.seed\" . | quote }}\n")
heap = seeds + ("            - name: MAX_HEAP_SIZE\n"
                "              value: {{ .Values.cluster.heap.max | quote }}\n"
                "            - name: HEAP_NEWSIZE\n"
                "              value: {{ .Values.cluster.heap.new | quote }}\n")
if s.count(seeds) != 1:
    sys.exit("cassandra patch: CASSANDRA_SEEDS env block not found exactly once: the upstream chart changed, re-check the workaround")
s = s.replace(seeds, heap)
probe = "command: [/bin/bash, -ec, 'nodetool statusbinary | grep -q running']\n"
n = s.count(probe)
if n != 3:
    sys.exit("cassandra patch: expected 3 nodetool probes, found %d" % n)
s = s.replace(probe, probe + "            timeoutSeconds: 15\n")
open(p, 'w').write(s)
PYEOF
    echo "  patched cassandra chart (heap on the main container, probe timeouts): ${CASS_CHART}"
}

slug() { # chart dir -> release name; "Status List Service Chart" -> status-list-service
    # The release name also names the service's database role: keep it stable.
    printf '%s' "$1" | tr '[:upper:] ' '[:lower:]-' | sed 's/-chart$//; s/--*/-/g; s/^-//; s/-$//'
}

# --- 1. the cluster -------------------------------------------------------------
create_cluster() {
    command -v kind >/dev/null || { echo "FAIL: missing tool: kind" >&2; return 1; }
    if ! kind get clusters 2>/dev/null | grep -qx "${WSTACK_CLUSTER}"; then
        local cfg="${WSTACK_STATE_DIR}/kind-config.yaml"
        cp "${LOCAL_DIR}/kind-config.yaml" "${cfg}"
        if [ "${WSTACK_HOST_PORTS}" = 1 ]; then
            printf '    extraPortMappings:\n      - {containerPort: 80, hostPort: 80, protocol: TCP}\n      - {containerPort: 443, hostPort: 443, protocol: TCP}\n' >> "${cfg}"
        fi
        KIND_EXPERIMENTAL_DOCKER_NETWORK="${WSTACK_NETWORK}" kind create cluster --name "${WSTACK_CLUSTER}" --config "${cfg}"
    fi
    require_local_context
    check_node_ip
    "${K[@]}" get nodes >/dev/null
}
install_calico() {
    if ! "${K[@]}" -n kube-system get ds calico-node >/dev/null 2>&1; then
        curl -sSL "${CALICO_MANIFEST_URL}" -o "${WSTACK_STATE_DIR}/calico.yaml"
        echo "${CALICO_MANIFEST_SHA256}  ${WSTACK_STATE_DIR}/calico.yaml" | sha256sum -c - >/dev/null \
            || { echo "FAIL: ${CALICO_MANIFEST_URL} does not match the pinned SHA256" >&2; return 1; }
        "${K[@]}" apply -f "${WSTACK_STATE_DIR}/calico.yaml"
    fi
    "${K[@]}" -n kube-system rollout status ds/calico-node --timeout=300s
    "${K[@]}" -n kube-system rollout status deployment/calico-kube-controllers --timeout=180s
    "${K[@]}" -n kube-system rollout status deployment/coredns --timeout=180s
}
install_cluster_charts() {
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
    helm repo add jetstack https://charts.jetstack.io >/dev/null 2>&1 || true
    helm repo add external-secrets https://charts.external-secrets.io >/dev/null 2>&1 || true
    helm repo update ingress-nginx jetstack external-secrets >/dev/null
    "${H[@]}" upgrade --install ingress-nginx ingress-nginx/ingress-nginx --version "${INGRESS_NGINX_CHART_VERSION}" \
        -n ingress-nginx --create-namespace --wait \
        --set controller.hostPort.enabled=true \
        --set controller.hostPort.ports.http=80 --set controller.hostPort.ports.https=443 \
        --set controller.config.ssl-protocols="TLSv1.3" \
        --set controller.extraArgs.default-ssl-certificate="${SUPPORT_NS}/tenant-tls"
    "${H[@]}" upgrade --install cert-manager jetstack/cert-manager --version "${CERT_MANAGER_CHART_VERSION}" \
        -n cert-manager --create-namespace --wait --set crds.enabled=true
    "${K[@]}" apply -f "${LOCAL_DIR}/manifests/selfsigned-issuer.yaml"
    "${H[@]}" upgrade --install external-secrets external-secrets/external-secrets --version "${ESO_CHART_VERSION}" \
        -n external-secrets --create-namespace --wait
}

# --- 2. helpers called from the W-Stack plan ----------------------------------
# The envoy chart defaults to a cloud LoadBalancer, which stays pending on kind:
# it runs as a NodePort, and the tenant's HTTPS listener (443) is pinned to
# GW_NODEPORT once the listener exists.
pin_gateway_nodeport() {
    local svc="" idx="" cur
    for _ in $(seq 1 60); do
        svc="$("${K[@]}" -n "${NS_INFRA}" get svc -l gateway.envoyproxy.io/owning-gateway-name=envoy-gateway \
            -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
        idx="$("${K[@]}" -n "${NS_INFRA}" get svc "${svc}" -o json 2>/dev/null \
            | jq -r '[.spec.ports[].port] | index(443) // empty' 2>/dev/null || true)"
        [ -n "${svc}" ] && [ -n "${idx}" ] && break
        sleep 5
    done
    if [ -z "${idx}" ]; then
        echo "FAIL: the envoy Service has no 443 port after 5 minutes: the tenant's HTTPS listener is not programmed" >&2
        "${K[@]}" -n "${TENANT_NS}" get listenerset,certificate >&2 || true
        return 1
    fi
    cur="$("${K[@]}" -n "${NS_INFRA}" get svc "${svc}" -o jsonpath="{.spec.ports[${idx}].nodePort}")"
    [ "${cur}" = "${GW_NODEPORT}" ] && { echo "  envoy ${svc}: 443 on nodePort ${GW_NODEPORT}"; return 0; }
    "${K[@]}" -n "${NS_INFRA}" patch svc "${svc}" --type=json \
        -p "[{\"op\":\"replace\",\"path\":\"/spec/ports/${idx}/nodePort\",\"value\":${GW_NODEPORT}}]" >/dev/null
    echo "  envoy ${svc}: 443 pinned to nodePort ${GW_NODEPORT} (was ${cur})"
}
# The repository's network policies, once their namespaces exist (they come
# with the identity network policy files when present in this checkout).
apply_network_policies() {
    local f ns missing found=0
    for f in "${REPO_ROOT}/infrastructure/networkpolicy/identity-ingress.yaml"; do
        [ -f "${f}" ] || continue
        found=1; missing=""
        for ns in $(grep -E '^[[:space:]]+namespace:' "${f}" | awk '{print $2}' | sort -u); do
            "${K[@]}" get namespace "${ns}" >/dev/null 2>&1 || missing="${missing} ${ns}"
        done
        if [ -n "${missing}" ]; then echo "  skipped ${f#"${REPO_ROOT}/"}: namespace(s)${missing} missing"; continue; fi
        "${K[@]}" apply -f "${f}" >/dev/null && did "applied ${f#"${REPO_ROOT}/"}"
        # with policies in force, the did:web ingress must still reach the signer
        jq -n --arg tns "${TENANT_NS}" '{apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy",
          metadata: {name: "allow-signer-from-ingress-nginx", namespace: $tns},
          spec: {podSelector: {matchLabels: {"app.kubernetes.io/name": "signer"}}, policyTypes: ["Ingress"],
                 ingress: [{from: [{namespaceSelector: {matchLabels: {"kubernetes.io/metadata.name": "ingress-nginx"}}}],
                            ports: [{port: 8080, protocol: "TCP"}]}]}}' | "${K[@]}" apply -f - >/dev/null \
            && did "the did:web ingress may reach the signer"
    done
    [ "${found}" = 1 ] || echo "  no identity network policies in this checkout: the W-Stack namespaces stay open"
}

# --- 3. local trust: signing key, CA, did:web, CA bundles, profile -------------
# The tenant chart's hook does not create the transit key where the signer
# reads it (<namespace>/<group>/keys/<key>): create it there.
BAO_SESSION=0
trap '[ "${BAO_SESSION}" = 1 ] && bao_logout' EXIT   # no root token left cached in the pod
tenant_signing_key() {
    bao_login || { echo "FAIL: OpenBao login with the bootstrap root token failed" >&2; return 1; }
    BAO_SESSION=1
    if bao secrets list -format=json 2>/dev/null | grep -q "\"${TENANT_NS}/${TENANT_GROUP}/\""; then
        echo "  transit engine ${TENANT_NS}/${TENANT_GROUP} present"
    else
        # "path is already in use" is fine; never disable a mount (it deletes its keys)
        bao secrets enable -path="${TENANT_NS}/${TENANT_GROUP}" transit >/dev/null 2>&1 || true
        did "transit engine mounted at ${TENANT_NS}/${TENANT_GROUP}"
    fi
    if bao read "${TENANT_NS}/${TENANT_GROUP}/keys/${TENANT_KEY}" >/dev/null 2>&1; then
        echo "  key ${TENANT_KEY} present"
    else
        bao write -f "${TENANT_NS}/${TENANT_GROUP}/keys/${TENANT_KEY}" type=ecdsa-p256 >/dev/null
        "${K[@]}" -n "${TENANT_NS}" delete pod -l app.kubernetes.io/name=signer --wait=true >/dev/null 2>&1 || true
        "${K[@]}" -n "${TENANT_NS}" wait deploy/signer --for=condition=available --timeout=180s >/dev/null
        did "key ${TENANT_KEY} created (ecdsa-p256), signer restarted"
    fi
    bao_logout; BAO_SESSION=0
}
# The pre-authorization bridge (the OID4VCI pre-authorized code flow) must run.
bridge_replica() {
    local r; r="$("${K[@]}" -n "${TENANT_NS}" get deploy pre-authorization-bridge -o jsonpath='{.spec.replicas}' 2>/dev/null || echo)"
    if [ "${r}" = 0 ]; then
        "${K[@]}" -n "${TENANT_NS}" scale deploy pre-authorization-bridge --replicas=1 >/dev/null
        did "pre-authorization-bridge scaled to 1"
    fi
}
# A local CA (kept in WSTACK_STATE_DIR, renewed when it expires within 7 days)
# and the tenant host's certificate, as the secret <SUPPORT_NS>/tenant-tls:
# ingress-nginx serves it on 443, and the guard's level-2 routes reuse it.
CA_DIR="${WSTACK_STATE_DIR}/ca"
local_ca() {
    local why="" f
    mkdir -p "${CA_DIR}"; chmod 700 "${CA_DIR}"
    for f in ca.crt ca.key srv.crt srv.key; do [ -s "${CA_DIR}/${f}" ] || why="missing ${f}"; done
    [ -n "${why}" ] || for f in ca.crt srv.crt; do
        openssl x509 -checkend 604800 -noout -in "${CA_DIR}/${f}" >/dev/null 2>&1 || why="${f} expires within 7 days"
    done
    [ -n "${why}" ] || openssl x509 -noout -ext subjectAltName -in "${CA_DIR}/srv.crt" 2>/dev/null | grep -q "DNS:${TENANT_HOST}" \
        || why="certificate not for ${TENANT_HOST}"
    if [ -n "${why}" ]; then
        rm -f "${CA_DIR}/ca.srl"
        openssl req -x509 -newkey rsa:2048 -keyout "${CA_DIR}/ca.key" -out "${CA_DIR}/ca.crt" -days 365 -nodes \
            -subj "/CN=wstack-local-ca" -addext "basicConstraints=critical,CA:TRUE" \
            -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
        openssl req -newkey rsa:2048 -keyout "${CA_DIR}/srv.key" -out "${CA_DIR}/srv.csr" -nodes -subj "/CN=${TENANT_HOST}" 2>/dev/null
        printf 'subjectAltName=DNS:%s\n' "${TENANT_HOST}" > "${CA_DIR}/ext.cnf"
        openssl x509 -req -in "${CA_DIR}/srv.csr" -CA "${CA_DIR}/ca.crt" -CAkey "${CA_DIR}/ca.key" -CAcreateserial \
            -out "${CA_DIR}/srv.crt" -days 365 -extfile "${CA_DIR}/ext.cnf" 2>/dev/null
        chmod 600 "${CA_DIR}"/*.key
        did "local CA and ${TENANT_HOST} certificate (re)generated (${why}): ${CA_DIR}/ca.crt"
    fi
    "${K[@]}" create namespace "${SUPPORT_NS}" --dry-run=client -o yaml | "${K[@]}" apply -f - >/dev/null
    "${K[@]}" -n "${SUPPORT_NS}" create secret tls tenant-tls --cert="${CA_DIR}/srv.crt" --key="${CA_DIR}/srv.key" \
        --dry-run=client -o yaml | "${K[@]}" apply -f - >/dev/null
}
# The tenant's did:web document on https://<tenant host>/.well-known/did.json:
# an ingress to the signer, with the tenant's headers. Inside the cluster the
# tenant host resolves to ingress-nginx (CoreDNS hosts entry), so the W-Stack
# services resolve the DID over TLS too.
did_web() {
    jq -n --arg ns "${SUPPORT_NS}" --arg host "${TENANT_HOST}" --arg tns "${TENANT_NS}" '
    {apiVersion: "v1", kind: "List", items: [
      {apiVersion: "v1", kind: "Service", metadata: {name: "did-web-signer", namespace: $ns},
       spec: {type: "ExternalName", externalName: ("signer." + $tns + ".svc.cluster.local"), ports: [{port: 8080}]}},
      {apiVersion: "networking.k8s.io/v1", kind: "Ingress",
       metadata: {name: "did-web", namespace: $ns,
                  annotations: {"nginx.ingress.kubernetes.io/backend-protocol": "HTTP",
                                "nginx.ingress.kubernetes.io/rewrite-target": "/v1/did/document"}},
       spec: {ingressClassName: "nginx", tls: [{hosts: [$host], secretName: "tenant-tls"}],
              rules: [{host: $host, http: {paths: [{path: "/.well-known/did.json", pathType: "Exact",
                       backend: {service: {name: "did-web-signer", port: {number: 8080}}}}]}}]}}]}' | "${K[@]}" apply -f - >/dev/null
    # A policy selecting the signer alone would cut it off from the tenant gateway
    # and the W-Stack services (its JWKS, used by the issuance service, timed out):
    # the ingress allowance is applied with the repository's policies only (see
    # apply_network_policies). Remove one left by an earlier version of this script.
    "${K[@]}" -n "${TENANT_NS}" delete networkpolicy allow-signer-from-ingress-nginx --ignore-not-found >/dev/null
    # the signer reads the tenant from request headers
    "${K[@]}" -n ingress-nginx create configmap tenant-headers \
        --from-literal=X-HOST="https://${TENANT_HOST}" --from-literal=X-DID="${TENANT_DID}" \
        --from-literal=X-KEY="${TENANT_KEY}" --from-literal=X-GROUP="${TENANT_GROUP}" \
        --from-literal=X-NAMESPACE="${TENANT_NS}" --from-literal=X-ENGINE=transit \
        --from-literal=X-ISSUERKID="${TENANT_KEY}" --from-literal=X-GROUPID="${TENANT_GROUP}" \
        --dry-run=client -o yaml | "${K[@]}" apply -f - >/dev/null
    "${K[@]}" -n ingress-nginx patch configmap ingress-nginx-controller --type merge \
        -p '{"data":{"proxy-set-headers":"ingress-nginx/tenant-headers"}}' >/dev/null
    local nginx_ip
    nginx_ip="$("${K[@]}" -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.spec.clusterIP}')"
    "${K[@]}" -n kube-system get configmap coredns -o json | HOST="${TENANT_HOST}" IP="${nginx_ip}" python3 -c '
import json, os, re, sys
cm = json.load(sys.stdin); host, ip = os.environ["HOST"], os.environ["IP"]
corefile = cm["data"].get("Corefile", "")
corefile = re.sub(r"^\s*\S+\s+" + re.escape(host) + r"\s*$\n?", "", corefile, flags=re.M)
entry = "       " + ip + " " + host
if "hosts {" not in corefile:
    corefile = corefile.replace("    ready\n", "    ready\n    hosts {\n" + entry + "\n       fallthrough\n    }\n", 1)
else:
    corefile = corefile.replace("    hosts {\n", "    hosts {\n" + entry + "\n", 1)
cm["data"]["Corefile"] = corefile
print(json.dumps(cm))' | "${K[@]}" apply -f - >/dev/null
    "${K[@]}" -n kube-system rollout restart deployment/coredns >/dev/null
    "${K[@]}" -n kube-system rollout status deployment/coredns --timeout=180s >/dev/null
    did "did:web of ${TENANT_DID} on 443 (ingress-nginx), in-cluster name -> ${nginx_ip}"
}
# The W-Stack services fetch DID documents and status lists over HTTPS: mount
# a bundle (system CAs + the local CA + the envoy gateway's CA) as their
# SSL_CERT_FILE; the Java universal resolver gets a truststore, its Node driver
# NODE_EXTRA_CA_CERTS. Restarted when the bundle changed.
CA_DEPLOYMENTS="signer credential-verification-service sd-jwt-service status-list-service-deployment
    credential-retrieval-service issuance-service well-known-service storage-service policy
    dummycontentsigner pre-authorization-bridge offering-dummy-credential-offering-bootstrap"
ca_bundles() {
    local before after d names
    "${K[@]}" -n "${NS_INFRA}" exec deploy/nats-box -- cat /etc/ssl/certs/ca-certificates.crt > "${CA_DIR}/system-ca.crt" 2>/dev/null || true
    cat "${CA_DIR}/system-ca.crt" "${CA_DIR}/ca.crt" > "${CA_DIR}/bundle.crt"
    "${K[@]}" -n "${NS_INFRA}" get secret envoy -o jsonpath='{.data.ca\.crt}' 2>/dev/null | base64 -d >> "${CA_DIR}/bundle.crt" || true
    before="$({ "${K[@]}" -n "${TENANT_NS}" get configmap wstack-local-ca -o jsonpath='{.data.ca\.crt}' 2>/dev/null || true; } | sha256sum)"
    "${K[@]}" -n "${TENANT_NS}" create configmap wstack-local-ca --from-file=ca.crt="${CA_DIR}/bundle.crt" \
        --dry-run=client -o yaml | "${K[@]}" apply -f - >/dev/null
    after="$({ "${K[@]}" -n "${TENANT_NS}" get configmap wstack-local-ca -o jsonpath='{.data.ca\.crt}' 2>/dev/null || true; } | sha256sum)"
    for d in ${CA_DEPLOYMENTS}; do
        names="$("${K[@]}" -n "${TENANT_NS}" get deploy "${d}" -o jsonpath='{.spec.template.spec.containers[*].name}' 2>/dev/null || true)"
        [ -n "${names}" ] || continue
        # shellcheck disable=SC2086
        python3 - ${names} > "${WSTACK_STATE_DIR}/ca-patch.json" <<'PYEOF'
import json, sys
print(json.dumps({"spec": {"template": {"spec": {
    "volumes": [{"name": "local-ca", "configMap": {"name": "wstack-local-ca"}}],
    "containers": [{"name": n,
                    "env": [{"name": "SSL_CERT_FILE", "value": "/etc/ssl/certs/ca-certificates.crt"}],
                    "volumeMounts": [{"name": "local-ca", "mountPath": "/etc/ssl/certs/ca-certificates.crt", "subPath": "ca.crt"}]}
                   for n in sys.argv[1:]]}}}}))
PYEOF
        "${K[@]}" -n "${TENANT_NS}" patch deploy "${d}" --type strategic --patch-file "${WSTACK_STATE_DIR}/ca-patch.json" >/dev/null \
            || echo "  WARN: CA bundle not mounted in ${d}" >&2
        [ "${before}" = "${after}" ] || "${K[@]}" -n "${TENANT_NS}" rollout restart deploy "${d}" >/dev/null 2>&1 || true
    done
    # Java truststore (PKCS12, made with keytool in a JDK container) and the Node driver's CA
    local storepass=changeit   # a truststore holds public certificates only
    if docker run --rm -v "${CA_DIR}:/work" eclipse-temurin:21-jdk sh -c \
        "rm -f /work/cacerts.p12 && keytool -importcert -noprompt -alias wstack-local-ca -file /work/ca.crt -keystore /work/cacerts.p12 -storetype PKCS12 -storepass ${storepass}" >/dev/null 2>&1; then
        "${K[@]}" -n "${NS_INFRA}" create configmap wstack-local-cacerts --from-file=cacerts.p12="${CA_DIR}/cacerts.p12" \
            --dry-run=client -o yaml | "${K[@]}" apply -f - >/dev/null
        "${K[@]}" -n "${NS_INFRA}" patch deploy universal-resolver --type strategic -p "{\"spec\":{\"template\":{\"spec\":{
            \"volumes\":[{\"name\":\"local-cacerts\",\"configMap\":{\"name\":\"wstack-local-cacerts\"}}],
            \"containers\":[{\"name\":\"uni-resolver-web\",
              \"env\":[{\"name\":\"JAVA_TOOL_OPTIONS\",\"value\":\"-Djavax.net.ssl.trustStore=/etc/local-cacerts/cacerts.p12 -Djavax.net.ssl.trustStorePassword=${storepass} -Djavax.net.ssl.trustStoreType=PKCS12\"}],
              \"volumeMounts\":[{\"name\":\"local-cacerts\",\"mountPath\":\"/etc/local-cacerts\"}]}]}}}}" >/dev/null \
            || echo "  WARN: truststore not mounted in universal-resolver" >&2
    else
        echo "  WARN: keytool (eclipse-temurin:21-jdk) failed: the universal resolver will not trust the local CA" >&2
    fi
    "${K[@]}" -n "${NS_INFRA}" create configmap wstack-local-ca-only --from-file=ca.crt="${CA_DIR}/ca.crt" \
        --dry-run=client -o yaml | "${K[@]}" apply -f - >/dev/null
    "${K[@]}" -n "${NS_INFRA}" patch deploy universal-resolver-uport-driver --type strategic -p '{"spec":{"template":{"spec":{
        "volumes":[{"name":"local-ca-only","configMap":{"name":"wstack-local-ca-only"}}],
        "containers":[{"name":"uport-resolver","env":[{"name":"NODE_EXTRA_CA_CERTS","value":"/etc/local-ca/ca.crt"}],
          "volumeMounts":[{"name":"local-ca-only","mountPath":"/etc/local-ca"}]}]}}}}' >/dev/null 2>&1 \
        || echo "  WARN: CA not mounted in universal-resolver-uport-driver" >&2
    for d in ${CA_DEPLOYMENTS}; do
        "${K[@]}" -n "${TENANT_NS}" get deploy "${d}" >/dev/null 2>&1 || continue
        "${K[@]}" -n "${TENANT_NS}" rollout status deploy "${d}" --timeout="${WSTACK_TIMEOUT}s" >/dev/null \
            || echo "  WARN: ${d} not available after ${WSTACK_TIMEOUT}s" >&2
    done
    "${K[@]}" -n "${NS_INFRA}" rollout status deploy/universal-resolver deploy/universal-resolver-uport-driver \
        --timeout="${WSTACK_TIMEOUT}s" >/dev/null || echo "  WARN: universal resolver not available" >&2
    did "local CA trusted by the W-Stack services"
}
# The verifier's presentation profile for interactive (wallet) logins. Created
# with an example policy when the tenant has none; relying parties add their
# own permission sets (the guard: services/guard/local/wstack/verifier-profile.sh).
verifier_profile() {
    local port=28083 pf url code
    "${K[@]}" -n "${TENANT_NS}" port-forward svc/credential-verification-service "${port}:8080" >/dev/null 2>&1 & pf=$!
    for _ in $(seq 1 20); do curl -s -o /dev/null "http://127.0.0.1:${port}/" && break; sleep 0.5; done
    url="http://127.0.0.1:${port}/v1/tenants/${TENANT}/internal/presentation-profiles/verifier/human"
    code="$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' -H "x-groupid: ${TENANT_GROUP}" "${url}" || echo 000)"
    if [ "${code}" = 200 ]; then
        echo "  verifier/human profile present"
    else
        jq -n --arg did "${TENANT_DID}" --arg origin "https://${TENANT_HOST}" --arg ns "${TENANT_NS}" \
              --arg g "${TENANT_GROUP}" --arg k "${TENANT_KEY}" --arg vct "https://${TENANT_HOST}/api/schema/SD_JWT_DEVELOPER_CREDENTIAL" '
          {enabled: true, did: $did, origin: $origin, keyNamespace: $ns, keyGroup: $g, keyId: $k,
           signingAlgorithm: "ES256", responseMode: "direct_post", requestObjectTtlSeconds: 300,
           presentationPolicies: {example: {credentials: [{id: "credential", format: "dc+sd-jwt", meta: {vct_values: [$vct]}}]}}}' \
          | curl -s --max-time 15 -X PUT -H "x-groupid: ${TENANT_GROUP}" -H 'Content-Type: application/json' \
                --data @- -o /dev/null -w '%{http_code}' "${url}" | grep -q '^2' \
          && did "verifier/human profile created (example policy)" \
          || echo "  WARN: the verifier did not accept the verifier/human profile" >&2
    fi
    kill "${pf}" 2>/dev/null || true
}

# --- the plan ---------------------------------------------------------------------
# "<label>|<command>": printed by --check, run in order otherwise.
plan=()
plan+=("kind cluster ${WSTACK_CLUSTER} (no CNI, network ${WSTACK_NETWORK})|create_cluster")
plan+=("Calico ${CALICO_VERSION} (NetworkPolicy enforcement)|install_calico")
plan+=("ingress-nginx (TLS 1.3, 443), cert-manager + selfsigned-issuer, External Secrets Operator|install_cluster_charts")
plan+=("monitoring CRDs (PrometheusRule, ServiceMonitor, PodMonitor) for the OpenBao and postgres charts|${K[*]} apply --server-side -f ${PROM_CRD_BASE}/monitoring.coreos.com_prometheusrules.yaml -f ${PROM_CRD_BASE}/monitoring.coreos.com_servicemonitors.yaml -f ${PROM_CRD_BASE}/monitoring.coreos.com_podmonitors.yaml")
plan+=("openbao (ns security)|${H[*]} upgrade --install openbao \"${DEPLOYMENT_DIR}/INFRA/security/openbao\" -n security --create-namespace ${DEP_FLAG} ${WAIT_FLAG}")
plan+=("XFSC kubernetes-operator (ns security)|${H[*]} upgrade --install kubernetes-operator \"${DEPLOYMENT_DIR}/INFRA/kubernetes-operator\" -n security ${DEP_FLAG} ${WAIT_FLAG}")
# its mutating webhook (failurePolicy Fail) refuses every later workload until it serves
plan+=("wait: the operator's webhook serves|${K[*]} -n security wait --for=condition=Available deploy --all --timeout=300s")
plan+=("infrastructure namespace and its OpenBao access (patched app-namespace chart)|${H[*]} upgrade --install infrastructure-namespace \"${APPNS_CHART}\" -n infrastructure --create-namespace --take-ownership -f \"${APPNS_VALUES}/infra-values.yaml\" ${WAIT_FLAG}")
plan+=("postgres-operator|${H[*]} upgrade --install postgres-operator \"${DEPLOYMENT_DIR}/INFRA/storage/postgres-operator\" -n infrastructure ${DEP_FLAG} ${WAIT_FLAG}")
plan+=("wait: postgres-operator webhooks|${K[*]} -n infrastructure wait --for=condition=Available deploy --all --timeout=300s")
plan+=("redis-operator|${H[*]} upgrade --install redis-operator \"${DEPLOYMENT_DIR}/INFRA/storage/redis-operator\" -n infrastructure ${DEP_FLAG} ${WAIT_FLAG}")
plan+=("wait: redis-operator|${K[*]} -n infrastructure wait --for=condition=Available deploy --all --timeout=300s")
plan+=("postgres|${H[*]} upgrade --install postgres \"${DEPLOYMENT_DIR}/INFRA/storage/postgres\" -n infrastructure ${DEP_FLAG} ${WAIT_FLAG}")
plan+=("redis|${H[*]} upgrade --install redis \"${DEPLOYMENT_DIR}/INFRA/storage/redis\" -n infrastructure ${DEP_FLAG} ${WAIT_FLAG}")
plan+=("cassandra (patched chart, small heap)|${H[*]} upgrade --install cassandra \"${CASS_CHART}\" -n infrastructure ${CASS_SET} ${DEP_FLAG} ${WAIT_FLAG}")
plan+=("nats|${H[*]} upgrade --install nats \"${DEPLOYMENT_DIR}/INFRA/core/nats\" -n infrastructure ${DEP_FLAG} ${WAIT_FLAG}")
plan+=("universal-resolver|${H[*]} upgrade --install universal-resolver \"${DEPLOYMENT_DIR}/INFRA/core/universal-resolver\" -n infrastructure ${DEP_FLAG} ${WAIT_FLAG}")
plan+=("envoy gateway (NodePort on kind)|${H[*]} upgrade --install envoy-gateway \"${DEPLOYMENT_DIR}/INFRA/network/envoy\" -n infrastructure --set envoyProxy.service.type=NodePort ${DEP_FLAG} ${WAIT_FLAG}")
plan+=("TLS 1.3 minimum on the gateway|${K[*]} apply -f \"${LOCAL_DIR}/manifests/gateway-tls13.yaml\"")
plan+=("${TENANT_NS} namespace and its OpenBao access (patched app-namespace chart)|${H[*]} upgrade --install ${TENANT_NS}-namespace \"${APPNS_CHART}\" -n ${TENANT_NS} --create-namespace --take-ownership -f \"${APPNS_VALUES}/ocm-wstack-values.yaml\" ${WAIT_FLAG}")
wstack_charts=()
if [ -d "${DEPLOYMENT_DIR}/OCM W-Stack" ]; then
    for d in "${DEPLOYMENT_DIR}/OCM W-Stack"/*/; do
        [ -f "${d}Chart.yaml" ] || continue
        base="$(basename "${d}")"; skip=0
        for ex in ${WSTACK_EXCLUDES}; do [ "${base}" = "${ex}" ] && skip=1; done
        [ "${skip}" = 1 ] || wstack_charts+=("$(slug "${base}") ${d}")
    done
fi
for entry in "${wstack_charts[@]}"; do
    rel="${entry%% *}"; dir="${entry#* }"
    plan+=("W-Stack chart ${rel}|${H[*]} upgrade --install \"${rel}\" \"${dir}\" -n ${TENANT_NS} ${DEP_FLAG} ${WAIT_FLAG}")
done
# tenant.group and openbao.transit.mountPath put the tenant's key at
# <namespace>/<group>/keys/<key>, where the signer reads it (the upstream
# values default the group to demo-tenant)
plan+=("tenant chart (${TENANT_HOST})|${H[*]} upgrade --install ${TENANT}-tenant \"${DEPLOYMENT_DIR}/XFSC/tenant/chart\" -n ${TENANT_NS} -f \"${DEPLOYMENT_DIR}/XFSC/tenant/values/tenant-ocm-wstack-values.yaml\" --set tenant.id=${TENANT} --set tenant.namespace=${TENANT_NS} --set tenant.groupid=${TENANT_GROUP} --set tenant.group=${TENANT_GROUP} --set openbao.transit.mountPath=${TENANT_NS}/${TENANT_GROUP} --set tenant.subdomain=${TENANT} --set tenant.domain=${WSTACK_ZONE} --set tenant.key=${TENANT_KEY} --set certificate.issuerRef.name=selfsigned-issuer ${DEP_FLAG} ${WAIT_FLAG}")
plan+=("tenant HTTPS listener on nodePort ${GW_NODEPORT}|pin_gateway_nodeport")
plan+=("tenant signing key in OpenBao (${TENANT_NS}/${TENANT_GROUP}/keys/${TENANT_KEY})|tenant_signing_key")
plan+=("pre-authorization bridge running|bridge_replica")
plan+=("local CA and the certificate of ${TENANT_HOST}|local_ca")
plan+=("did:web document on 443, inside and outside the cluster|did_web")
plan+=("local CA trusted by the W-Stack services|ca_bundles")
plan+=("verifier presentation profile for wallet logins|verifier_profile")
plan+=("network policies of this repository (when present)|apply_network_policies")
plan+=("new pods start (Calico), tenant registrations|health_gate && register_tenant")

# --- the zone, when not set: from the node's address ------------------------
if [ -z "${WSTACK_ZONE}" ]; then
    if [ "${MODE}" = check ]; then
        ip="$(node_ip)"
        echo "WSTACK_ZONE not set: up.sh will use ${ip:-<node address>}.sslip.io${ip:+ (the address of the node)}, and keep it in ${ZONE_FILE}"
        TENANT_HOST="${TENANT}.${ip:-<node address>}.sslip.io"; TENANT_DID="did:web:${TENANT_HOST}"
    else
        echo "== WSTACK_ZONE not set: the cluster first, then <node address>.sslip.io"
        create_cluster
        ip="$(node_ip)"
        [ -n "${ip}" ] || { echo "FAIL: no address for ${WSTACK_NODE} on ${WSTACK_NETWORK}" >&2; exit 1; }
        printf 'WSTACK_ZONE=%s.sslip.io\nWSTACK_NODE_IP=${WSTACK_NODE_IP:-%s}\n' "${ip}" "${ip}" > "${ZONE_FILE}"
        did "zone ${ip}.sslip.io, node ${ip} (kept in ${ZONE_FILE}); continuing"
        exec "${BASH_SOURCE[0]}"
    fi
fi

# --- --check ------------------------------------------------------------------
if [ "${MODE}" = check ]; then
    echo "== up.sh --check: the plan; no cluster is touched"
    rc=0
    echo "cluster ${WSTACK_CLUSTER}, context ${WSTACK_CONTEXT}, network ${WSTACK_NETWORK}"
    if docker inspect "${WSTACK_NODE}" >/dev/null 2>&1; then check_node_ip || rc=1; else echo "  node ${WSTACK_NODE} not created yet"; fi
    echo "tenant ${TENANT} (${TENANT_DID}), namespace ${TENANT_NS}, group ${TENANT_GROUP}, key ${TENANT_KEY}"
    echo "state ${WSTACK_STATE_DIR}; deployment clone ${DEPLOYMENT_DIR}"
    if [ -d "${DEPLOYMENT_DIR}" ]; then
        deployment_pin_check || rc=1
        prepare_appns_chart || rc=1
        prepare_cassandra_chart || rc=1
        for p in INFRA/security/openbao INFRA/kubernetes-operator INFRA/storage/postgres-operator \
                 INFRA/storage/redis-operator INFRA/storage/postgres INFRA/storage/redis INFRA/storage/cassandra \
                 INFRA/core/nats INFRA/core/universal-resolver INFRA/network/envoy \
                 INFRA/app-management/app-namespace-values/infra-values.yaml \
                 INFRA/app-management/app-namespace-values/ocm-wstack-values.yaml \
                 XFSC/tenant/chart XFSC/tenant/values/tenant-ocm-wstack-values.yaml; do
            [ -e "${DEPLOYMENT_DIR}/${p}" ] || { echo "  MISSING: ${p}" >&2; rc=1; }
        done
        [ "${#wstack_charts[@]}" -gt 0 ] || { echo "  MISSING: no chart under OCM W-Stack/" >&2; rc=1; }
        echo "  ${#wstack_charts[@]} W-Stack charts"
    else
        echo "FAIL: no deployment clone at ${DEPLOYMENT_DIR}: git clone https://github.com/eclipse-xfsc/deployment.git \"${DEPLOYMENT_DIR}\"" >&2
        rc=1
    fi
    echo
    i=0
    for entry in "${plan[@]}"; do
        i=$((i + 1)); printf '%2d. %s\n     %s\n' "${i}" "${entry%%|*}" "${entry#*|}"
    done
    echo
    [ "${rc}" = 0 ] || { echo "CHECK FAILED: see above" >&2; exit 1; }
    echo "CHECK OK: ${#plan[@]} steps. Run without --check to execute."
    exit 0
fi

# --- run --------------------------------------------------------------------------
echo "== up.sh: local W-Stack on ${WSTACK_CONTEXT} (${TENANT_HOST})"
[ -d "${DEPLOYMENT_DIR}" ] || { echo "FAIL: no deployment clone at ${DEPLOYMENT_DIR}: git clone https://github.com/eclipse-xfsc/deployment.git \"${DEPLOYMENT_DIR}\"" >&2; exit 1; }
deployment_pin_check
prepare_appns_chart
prepare_cassandra_chart
[ "${#wstack_charts[@]}" -gt 0 ] || { echo "FAIL: no chart under ${DEPLOYMENT_DIR}/OCM W-Stack" >&2; exit 1; }
for entry in "${plan[@]}"; do
    echo; echo "=== ${entry%%|*}"
    eval "${entry#*|}" || { echo "FAIL: step '${entry%%|*}' failed: fix and re-run (every step is idempotent)" >&2; exit 1; }
done
echo
echo "Local W-Stack up: ${TENANT_DID}"
echo "  CA of its certificates: ${CA_DIR}/ca.crt     TLS secret for the tenant host: ${SUPPORT_NS}/tenant-tls"
echo "  after a reboot: ${LOCAL_DIR}/resume.sh"
