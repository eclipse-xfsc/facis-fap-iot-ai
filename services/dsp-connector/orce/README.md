# DSP Connector — ORCE Native Runtime

This directory contains the ORCE Node-RED flows that replace the FastAPI
implementation under `../src/` when `compatibilityMode: orce` is selected
in the Helm chart.

## Layout

```
orce/
  flows/
    facis-dsp-state.json        — bootstrap & persist transfers/negotiations
    facis-dsp-health.json       — GET /api/v1/dsp/health, GET /dsp/metrics
    facis-dsp-catalogue.json    — POST /dsp/catalogue/request
    facis-dsp-negotiations.json — POST/GET /dsp/negotiations, terminate
    facis-dsp-transfers.json    — full transfer FSM + access provisioning
    facis-dsp-errors.json       — catch-all error handler
  config/
    datasets.json               — static FACIS_DATASETS mirror (mounted as ConfigMap)
  tests/
    flows/                      — node --test specs
    package.json
  README.md (this file)
```

## State storage

The flow uses two PVC-backed JSON files under `/data/dsp-state/`:
- `transfers.json` — the transfer-process map keyed by `tp-...` id
- `negotiations.json` — the negotiation map keyed by `neg-...` id

The catalogue is a read-only ConfigMap mount at `/data/dsp-config/datasets.json`.

**Single-replica only**: the file-based state is not multi-replica safe.
The ORCE pod must run with `replicas: 1`. Postgres backing is out of scope
for this migration.

## Endpoint paths (BREAKING CHANGE vs Python)

To avoid colliding with the Simulation flow's `/api/v1/health` and `/metrics`
on the shared ORCE pod, DSP endpoints are namespaced:

| Concern | Python | ORCE |
|---------|--------|------|
| Health  | `GET /api/v1/health`            | `GET /api/v1/dsp/health` |
| Metrics | `GET /metrics`                  | `GET /dsp/metrics`       |
| Catalogue | `POST /dsp/catalogue/request` | `POST /dsp/catalogue/request` (unchanged) |
| Transfers | `POST/GET /dsp/transfers...`  | unchanged |
| Negotiations | `POST/GET /dsp/negotiations...` | unchanged |

Update probes and ServiceMonitor configs accordingly.

## Tests

```sh
cd services/dsp-connector/orce
npm install --include=dev
node --test tests/flows
```

The specs re-implement each function-node body inline and exercise it under
`node:test`. **Invariant**: keep the spec helpers in sync with the function-node
`func` strings in the corresponding flow JSON.

## Deploy

The chart's `sync-flows.sh` copies these files into
`helm/facis-dsp-connector/files/orce-flows/` (and `orce-config/`) before
`helm install/upgrade`. The post-install Job then POSTs the merged JSON to
the ORCE Admin API at `${orceAdminUrl}/flows` with `Node-RED-Deployment-Type: full`.

See `helm/facis-dsp-connector/README.md` for the full deploy procedure and
the ORCE-chart prerequisites (envFrom secrets, volume mounts).
