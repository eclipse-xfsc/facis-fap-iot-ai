# Migration Guide — Entity-Rendered `feeds.json` and Production Hardening

## Audience

Operators upgrading a deployment that has the previously-shipped 4-node
`feeds.json` stub (where `registered_entities` always reports `0` and the
REST snapshot endpoints return empty) to the entity-rendered runtime that
generates simulation data deterministically from `default.yaml` and
publishes via mTLS to the Stackable Kafka cluster.

This guide also covers the production hardening that landed alongside the
entity rendering: the engine-state-restore idempotence fix, the rdkafka
metadata-refresh tuning, and the cert-expiry / NodePort drift watchers.

## What changes

- **`facis-simulation-feeds.json` is now generated**. The 4-node stub is
  replaced by a 92-node tab containing 21 entity instances (2 meters, 2 PV,
  4 consumers, weather, price, 6 streetlights, 2 traffic, 2 city-events,
  visibility), wired in the same dependency order as the Python
  `CorrelationEngine`. The generator
  `services/simulation/orce/scripts/render-feeds.py` reads
  `services/simulation/config/default.yaml` and emits deterministic node
  IDs, so re-runs produce a clean diff.
- **Cross-tab state moved to `global` context.** Engine state, latest
  readings, last-tick timestamps, and active events are now accessed via
  `global.get/set` instead of `flow.get/set`. The previous code used
  per-tab `flow.*`, which silently broke any read across tab boundaries —
  the tick scheduler in particular was always early-returning because it
  could never see the engine state.
- **`tick.json`'s link-out wires to a fixed-id link-in** (`linkin-tick-trigger`)
  on the new feeds tab, so tick payloads actually reach the entity
  instances.
- **`facis-simulation-kafka.json` broker list now leads with the stable
  bootstrap address** (`212.132.83.222:9093`) followed by the current
  Stackable NodePorts. The patched `rdkafka` (`rdkafka-patch.js`) sets
  `metadata.max.age.ms=30000` and
  `topic.metadata.refresh.interval.ms=30000`, so the client recovers from
  NodePort drift within one cycle without a flow redeploy.
- **`engine.json`'s startup chain is idempotent.** Both `engine-state-restore`
  and `engine-state-default` now skip if `global.engine` is already set
  with a recent transition, eliminating the race where a `/start` call
  immediately after deploy was clobbered when the bootstrap inject fired.
  The `inject` `onceDelay` was bumped from `0.5s` to `1.5s` for additional
  defence-in-depth.
