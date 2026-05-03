#!/bin/sh
# watch-kafka-brokers.sh
# Detect Stackable Kafka NodePort drift and (after two stable consecutive
# detections) re-deploy facis-simulation-kafka.json with the fresh broker list.
#
# Inputs (all required, no defaults — fail loud if missing):
#   ORCE_ADMIN_URL          e.g. http://orce.orce.svc.cluster.local:1880/orce
#   ORCE_ADMIN_TOKEN        bearer for the ORCE Admin API
#   KAFKA_BOOTSTRAP         e.g. 212.132.83.222:9093  (the stable address)
#   KAFKA_CERT_DIR          mount path to ca.crt / tls.crt / tls.key
#   STATE_DIR               persistent dir for the "previous brokers" memo
#                           (PVC-backed; required for the 2-cycle stability rule)
#
# Behaviour:
#   1. kcat -L → fetch live broker advertised addresses from bootstrap.
#   2. Read previous list from STATE_DIR/last-brokers.txt (if exists).
#   3. If list differs AND the previous list also differs from currently-deployed
#      → drift confirmed across 2 cycles → re-render kafka.json + POST.
#      Else: just update the memo and exit cleanly.
#   4. Always emit a one-line structured JSON log on stdout for ingestion.
#
# Designed for `runAsNonRoot` Kubernetes CronJob; no shell tricks beyond POSIX sh.
set -eu

require_var() {
  v=$(eval "echo \${$1:-}")
  if [ -z "$v" ]; then
    echo "{\"level\":\"error\",\"msg\":\"missing required env var\",\"var\":\"$1\"}" >&2
    exit 2
  fi
}

require_var ORCE_ADMIN_URL
require_var ORCE_ADMIN_TOKEN
require_var KAFKA_BOOTSTRAP
require_var KAFKA_CERT_DIR
require_var STATE_DIR

mkdir -p "$STATE_DIR"
PREV_FILE="$STATE_DIR/last-brokers.txt"

# Step 1: discover current brokers via kcat
LIVE_BROKERS=$(
  kcat -L -b "$KAFKA_BOOTSTRAP" \
       -X security.protocol=ssl \
       -X "ssl.ca.location=$KAFKA_CERT_DIR/ca.crt" \
       -X "ssl.certificate.location=$KAFKA_CERT_DIR/tls.crt" \
       -X "ssl.key.location=$KAFKA_CERT_DIR/tls.key" \
       -X ssl.endpoint.identification.algorithm=none 2>/dev/null \
  | awk '/broker [0-9]+ at /{print $4}' \
  | sort -u \
  | paste -sd, -
)

if [ -z "$LIVE_BROKERS" ]; then
  echo "{\"level\":\"error\",\"msg\":\"kcat returned no brokers\",\"bootstrap\":\"$KAFKA_BOOTSTRAP\"}" >&2
  exit 3
fi

# Step 2: read previous memo
PREV_BROKERS=""
if [ -f "$PREV_FILE" ]; then
  PREV_BROKERS=$(cat "$PREV_FILE")
fi

# Step 3: fetch the broker list currently deployed in ORCE
DEPLOYED_BROKERS=$(
  curl -fsS -H "Authorization: Bearer $ORCE_ADMIN_TOKEN" \
       "$ORCE_ADMIN_URL/flows" 2>/dev/null \
  | sed -n 's/.*"type": "kafka-broker"[^}]*"broker": "\([^"]*\)".*/\1/p' \
  | head -1
)

# Compare LIVE against currently DEPLOYED (the kafka.json broker config).
# Note we strip the bootstrap (212.132.83.222:9093) from the deployed string
# since kcat won't return that as a "broker N at" entry — it's the bootstrap
# itself. Same for any previously-bootstrap-led list.
strip_bootstrap() {
  echo "$1" | tr ',' '\n' | grep -v "^${KAFKA_BOOTSTRAP}\$" | sort -u | paste -sd, -
}

DEPLOYED_NODEPORTS=$(strip_bootstrap "$DEPLOYED_BROKERS")
LIVE_NODEPORTS="$LIVE_BROKERS"

if [ "$LIVE_NODEPORTS" = "$DEPLOYED_NODEPORTS" ]; then
  echo "{\"level\":\"info\",\"msg\":\"no drift\",\"live\":\"$LIVE_NODEPORTS\"}"
  echo "$LIVE_NODEPORTS" > "$PREV_FILE"
  exit 0
fi

# Drift detected — require 2-cycle stability before redeploying
if [ "$LIVE_NODEPORTS" != "$PREV_BROKERS" ]; then
  echo "{\"level\":\"warn\",\"msg\":\"drift detected, awaiting confirmation next cycle\",\"live\":\"$LIVE_NODEPORTS\",\"deployed\":\"$DEPLOYED_NODEPORTS\"}"
  echo "$LIVE_NODEPORTS" > "$PREV_FILE"
  exit 0
fi

# Two consecutive cycles agree — redeploy
echo "{\"level\":\"warn\",\"msg\":\"drift confirmed; redeploying kafka.json\",\"new\":\"$LIVE_NODEPORTS\",\"old\":\"$DEPLOYED_NODEPORTS\"}"

NEW_BROKER_STR="${KAFKA_BOOTSTRAP},${LIVE_NODEPORTS}"

# GET current flows, swap broker, POST
TMP=$(mktemp)
curl -fsS -H "Authorization: Bearer $ORCE_ADMIN_TOKEN" "$ORCE_ADMIN_URL/flows" > "$TMP"

python3 - "$TMP" "$NEW_BROKER_STR" <<'PY'
import json, sys
flows_path, new_broker = sys.argv[1], sys.argv[2]
flows = json.load(open(flows_path))
patched = False
for n in flows:
    if n.get('type') == 'kafka-broker' and n.get('broker') != new_broker:
        n['broker'] = new_broker
        patched = True
if not patched:
    print('{"level":"info","msg":"flows already had new broker"}')
    sys.exit(0)
json.dump(flows, open(flows_path, 'w'), indent=2)
PY

curl -fsS -X POST "$ORCE_ADMIN_URL/flows" \
     -H "Authorization: Bearer $ORCE_ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -H "Node-RED-Deployment-Type: full" \
     --data @"$TMP"

rm -f "$TMP"
echo "{\"level\":\"info\",\"msg\":\"redeploy complete\",\"new\":\"$NEW_BROKER_STR\"}"
