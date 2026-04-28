# SFTP Ingestion Service — ORCE Native Runtime

This directory contains the ORCE Node-RED flows that replace the FastAPI
implementation under `../src/` when `compatibilityMode: orce` is selected
in the Helm chart.

## Layout

```
orce/
  flows/
    facis-sftp-scheduler.json     — inject every poll interval
    facis-sftp-poller.json        — connect/list/get/rename via ssh2-sftp-client
    facis-sftp-filter.json        — extension + size guard, route by extension
    facis-sftp-parsers.json       — JSON / CSV / raw passthrough → sftp.record
    facis-sftp-envelope.json      — build the 6-field Bronze envelope
    facis-sftp-kafka.json         — rdkafka producer to INGEST_DEFAULT_TOPIC
    facis-sftp-dlq.json           — active dead-letter publisher (NEW)
    facis-sftp-observability.json — /api/v1/sftp/health, /sftp/metrics
  tests/
    flows/                        — node --test specs
    package.json
  README.md (this file)
```

## SFTP contrib + CSV parser dependency

The flow uses two npm modules that must be present in the ORCE pod's
`/data/node_modules`:

- `ssh2-sftp-client` — strict host-key verification, password + key auth
- `csv-parse` — `cast: false, columns: true, relax_column_count: false`

These are staged by `services/simulation/orce/Dockerfile` and copied into
`/data/node_modules` at boot via the entrypoint script (same mechanism as
`seedrandom`). **A change to the SFTP contrib dependencies requires
rebuilding the simulation image.** This cross-service coupling is
intentional — the ORCE pod is shared infrastructure.

## Endpoint paths (BREAKING CHANGE vs Python)

To avoid colliding with the Simulation flow's `/api/v1/health` and `/metrics`
on the shared ORCE pod, SFTP endpoints are namespaced:

| Concern | Python | ORCE |
|---------|--------|------|
| Health  | `GET /api/v1/health` | `GET /api/v1/sftp/health` |
| Metrics | `GET /metrics`       | `GET /sftp/metrics`       |

Update probes and ServiceMonitor configs accordingly.

## DLQ behaviour change

Python configured `INGEST_DLQ_TOPIC` (default `sftp.ingest.dlq`) but never
published to it. ORCE actively publishes a structured envelope on every
parse, publish, archive, sftp, filter, or uncaught failure:

```json
{
  "error_type": "parse|publish|archive|sftp|filter|uncaught",
  "error_message": "...",
  "error_timestamp": "ISO 8601",
  "filename": "reading.json",
  "source_topic": "sftp://host/ingest/reading.json",
  "original_envelope": <Bronze envelope on publish failures>
}
```

If any downstream consumer is currently watching this topic with a
different schema expectation, freeze it now.

## CSV parsing — strict mode

`csv-parse` runs with `relax_column_count: false`, which **rejects** rows
whose column count differs from the header. Python's `csv.DictReader`
silently padded missing columns with `None`; ORCE surfaces them through
the DLQ instead. This is a deliberate tightening — the DLQ visibility is
better than silent truncation.

## Stackable Kafka 3-broker mTLS

The Kafka producer config `${SFTP_KAFKA_BROKERS}` MUST be the
comma-separated list of the 3 Stackable broker IPs (e.g.
`217.160.222.177:31193,217.160.219.79:31186,213.165.77.54:30212`). Single
bootstrap addresses fail on metadata refresh. NodePorts can change on
broker restart — re-discover with `kcat -L` and redeploy the flow.

## Tests

```sh
cd services/sftp-ingestion-service/orce
npm install --include=dev
node --test tests/flows
```

The specs re-implement function-node bodies inline and exercise them
under `node:test`. **Invariant**: keep the spec helpers in sync with the
function-node `func` strings in the flow JSON.

## Deploy

The chart's `sync-flows.sh` copies flows into
`helm/facis-sftp-ingestion/files/orce-flows/` before `helm install/upgrade`.
The post-install Job POSTs the merged JSON to the ORCE Admin API at
`${orceAdminUrl}/flows` with `Node-RED-Deployment-Type: full`.

See `helm/facis-sftp-ingestion/README.md` for the full deploy procedure
and the ORCE-chart prerequisites (envFrom secret, Kafka cert mount).
