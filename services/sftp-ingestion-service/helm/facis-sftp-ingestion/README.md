# facis-sftp-ingestion Helm chart

SFTP file ingestion service for the FACIS FAP IoT & AI platform. Polls an
SFTP directory, parses files (JSON / CSV / raw passthrough), wraps records
in a Bronze envelope, and publishes to Kafka.

Supports two runtime modes via `compatibilityMode`.

## Modes

### `compatibilityMode: orce` (default)

The ingestion runtime is owned by the ORCE pod via Node-RED flows under
`services/sftp-ingestion-service/orce/flows/`. This chart's Python
Deployment is scaled to `replicas: 0` and only exists as a rollback fallback.

What this chart renders in `orce` mode:

- `ConfigMap/<fullname>-orce-flows` — bundles the eight flow JSON files
  from `files/orce-flows/`. Source of truth: `services/sftp-ingestion-service/orce/flows/`.
  Run `./sync-flows.sh` from this directory before `helm install/upgrade`.
- `Secret/<orcePodEnv.secretName>` — `facis-sftp-orce-env` by default.
  Holds SFTP_*, INGEST_*, and SFTP_KAFKA_BROKERS for the ORCE pod to consume
  via `envFrom`.
- `Job/<fullname>-orce-flow-deploy` — post-install/upgrade hook. Merges all
  flow JSON via `jq -s 'add'` and POSTs to ORCE Admin API at
  `${orceAdminUrl}/flows` with `Authorization: Bearer ${TOKEN}` and
  `Node-RED-Deployment-Type: full`.

### `compatibilityMode: legacy`

The Python FastAPI poller runs at `replicas: ${replicaCount}`. The ORCE
ConfigMap, Job, and orce-env Secret are NOT rendered.

## ORCE chart prerequisites (cross-chart, deploy-time)

The ORCE Helm chart (separate repo) must be configured to:

1. Reference the SFTP env Secret rendered by this chart:
   ```yaml
   # In the ORCE chart values
   extraEnvFrom:
     - secretRef:
         name: facis-sftp-orce-env
   ```

2. Stage the npm modules `ssh2-sftp-client` and `csv-parse` in
   `services/simulation/orce/Dockerfile`. The entrypoint script copies them
   into `/data/node_modules` on first boot. **A change to either dep
   requires rebuilding the simulation image**, since it's the shared base
   for the ORCE pod (cross-service coupling per design).

3. Mount Kafka mTLS certificates at `/etc/kafka-certs/{ca,tls}.crt` and
   `/etc/kafka-certs/tls.key` for the rdkafka producer.

4. Stay at `replicas: 1`. The flow uses `flow.context` for in-flight tick
   tracking which is not multi-replica safe.

## Deploy order

```sh
# 1. Sync flows into the chart's files/ directory
cd services/sftp-ingestion-service/helm/facis-sftp-ingestion
./sync-flows.sh

# 2. Install/upgrade this chart — renders Secret + ConfigMap.
helm upgrade --install facis-sftp-ingestion . \
  --namespace facis \
  --set sftp.host=sftp.example.com \
  --set sftp.password=$SFTP_PASSWORD \
  --set sftp.knownHostsFile=/etc/sftp-known-hosts/known_hosts \
  --set kafka.brokers="217.160.222.177:31193,217.160.219.79:31186,213.165.77.54:30212"

# 3. Upgrade the ORCE chart to mount the env Secret. ORCE pod restarts
#    and picks up SFTP_* env vars.
helm upgrade orce <orce-chart-path> --reuse-values \
  -f orce-extra-sftp-values.yaml

# 4. Helm post-install Job pushes flows. Watch:
kubectl logs -n facis job/<release>-facis-sftp-ingestion-orce-flow-deploy
```

## ORCE Admin API token

The post-install Job needs a Bearer token in `facis-orce-admin` (key
`token`). Create once:

```sh
kubectl create secret generic facis-orce-admin \
  --namespace facis \
  --from-literal=token="<token from ORCE Admin API>"
```

## Endpoint paths (BREAKING CHANGE in `orce` mode)

| Concern | Python (legacy) | ORCE | Probe / scrape update |
|---------|-----------------|------|-----------------------|
| Health  | `GET /api/v1/health` | `GET /api/v1/sftp/health` | yes |
| Metrics | `GET /metrics` | `GET /sftp/metrics` | yes |

Reason: the shared ORCE pod already serves `/api/v1/health` and `/metrics`
for the Simulation flow. Namespacing prevents route collision.

## Stackable Kafka 3-broker setup

The `kafka.brokers` value MUST contain all 3 Stackable broker
IP:port pairs, comma-separated. The single bootstrap address disconnects
on metadata refresh because rdkafka can't reach the advertised broker
addresses. Discover current ports via:

```sh
kcat -L -b 212.132.83.222:9093 \
  -X security.protocol=SSL \
  -X ssl.ca.location=$CA \
  -X ssl.certificate.location=$CERT \
  -X ssl.key.location=$KEY
```

NodePorts can change on broker restart; treat re-discovery as a routine
ops task.

## DLQ behaviour change vs Python

Python configured `INGEST_DLQ_TOPIC` but never published to it. ORCE
actively publishes a structured envelope on every parse, publish, archive,
sftp, filter, or uncaught failure. If a downstream consumer was watching
that topic with a different schema expectation, freeze it now. See
`../orce/README.md` for the envelope shape.

## Rollback

```sh
helm upgrade --reuse-values --set compatibilityMode=legacy facis-sftp-ingestion .
```

This scales the Python Deployment back to `replicaCount`. The ORCE flows
remain installed on the ORCE pod but only the Python service polls SFTP.
To remove the ORCE flows as well, set `orceFlowDeploy.enabled=false` and
delete the deployed flow tabs through the ORCE Admin API manually.