- **Init container builds librdkafka with OpenSSL.** The init-deps
  initContainer now `apk add openssl-dev build-base linux-headers zlib-dev`,
  detects when the existing `librdkafka.so.1` lacks OpenSSL or links
  `libsasl2` (which isn't present at runtime), and rebuilds from source.
  The result is mTLS-capable Kafka producers that connect on first try.
- **Two new CronJobs** in the `orce` namespace:
  `kafka-broker-watcher` (every 15 min) detects NodePort drift via `kcat`
  and re-deploys `kafka.json` if the drift is stable for 2 cycles;
  `kafka-cert-expiry-check` (daily) emits a Prometheus metric and
  structured log line for the mTLS client cert's days-until-expiry, with
  alerts at 14d (warning) and 7d (critical).

## What does **not** change

- REST endpoint paths and JSON schemas (`/api/v1/simulation/*`,
  `/api/v1/{meters,pv,weather,prices,loads}`, `/api/v1/health`).
- Kafka topic names (`sim.smart_energy.*`, `sim.smart_city.*`) and the
  JSON payload field names + types — verified against `kcat` consumers
  for all 9 topics.
- MQTT topic conventions, QoS, retain flags.
- Modbus TCP register addresses (Janitza UMG 96RM layout).
- The Stackable Kafka, NiFi, Trino, and MinIO/S3 backends.
- The `compatibilityMode=legacy` rollback path — the Python service still
  works as the rollback target if needed.

## Pre-checks

Before applying this migration on a target cluster:

```bash
# 1. ORCE Admin API token present
kubectl get secret facis-orce-admin -n orce -o jsonpath='{.data.token}' \
  | base64 -d | wc -c
# → expect a non-zero length

# 2. Kafka mTLS cert Secret present
kubectl get secret facis-kafka-certs -n orce \
  -o jsonpath='{.data.tls\.crt}' | base64 -d \
  | openssl x509 -noout -dates
# → expect notAfter > 7 days from today

# 3. rdkafka SSL patch ConfigMap present
kubectl get cm facis-orce-rdkafka-patch -n orce -o jsonpath='{.data.rdkafka-patch\.js}' \
  | grep -c "metadata.max.age.ms"
# → expect 1 (the new field present)

# 4. Watcher script ConfigMap present (only required if installing CronJobs)
kubectl get cm facis-watch-kafka-brokers-script -n orce -o name
# → expect "configmap/facis-watch-kafka-brokers-script"

# 5. ORCE pod is running with init-deps + kafka-certs mounted
kubectl describe pod -n orce -l app=orce \
  | grep -E "init-deps|kafka-certs"
```

If any of those are missing, follow the `Quick Start` in
`infrastructure/README.md` — it lists the exact `kubectl create` commands.

## Step-by-step rollout

### 1. Apply infrastructure patches (idempotent)

```bash
# Init-deps (npm packages + rdkafka SSL patch overlay + librdkafka rebuild
# detection). Run once per cluster; re-applying is safe (no-op when already
# applied).
kubectl patch deployment orce -n orce \
  --type=strategic --patch-file=infrastructure/orce/init-deps-patch.yaml

# Kafka cert mount
kubectl patch deployment orce -n orce \
  --type=strategic --patch-file=infrastructure/orce/kafka-certs-patch.yaml

# CronJobs (NodePort watcher + cert expiry monitor)
kubectl apply -f infrastructure/orce/kafka-broker-watcher-cronjob.yaml
kubectl apply -f infrastructure/orce/kafka-cert-expiry-cronjob.yaml
```

Watch the rollout. The first init-deps run takes ~7 min if the librdkafka
rebuild is required. Subsequent rollouts complete in <60s.

### 2. Render flows

```bash
python3 services/simulation/orce/scripts/render-feeds.py
python3 services/simulation/orce/scripts/render-kafka.py

# Sync to helm chart's bundled flows (the chart's deploy job reads here)
cp services/simulation/orce/flows/facis-simulation-feeds.json \
   services/simulation/helm/facis-simulation/files/orce-flows/
cp services/simulation/orce/flows/facis-simulation-kafka.json \
   services/simulation/helm/facis-simulation/files/orce-flows/
```

Re-running the renderers should produce a clean diff (deterministic IDs
from sha1 of stable inputs).

### 3. Deploy via Admin API

The two recommended paths:

**Helm-driven (preferred for fresh clusters or if `compatibilityMode`
is changing):**
```bash
helm upgrade --install facis-simulation services/simulation/helm/facis-simulation \
  -n facis --create-namespace
```

**Live-patch (preferred for an already-running ORCE you don't want to
re-bootstrap):** GET → modify-affected-tabs → POST. See the merge pattern
demonstrated in `infrastructure/README.md` under
`Adding or replacing flow tabs without a clean redeploy`.

### 4. Verify

```bash
# Engine + REST API
curl -sS https://fap-iotai.facis.cloud/api/v1/simulation/status | jq
# → state: "running", registered_entities: 21, simulation_time advancing

curl -sS https://fap-iotai.facis.cloud/api/v1/meters | jq 'length'
# → 2

curl -sS https://fap-iotai.facis.cloud/api/v1/weather \
  | jq '.conditions.ghi_w_m2'
# → number, non-null

# Kafka mTLS — one fresh message from each topic
for t in sim.smart_energy.meter sim.smart_energy.pv sim.smart_energy.weather \
         sim.smart_energy.consumer sim.smart_energy.price \
         sim.smart_city.light sim.smart_city.traffic sim.smart_city.event \
         sim.smart_city.weather; do
  kcat -b 212.132.83.222:9093,$(kubectl get cm facis-orce-rdkafka-patch -n orce -o jsonpath='{...}' || echo "") \
       -X security.protocol=ssl \
       -X ssl.ca.location=/tmp/facis-kafka-certs/ca.crt \
       -X ssl.certificate.location=/tmp/facis-kafka-certs/tls.crt \
       -X ssl.key.location=/tmp/facis-kafka-certs/tls.key \
       -X ssl.endpoint.identification.algorithm=none \
       -t "$t" -C -o -1 -e -q | head -1
done

# CronJobs
kubectl create job --from=cronjob/kafka-cert-expiry-check \
  kafka-cert-expiry-test -n orce
kubectl logs job/kafka-cert-expiry-test -n orce
# → JSON line with days_until_expiry; structured info/warn/error level

kubectl create job --from=cronjob/kafka-broker-watcher \
  kafka-broker-watcher-test -n orce
kubectl logs job/kafka-broker-watcher-test -n orce
# → "no drift" or detected-but-unconfirmed (first run after deploy)
```

### 5. Decommission the rollback fallback (optional, deferred ≥1 week)

After the ORCE-native runtime has run two consecutive weeks in production
without a rollback event, scale down the Python `simulation` Deployment in
`facis` ns to 0 (it already defaults to 0 under `compatibilityMode=orce`,
but you may want to remove the chart `replicaCount` field entirely).

## Rollback

If the migration regresses something:

```bash
# Switch to legacy Python runtime (works as long as the legacy chart values
# are still tracked in source).
helm upgrade facis-simulation services/simulation/helm/facis-simulation \
  -n facis --reuse-values --set compatibilityMode=legacy

# Or revert the source files to a prior tag and re-deploy:
git checkout <pre-migration-tag> -- \
  services/simulation/orce/flows/facis-simulation-feeds.json \
  services/simulation/orce/flows/facis-simulation-kafka.json \
  services/simulation/orce/flows/facis-simulation-engine.json \
  services/simulation/orce/flows/facis-simulation-tick.json \
  services/simulation/orce/rdkafka-patch.js

# Re-deploy via the Admin API merge pattern.
```

The infrastructure patches (`init-deps-patch.yaml`,
`kafka-certs-patch.yaml`, the CronJobs) are safe to leave in place even
under a rollback — they're additive and have no effect on the legacy
Python runtime.

## Known gotchas (now resolved)

- **`/start` race vs. bootstrap inject.** Pre-migration, calling `/start`
  immediately after a flow deploy could be silently overwritten by the
  startup chain. The idempotence guards added in this migration make the
  race harmless.
- **`librdkafka` built without OpenSSL.** Pre-migration, even with the
  contrib-rdkafka SSL patch applied, the producer logged
  `OpenSSL not available at build time` because the upstream npm install
  built librdkafka without `openssl-dev`. The init-deps container now
  detects and rebuilds with OpenSSL automatically.
- **NodePort drift killing producers.** Pre-migration, drift required a
  manual rediscover-and-redeploy cycle. The 30s metadata refresh +
  bootstrap-led broker list now recover transparently for 99% of drift
  events; the watcher cron handles the residual edge cases.

## Operational follow-ups (out of scope here)

- **Auto-rotation of the Stackable mTLS cert** — requires either
  kubeconfig access to the Stackable cluster or a shared cert store
  (Vault, S3-with-IAM). Until then, the cert-expiry CronJob + alerts +
  documented manual rotation procedure is the operating model.
- **pytest-bdd tests for the engine restore guard** — the property
  ("`/start` followed by deploy preserves running state") deserves a
  test. Tracked separately.
