#!/usr/bin/env bash
# Level 2 of the guard's local test, W-Stack side: the public routes a wallet
# and the guard need on a local W-Stack tenant, served on 443 with a
# certificate they can verify.
#
# The tenant gateway of the W-Stack charts routes exact paths only. A wallet
# also needs the nonce and credential endpoints the issuer advertises, and every
# relying party needs to read the status lists the credentials point to. This
# adds, on the tenant gateway (same listener, same request headers as the
# tenant's issuer route):
#   POST /api/nonce        -> issuance service  /v1/tenants/<tenant>/nonce
#   POST /api/credential   -> issuance service  /v1/tenants/<tenant>/credential
#   GET  /api/status/<id>  -> status list service /v1/tenants/<tenant>/status/<id>
# and an ingress on 443 for the tenant host, with the TLS secret given, in front
# of the gateway for /api/ and the issuer's metadata, so the public URLs the
# W-Stack advertises answer as advertised.
#
# Usage: WSTACK_HOST=<tenant host> TLS_SECRET=<namespace/name> public-routes.sh
# Env:   WSTACK_CONTEXT (required: the W-Stack cluster), TENANT (default: the host's
#        first label), NS (default ocm-wstack), GW_NS (default infrastructure),
#        INGRESS_CLASS (default nginx). --delete removes what it added.
set -euo pipefail
ctx="${WSTACK_CONTEXT:?set WSTACK_CONTEXT (kubectl context of the W-Stack cluster)}"
host="${WSTACK_HOST:?set WSTACK_HOST to the tenant host (the host of the issuer DID)}"
tenant="${TENANT:-${host%%.*}}"
ns="${NS:-ocm-wstack}"
gwns="${GW_NS:-infrastructure}"
k() { kubectl --context "${ctx}" "$@"; }
name="${tenant}-guard-local-routes"

if [ "${1:-}" = --delete ]; then
    k -n "${ns}" delete httproute "${name}" --ignore-not-found
    k -n "${gwns}" delete ingress "${name}" --ignore-not-found
    k -n "${gwns}" delete secret "${name}-tls" "${name}-upstream" --ignore-not-found
    exit 0
fi
src="${TLS_SECRET:?set TLS_SECRET to namespace/name of a TLS secret for ${host}}"

issuer_route="$(k -n "${ns}" get httproute -o json | jq -c --arg h "${host}" \
    '[.items[] | select((.spec.hostnames // []) | index($h)) | select(.spec.rules[].matches[]?.path.value == "/.well-known/openid-credential-issuer")][0]')"
[ "${issuer_route}" != null ] || { echo "no issuer route for ${host} in ${ns}" >&2; exit 1; }
parent="$(jq -c '.spec.parentRefs' <<<"${issuer_route}")"
headers="$(jq -c '[.spec.rules[].filters[]? | select(.type == "RequestHeaderModifier")][0].requestHeaderModifier.set
    + [{"name": "x-tenantId", "value": "'"${tenant}"'"}]' <<<"${issuer_route}")"
gwsvc="$(k -n "${gwns}" get svc -l gateway.envoyproxy.io/owning-gateway-name -o jsonpath='{.items[0].metadata.name}')"
[ -n "${gwsvc}" ] || { echo "no gateway service in ${gwns}" >&2; exit 1; }

echo "== gateway routes (${ns}/${name})"
jq -n --arg name "${name}" --arg h "${host}" --arg t "${tenant}" --argjson parent "${parent}" --argjson headers "${headers}" '
def rule(method; type; path; rewrite; svc):
  {matches: [{method: method, path: {type: type, value: path}}],
   filters: [
     {type: "URLRewrite", urlRewrite: {path: (if type == "Exact" then {type: "ReplaceFullPath", replaceFullPath: rewrite} else {type: "ReplacePrefixMatch", replacePrefixMatch: rewrite} end)}},
     {type: "RequestHeaderModifier", requestHeaderModifier: {set: $headers}}],
   backendRefs: [{name: svc, port: 8080}]};
{apiVersion: "gateway.networking.k8s.io/v1", kind: "HTTPRoute",
 metadata: {name: $name, labels: {"app.kubernetes.io/part-of": "guard-local"}},
 spec: {parentRefs: $parent, hostnames: [$h], rules: [
   rule("POST"; "Exact"; "/api/nonce"; "/v1/tenants/\($t)/nonce"; "issuance-service"),
   rule("POST"; "Exact"; "/api/credential"; "/v1/tenants/\($t)/credential"; "issuance-service"),
   rule("GET"; "PathPrefix"; "/api/status/"; "/v1/tenants/\($t)/status/"; "status-list-service")]}}' | k -n "${ns}" apply -f -

echo "== 443 ingress (${gwns}/${name}) -> ${gwsvc}"
k -n "${src%%/*}" get secret "${src#*/}" -o json \
  | jq --arg n "${name}-tls" '{apiVersion, kind, type, data, metadata: {name: $n, labels: {"app.kubernetes.io/part-of": "guard-local"}}}' \
  | k -n "${gwns}" apply -f -
# ingress-nginx sends the host name (SNI) to the gateway only with a proxy-ssl
# secret (it needs a ca.crt; the hop inside the cluster is not verified)
k -n "${gwns}" get secret "${name}-tls" -o json \
  | jq --arg n "${name}-upstream" '{apiVersion, kind, type: "Opaque", data: {"ca.crt": .data["tls.crt"]}, metadata: {name: $n, labels: {"app.kubernetes.io/part-of": "guard-local"}}}' \
  | k -n "${gwns}" apply -f -
jq -n --arg name "${name}" --arg h "${host}" --arg svc "${gwsvc}" --arg ns "${gwns}" --arg class "${INGRESS_CLASS:-nginx}" '
def p(path; type): {path: path, pathType: type, backend: {service: {name: $svc, port: {number: 443}}}};
{apiVersion: "networking.k8s.io/v1", kind: "Ingress",
 metadata: {name: $name, labels: {"app.kubernetes.io/part-of": "guard-local"}, annotations: {
   "nginx.ingress.kubernetes.io/backend-protocol": "HTTPS",
   "nginx.ingress.kubernetes.io/proxy-ssl-server-name": "on",
   "nginx.ingress.kubernetes.io/proxy-ssl-name": $h,
   "nginx.ingress.kubernetes.io/proxy-ssl-protocols": "TLSv1.2 TLSv1.3",
   "nginx.ingress.kubernetes.io/proxy-ssl-secret": "\($ns)/\($name)-upstream",
   "nginx.ingress.kubernetes.io/proxy-ssl-verify": "off",
   "nginx.ingress.kubernetes.io/upstream-vhost": $h}},
 spec: {ingressClassName: $class, tls: [{hosts: [$h], secretName: "\($name)-tls"}], rules: [{host: $h, http: {paths: [
   p("/api/"; "Prefix"),
   p("/.well-known/openid-credential-issuer"; "Exact"),
   p("/.well-known/openid-configuration"; "Exact"),
   p("/.well-known/jwks.json"; "Exact")]}}]}}' | k -n "${gwns}" apply -f -
echo "public routes for ${host}: nonce, credential, status lists, issuer metadata on https://${host}/"
