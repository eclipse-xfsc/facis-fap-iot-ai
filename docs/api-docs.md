# API Documentation

## Overview

The FACIS FAP IoT & AI system exposes REST APIs from the simulation and AI insight services.
Both services provide OpenAPI 3.1 specifications for interactive documentation.

## Simulation Service API

**Base URL:** `http://<host>:8080/api/v1`

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/simulation/start` | Start the simulation engine |
| POST | `/simulation/stop` | Stop the simulation engine |
| POST | `/simulation/pause` | Pause the simulation engine |
| GET | `/simulation/status` | Get simulation state (IDLE/RUNNING/PAUSED/STOPPED) |
| GET | `/meters` | Retrieve current energy meter readings |
| GET | `/pv` | Retrieve current PV generation data |
| GET | `/weather` | Retrieve current weather data |
| GET | `/prices` | Retrieve current energy prices |
| GET | `/loads` | Retrieve current consumer load data |

### Protocols

The simulation service publishes data via multiple protocols:

| Protocol | Port | Description |
|----------|------|-------------|
| REST API | 8080 | HTTP/JSON endpoints |
| MQTT | 1883 | Topic-based publish (e.g., `facis/site-berlin-001/meter/+`) |
| Kafka | 9092 | Stream topics (e.g., `facis.bronze.energy_meter`) |
| Modbus TCP | 502 | Register-based meter simulation (Janitza UMG 96RM) |
| ORCE Webhook | 1880 | Unified tick envelope via HTTP POST |

### OpenAPI Specification

Full OpenAPI spec: `services/simulation/docs/openapi.yaml`

Interactive docs available at runtime:
- Swagger UI: `http://<host>:8080/docs`
- ReDoc: `http://<host>:8080/redoc`

## AI Insight Service API

**Base URL:** `http://<host>:8080/api/v1`

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/insights/anomaly-report` | Generate anomaly detection report with LLM summary |
| POST | `/insights/city-status` | Generate smart city event impact narrative |
| POST | `/insights/energy-summary` | Generate energy cost/PV forecast analysis |
| GET | `/insights/cache/{key}` | Retrieve cached insight response |
| GET | `/insights/output/{id}` | Retrieve stored insight output |

### Required Headers

When policy enforcement is enabled:

| Header | Description |
|--------|-------------|
| `X-Agreement-Id` | Dataspace agreement identifier |
| `X-Asset-Id` | Asset identifier |
| `X-Role` | User role (e.g., `data-consumer`, `admin`) |

### Security

- **Policy enforcement:** Header-based access control (agreement, asset, role)
- **Rate limiting:** Per-agreement throttling (configurable requests/minute)
- **Audit logging:** All requests logged with policy decisions
- **OIDC:** Trino queries authenticated via Keycloak OIDC token exchange

### OpenAPI Specification

Full OpenAPI spec: `services/ai-insight-service/docs/openapi.yaml`

Interactive docs available at runtime:
- Swagger UI: `http://<host>:8080/docs`
- ReDoc: `http://<host>:8080/redoc`

## ORCE Node-RED Flows (AI Insight UI)

The AI Insight UI uses Node-RED flows inside ORCE for orchestration:

| Flow Tab | Purpose |
|----------|---------|
| 0 - UI Routing | Message handling between Vue SPA and backend |
| 1 - AI Insight Proxy | HTTP proxy to AI Insight Service |
| 2 - LLM Router | Multi-provider LLM dispatch (OpenAI/Claude/custom) |
| 3 - Trino Query | Direct Gold Layer queries with OIDC auth |
| 4 - Session Context | Session and context management |

See: `services/ai-insight-ui/docs/flow-architecture.md`

## Data Schemas

### Avro Schemas

Located in `services/simulation/schemas/avro/`:

- **Bronze layer** (9 schemas): Raw ingested data
- **Silver layer** (9 schemas): Cleaned and enriched data
- **Gold layer**: Aggregated analytics (materialized via Trino)

### Data Model Reference

See: `services/simulation/docs/data-model/schema-reference.md`
