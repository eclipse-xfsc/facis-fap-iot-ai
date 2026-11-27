#!/usr/bin/env bash
# Local check of the DSP connector's identity flows against a local W-Stack
# (infrastructure/wstack/local): the connector accepts its participant
# credential into its tenant's wallet, presents it with a key binding from the
# tenant's crypto provider, and a counterparty's iam.verify checks it against
# the live W-Stack (issuer signature, status list, did:web). Refusals: an
# untrusted issuer at acceptance, a replayed presentation, a key binding
# signed by another key.
#
# The flows run outside ORCE (flow-run.js): their function nodes, with real
# HTTP. A local check, not a deployment test. It writes to the W-Stack: one
# participant credential in the tenant's storage, its status list entry, and
# one refused (deleted) offer.
#
# Usage: services/dsp-connector/local/wstack-identity-check.sh
# Env:   WSTACK_CONTEXT (required), WSTACK_HOST (required: the tenant host),
#        CA_FILE (the local CA of the tenant host's certificate),
#        NS (ocm-wstack), TENANT (connector), GROUP (default), KEY (eckey),
#        REGION/COUNTRY (as the retrieval service files credentials: EU/DE),
#        ISSUE_CONFIGURATION (SDJWTCredential: an SD-JWT VC configuration of
#        the issuer), ISSUE_SUBJECT (the NATS subject of the issuing plugin),
#        NATS_URL. With infrastructure/wstack/local, the defaults fit.
# Needs: kubectl, node 20+ (fetch), curl, jq.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
ctx="${WSTACK_CONTEXT:?set WSTACK_CONTEXT (kubectl context of the W-Stack cluster)}"
host="${WSTACK_HOST:?set WSTACK_HOST (the tenant host, for example connector.<zone>)}"
ns="${NS:-ocm-wstack}"
tenant="${TENANT:-connector}"
group="${GROUP:-default}"
K=(kubectl --context "${ctx}" -n "${ns}")
for t in kubectl node curl jq; do command -v "${t}" >/dev/null || { echo "missing: ${t}" >&2; exit 2; }; done
[ -z "${CA_FILE:-}" ] || export NODE_EXTRA_CA_CERTS="${CA_FILE}"
curl -sf ${CA_FILE:+--cacert "${CA_FILE}"} -o /dev/null "https://${host}/.well-known/did.json" \
    || { echo "the tenant's did.json does not answer on https://${host}" >&2; exit 2; }

# the in-cluster services the connector calls: its tenant's crypto provider,
# storage and retrieval (a connector in the cluster reaches them directly)
pids=()
cleanup() { for p in "${pids[@]}"; do kill "${p}" 2>/dev/null || true; done; }
trap cleanup EXIT
forward() { # service local-port
    "${K[@]}" port-forward "svc/$1" "$2:8080" >/dev/null 2>&1 & pids+=($!)
}
forward signer 18180; forward storage-service 18181; forward credential-retrieval-service 18182
for port in 18180 18181 18182; do
    for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:${port}/" && break; sleep 1; done
done

# a credential offer from the issuer (the issuing plugin over NATS), from a
# short-lived pod in the W-Stack namespace
offer() { # claims-json
    local script='const nats = require("nats");
const ce = (type, data) => JSON.stringify({ specversion: "1.0", id: "i-" + Date.now(), source: "dsp-identity-check", type, datacontenttype: "application/json", time: new Date().toISOString(), data });
(async () => {
  const nc = await nats.connect({ servers: process.env.NATS_URL });
  const ev = ce("org.eclipse.xfsc.ocm.issuer.issue.request.v1", { tenant_id: process.env.TENANT, request_id: "d-" + Date.now(), group_id: process.env.GROUP,
    identifier: process.env.CONF, payload: JSON.parse(process.env.CLAIMS) });
  const r = await nc.request(process.env.SUBJECT, ev, { timeout: 45000 });
  const d = JSON.parse(Buffer.from(r.data).toString("utf8")).data || {};
  if (!d.offer) { console.error("no offer: " + JSON.stringify(d).slice(0, 300)); process.exit(1); }
  console.log("OFFER " + d.offer.credential_offer);
  await nc.close();
})().catch((e) => { console.error(e.message); process.exit(1); });'
    "${K[@]}" run "dsp-identity-offer-$(date +%s%N | cut -c1-13)" --rm -i --quiet --restart=Never \
        --image=node:22.22.0-alpine3.23@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34 \
        --env="NATS_URL=${NATS_URL:-nats://nats.infrastructure.svc.cluster.local:4222}" --env="TENANT=${tenant}" \
        --env="GROUP=${group}" --env="CONF=${ISSUE_CONFIGURATION:-SDJWTCredential}" \
        --env="SUBJECT=${ISSUE_SUBJECT:-issuer.dummycontentsigner.request}" --env="CLAIMS=$1" --env="SCRIPT=${script}" \
        --command -- sh -c 'cd /tmp && npm install --silent --no-audit --no-fund nats@2.29.3 >/dev/null 2>&1 && node -e "$SCRIPT"' \
        | sed -n 's/^OFFER //p'
}
did="did:web:${host}"
claims="$(jq -cn --arg d "${did}" '{sub: $d, legalName: "Local Test Participant", participantRoles: ["data_provider", "data_consumer"]}')"
echo "== offers from the issuer (two: one to accept, one to refuse)"
o1="$(offer "${claims}")"; o2="$(offer "${claims}")"
[ -n "${o1}" ] && [ -n "${o2}" ] || { echo "the issuer returned no offer" >&2; exit 1; }

OFFER="${o1}" OFFER_UNTRUSTED="${o2}" TENANT_DID="${did}" TENANT="${tenant}" ACCOUNT="${group}" \
CRYPTO_URL=http://127.0.0.1:18180 STORAGE_URL=http://127.0.0.1:18181 RETRIEVAL_URL=http://127.0.0.1:18182 \
REGION="${REGION:-EU}" COUNTRY="${COUNTRY:-DE}" KEY_NAMESPACE="${ns}" KEY_GROUP="${group}" KEY="${KEY:-eckey}" \
ISSUE_CONFIGURATION="${ISSUE_CONFIGURATION:-SDJWTCredential}" \
    node "${here}/wstack-identity-check.js"
