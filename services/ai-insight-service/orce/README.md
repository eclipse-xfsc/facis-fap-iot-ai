# AI Insight ORCE Runtime

Node-RED ORCE runtime for `ai-insight-service`.

This module packages AI Insight HTTP flows, merges exported flow files at container startup, and exposes endpoints for health, insights generation, latest outputs, and OpenAPI documentation.

## What this runtime does

- Runs AI Insight flows on top of ORCE/Node-RED.
- Loads all JSON flow exports from `flows/` and merges them into `/data/flows.json` during startup.
- Exposes OpenAPI (`/openapi.json`) plus docs UIs (`/docs`, `/redoc`).
- Keeps runtime lean (Kafka/rdkafka and unrelated inherited artifacts removed).

## Exposed endpoints

- `GET /api/v1/health`
- `POST /api/v1/insights/anomaly-report`
- `POST /api/v1/insights/energy-summary`
- `POST /api/v1/insights/city-status`
- `GET /api/v1/insights/latest`
- `GET /api/ai/outputs/{output_id}`
- `GET /openapi.json`
- `GET /docs`
- `GET /redoc`

## Folder structure

```text
services/ai-insight-service/orce/
├── Dockerfile
├── entrypoint.sh
├── flows/
│   ├── ai-insight-orce.json
│   ├── ai-insight-anomaly.json
│   ├── ai-insight-energy-summary.json
│   ├── ai-insight-city-status.json
│   ├── ai-insight-latest.json
│   ├── ai-insight-outputs.json
│   └── ai-insight-openapi.json
├── subflows/
│   └── README.md
├── runtime/
│   ├── README.md
│   ├── .env                # local only (gitignored)
│   └── certs/              # local only (gitignored, except .gitkeep)
└── tests/
    └── flows/
        ├── *.spec.js
        ├── helpers/
        └── README.md
```

## Prerequisites

- Docker Engine
- Runtime config bundle prepared in `services/ai-insight-service/orce/runtime/`

## Environment configuration

Before building the image, populate:

- `runtime/.env` with required AI Insight environment variables (Trino/LLM/policy/rate-limit/etc.).
- `runtime/certs/` with required certificates.

At container startup, the custom entrypoint:

- sources `runtime/.env` (baked into image as `/opt/ai-insight-runtime/.env`),
- prepares certs in `/app/certs`,
- auto-sets `NODE_EXTRA_CA_CERTS=/app/certs/ca.crt` when available and not explicitly set.

## Run ORCE locally (step by step)

From repository root:

```bash
cd services/ai-insight-service/orce
docker build -t facis-ai-insight-orce:local .
docker run -d --name facis-ai-insight-orce -p 1880:1880 facis-ai-insight-orce:local
```

Follow logs:

```bash
docker logs -f facis-ai-insight-orce
```

Stop runtime:

```bash
docker stop facis-ai-insight-orce
docker rm facis-ai-insight-orce
```

Optional: run with a named volume for persistent Node-RED data:

```bash
docker volume create ai-insight-orce-data
docker run -d --name facis-ai-insight-orce \
  -p 1880:1880 \
  -v ai-insight-orce-data:/data \
  facis-ai-insight-orce:local
```

## Validate local runtime

Health:

```bash
curl -sS http://localhost:1880/api/v1/health | jq
```

OpenAPI and docs:

```bash
curl -sS http://localhost:1880/openapi.json | jq '.openapi'
```

Then open in your browser:

- `http://localhost:1880/docs`
- `http://localhost:1880/redoc`

Latest insights:

```bash
curl -sS http://localhost:1880/api/v1/insights/latest | jq
```

Output lookup miss example:

```bash
curl -sS -i http://localhost:1880/api/ai/outputs/non-existent-id
```

## Run tests and coverage

From `services/ai-insight-service/orce`:

```bash
npm install
npm run test:flows
npm run test:flows:coverage
```

Run a single test file:

```bash
node --test tests/flows/anomaly.spec.js
```

Coverage policy uses `c8` with thresholds `>=90%` for lines, branches, functions, and statements.

## Troubleshooting

- **Port already in use (`1880`)**: change mapping in `docker run` (for example `-p 1881:1880`).
- **Container starts but endpoints fail**: verify required vars exist in `runtime/.env` before `docker build`.
- **TLS/certificate issues**: confirm cert files exist in `runtime/certs/` and `ca.crt` is valid when used.
- **Apple Silicon compatibility**: if needed, build/run with `--platform linux/amd64`.
- **Stale flow/runtime state**: remove container + volume, then rebuild and run again.

## Contribution notes

- Flow files in `flows/*.json` are merged in sorted order by `entrypoint.sh` and written to `/data/flows.json`.
- When changing flow logic, update mirror helpers/tests in `tests/flows/helpers/` and corresponding `*.spec.js`.
- Before opening a PR, run:

```bash
npm run test:flows
npm run test:flows:coverage
docker run -d --name facis-ai-insight-orce -p 1880:1880 facis-ai-insight-orce:local
curl -sS http://localhost:1880/api/v1/health
```
