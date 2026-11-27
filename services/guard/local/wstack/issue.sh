#!/usr/bin/env bash
# Level 2 of the guard's local test: has the W-Stack issue a role credential to
# the test wallet. Mints a credential offer through the W-Stack's issuer
# (NATS, issue.request to the issuing plugin), from a short-lived pod in the
# W-Stack's namespace, then lets test-wallet.js receive it (OID4VCI).
#
# Usage: issue.sh <roles-json>        e.g. issue.sh '["data_analyst"]'
# Env:   WSTACK_CONTEXT (required: the W-Stack cluster), NS (default ocm-wstack),
#        TENANT, GROUP (default), ORG_DID (the credential's organisation),
#        ISSUE_CONFIGURATION (the issuer configuration that yields an SD-JWT VC),
#        ISSUE_SUBJECT (the NATS subject of the issuing plugin),
#        NATS_URL, WALLET_FILE and NODE_EXTRA_CA_CERTS (as test-wallet.js)
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
roles="${1:?usage: issue.sh <roles-json>}"
ctx="${WSTACK_CONTEXT:?set WSTACK_CONTEXT (kubectl context of the W-Stack cluster)}"
ns="${NS:-ocm-wstack}"
claims="$(jq -cn --argjson r "${roles}" --arg o "${ORG_DID:?set ORG_DID}" \
    '{org_did: $o, roles: $r, purposes: ["analytics", "ai_insight"], name: "Local Test", email: "local.test@example.org", given_name: "Local", family_name: "Test"}')"
script='const nats = require("nats");
const ce = (type, data) => JSON.stringify({ specversion: "1.0", id: "i-" + Date.now(), source: "guard-local-test", type, datacontenttype: "application/json", time: new Date().toISOString(), data });
(async () => {
  const nc = await nats.connect({ servers: process.env.NATS_URL });
  const ev = ce("org.eclipse.xfsc.ocm.issuer.issue.request.v1", { tenant_id: process.env.TENANT, request_id: "g-" + Date.now(), group_id: process.env.GROUP,
    identifier: process.env.CONF, payload: JSON.parse(process.env.CLAIMS) });
  const r = await nc.request(process.env.SUBJECT, ev, { timeout: 45000 });
  const d = JSON.parse(Buffer.from(r.data).toString("utf8")).data || {};
  if (!d.offer) { console.error("no offer: " + JSON.stringify(d).slice(0, 300)); process.exit(1); }
  console.log("OFFER " + d.offer.credential_offer);
  await nc.close();
})().catch((e) => { console.error(e.message); process.exit(1); });'
offer="$(kubectl --context "${ctx}" -n "${ns}" run "guard-issue-$(date +%s)" --rm -i --quiet --restart=Never \
    --image=node:22.22.0-alpine3.23@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34 \
    --env="NATS_URL=${NATS_URL:-nats://nats.infrastructure.svc.cluster.local:4222}" --env="TENANT=${TENANT:-connector}" \
    --env="GROUP=${GROUP:-default}" --env="CONF=${ISSUE_CONFIGURATION:-SDJWTCredential}" \
    --env="SUBJECT=${ISSUE_SUBJECT:-issuer.dummycontentsigner.request}" --env="CLAIMS=${claims}" --env="SCRIPT=${script}" \
    --command -- sh -c 'cd /tmp && npm install --silent --no-audit --no-fund nats@2.29.3 >/dev/null 2>&1 && node -e "$SCRIPT"' \
    | sed -n 's/^OFFER //p')"
[ -n "${offer}" ] || { echo "the issuer returned no offer" >&2; exit 1; }
node "${here}/test-wallet.js" receive "${offer}"
