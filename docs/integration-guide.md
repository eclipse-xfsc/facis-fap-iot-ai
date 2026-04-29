# FACIS FAP IoT & AI — Cross-Service Integration Guide

> **Complete end-to-end integration reference for all FACIS services.**
> This guide explains how simulation, analytics, and AI services communicate to deliver intelligent IoT insights.

**Project:** FACIS FAP IoT & AI Demonstrator  
**Audience:** Developers, architects, and integrators  
**Version:** 0.1.0  
**Date:** 05 April 2026

---

## Table of Contents

1. [End-to-End Data Flow](#end-to-end-data-flow)
2. [Service Interaction Matrix](#service-interaction-matrix)
3. [Shared Dependencies](#shared-dependencies)
4. [Configuration Alignment Checklist](#configuration-alignment-checklist)
5. [Cross-Service Debugging](#cross-service-debugging)
6. [Network Topology](#network-topology)

---

## End-to-End Data Flow

### Visual Data Pipeline

```
┌─────────────────────┐
│ Simulation Service  │
│   (REST API)        │
│   (Modbus TCP)      │
└──────────┬──────────┘
           │ MQTT/Kafka Topics: simulation.telemetry, simulation.events
           ▼
┌─────────────────────────────────────────────┐
│ Message Broker (MQTT 1883 / Kafka 9092)     │
│   - Simulation telemetry  (MQTT QoS 1)      │
│   - Simulation events     (Kafka)            │
└──────────┬──────────────────────────────────┘
           │
           ├──────────────────────────┬────────────────────────┐
           ▼                          ▼                        ▼
    ┌────────────────┐      ┌─────────────────┐   ┌──────────────────┐
    │ ORCE           │      │ NiFi Ingestion  │   │ Direct Consumers │
    │ (Node-RED)     │      │ Processors      │   │ (Custom Apps)    │
    │ Flow Relay     │      │                 │   └──────────────────┘
    └────────┬───────┘      └────────┬────────┘
             │                       │
             │ (Optional relay)      │ Consumed via Kafka consumer groups
             │                       │
             └───────────┬───────────┘
                         │
                         ▼
          ┌──────────────────────────┐
          │ Lakehouse - Bronze Layer │
          │ (S3/MinIO - Raw Data)    │
          └────────────┬─────────────┘
                       │
                       │ NiFi Silver transformation
                       ▼
          ┌──────────────────────────┐
          │ Lakehouse - Silver Layer │
          │ (Iceberg Tables)         │
          └────────────┬─────────────┘
                       │
                       │ Spark / SQL aggregation
                       ▼
          ┌──────────────────────────┐
          │ Lakehouse - Gold Layer   │
          │ (Iceberg Views)          │
          │ - net_grid_hourly        │
          │ - event_impact_daily     │
          │ - streetlight_zone_hourly│
          │ - weather_hourly         │
          │ - energy_cost_daily      │
          │ - pv_self_consumption... │
          └────────────┬─────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
    ┌─────────┐  ┌──────────────┐  ┌─────────────────────┐
    │ Trino   │  │ AI Insight   │  │ AI Insight UI       │
    │ (SQL    │  │ Service      │  │ (ORCE + Vue.js)     │
    │ engine) │  │ (FastAPI)    │  │                     │
    └────┬────┘  └──────┬───────┘  └──────────┬──────────┘
         │              │                     │
         │ SQL queries  │ LLM prompts         │ WebSocket
         │ (OIDC auth)  │ + insights          │ uibuilder
         │              │                     │
         └──────────────┴─────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ Browser / Dashboard │
              │ AI-Powered UI       │
              └─────────────────────┘
```

### Data Flow Stages

1. **Simulation**: Generates telemetry (energy, weather, events) via REST API, Modbus TCP, or direct Kafka/MQTT publishing.

2. **Message Broker**: MQTT and Kafka topics receive simulation data. MQTT is used for lightweight QoS-aware messaging; Kafka is used for reliable stream processing and consumer group management.

3. **ORCE (Optional Relay)**: Node-RED flows can subscribe to MQTT/Kafka topics and re-publish or transform data for custom integrations.

4. **NiFi Ingestion**: Consumes Kafka topics via KafkaConsumer processors, validates schema, and writes raw data to Bronze Layer in S3/MinIO.

5. **Bronze Layer (Raw Data)**: Unstructured ingested data stored as Parquet/ORC files partitioned by timestamp.

6. **Silver Layer (Cleaned)**: NiFi processors apply schema enforcement, deduplication, and basic transformations. Data is stored as Iceberg tables for ACID compliance and time-travel.

7. **Gold Layer (Aggregated Views)**: Spark or Trino SQL jobs aggregate Silver data into optimized analytical views:
   - **net_grid_hourly**: Hourly grid consumption/generation aggregates
   - **event_impact_daily**: Daily event impact summary
   - **streetlight_zone_hourly**: Smart city lighting analytics
   - **weather_hourly**: Weather context (imported external or simulated)
   - **energy_cost_daily**: Daily cost analysis
   - **pv_self_consumption_daily**: Photovoltaic self-consumption KPIs

8. **Trino SQL Engine**: Connects to Gold Layer Iceberg tables via Hive connector. Executes analytical SQL queries with OIDC token-based authentication.

9. **AI Insight Service**: FastAPI service consuming Trino SQL results. Computes deterministic analytics (anomaly detection, trend forecasting, event correlation) and optionally calls LLM APIs for narrative summaries.

10. **AI Insight UI (ORCE)**: Vue.js SPA hosted in ORCE's UIBUILDER. Communicates with AI Insight Service and Trino via Node-RED flows. Supports both structured prompts (analytical insights) and freeform natural language queries.

11. **Browser Dashboard**: Real-time WebSocket-driven interface where users view KPI cards, charts, and AI-generated insights.

---

## Service Interaction Matrix

| From | To | Protocol | Port | Purpose |
|---|---|---|---|---|
| **Simulation** | MQTT Broker | MQTT | 1883 | Publish telemetry (energy, weather, events) with QoS 1 |
| **Simulation** | Kafka | TCP | 9092 | Publish telemetry and events to `simulation.telemetry`, `simulation.events` topics |
| **Simulation** | ORCE (Webhook) | HTTP | 1880 | Optional tick/notification webhook (if `SIMULATOR_ORCE__ENABLED=true`) |
| **ORCE** | MQTT Broker | MQTT | 1883 | Subscribe to telemetry topics (optional); re-publish transformed messages |
| **ORCE** | Kafka | TCP | 9092 | Subscribe to topics; produce to output topics (custom flows) |
| **ORCE** | AI Insight Service | HTTP | 8080 | Structured insight requests (energy-summary, anomaly-report, city-status) |
| **ORCE** | Trino | HTTPS | 8443 | SQL queries with OIDC Bearer tokens (Tab 3: Trino Query flow) |
| **ORCE** | Keycloak | HTTPS | 443 | OIDC token endpoint for Trino service-account authentication |
| **ORCE** | LLM API | HTTPS | 443 | Freeform AI queries to OpenAI, Claude (Anthropic), or custom LLM endpoints |
| **NiFi** | Kafka | TCP | 9092 | Consume from `simulation.telemetry`, `simulation.events` topics |
| **NiFi** | S3/MinIO | HTTP | 9000 | Write Bronze and Silver Iceberg tables |
| **AI Insight Service** | Trino | HTTP/HTTPS | 8080/8443 | Query Gold views for analytics context (service-to-service, no auth by default in dev) |
| **AI Insight Service** | Keycloak | HTTPS | 443 | Optional OIDC token exchange if Trino requires auth |
| **AI Insight Service** | LLM API | HTTPS | 443 | Call external LLM for narrative generation (configurable endpoint) |
| **AI Insight Service** | Redis | TCP | 6379 | Optional response caching (if `AI_INSIGHT_CACHE__ENABLED=true`) |
| **AI Insight UI (Vue.js in ORCE)** | ORCE (WebSocket) | WS/WSS | 1880 | UIBuilder client-server messaging (UIBUILDER protocol) |
| **AI Insight UI (ORCE flows)** | AI Insight Service | HTTP | 8080 | Request structured insights (energy-summary, anomaly-report, city-status) |
| **AI Insight UI (ORCE flows)** | Trino | HTTPS | 8443 | Direct KPI queries with Keycloak OIDC tokens |
| **AI Insight UI (ORCE flows)** | Keycloak | HTTPS | 443 | OIDC password-grant token exchange for Trino auth |
| **AI Insight UI (ORCE flows)** | LLM API | HTTPS | 443 | Freeform LLM queries (OpenAI, Claude, custom) |

---

## Shared Dependencies

These services and infrastructure components are required by multiple FACIS services.

| Dependency | Purpose | Required By | Criticality |
|---|---|---|---|
| **Trino** | SQL query engine over Iceberg lakehouse tables; provides unified Gold Layer access | AI Insight Service, AI Insight UI (ORCE flows) | High |
| **Keycloak** | OIDC identity provider; authenticates service accounts and end users | AI Insight Service (if Trino auth required), AI Insight UI (browser login + Trino service-account auth) | Medium |
| **Kafka** | Distributed message streaming; connects simulation → ingestion → analytics | Simulation (producer), NiFi (consumer), ORCE (optional consumer), custom applications | High |
| **MQTT Broker** | Lightweight pub-sub for telemetry; used by Simulation and optional ORCE consumers | Simulation (publisher), ORCE (optional subscriber) | Medium |
| **ORCE (Node-RED)** | Flow orchestration and UI hosting; central routing and transformation hub | AI Insight UI (hosts UIBUILDER dashboard), custom integrations | High |
| **S3/MinIO** | Object storage for Bronze, Silver, and Gold Iceberg table data | NiFi (ingestion writer), Trino (query source) | High |
| **Redis** (Optional) | In-memory cache for AI Insight Service responses | AI Insight Service (if `AI_INSIGHT_CACHE__ENABLED=true`) | Low |
| **LLM API** (OpenAI, Claude, etc.) | External Large Language Model for narrative generation | AI Insight Service, AI Insight UI (Tab 2: LLM Router) | Medium |

---

## Configuration Alignment Checklist

These environment variables **MUST match across services** for end-to-end communication to work correctly.

| Setting | Simulation | AI Insight Service | AI Insight UI (ORCE Env) | Notes |
|---|---|---|---|---|
| **Kafka Bootstrap Servers** | `SIMULATOR_KAFKA__BOOTSTRAP_SERVERS` | — | — | Producer config in Simulation. Must point to same Kafka brokers (e.g., `kafka-0:9092,kafka-1:9092,kafka-2:9092`). |
| **Kafka Topic Names** | Publishes to: `simulation.telemetry`, `simulation.events` | Consumes from: `simulation.telemetry`, `simulation.events` | — | Topics are hardcoded in Simulation and NiFi flows. Keep consistent. |
| **Trino Host** | — | `AI_INSIGHT_TRINO__HOST` | `FACIS_TRINO_HOST` | Both must point to same Trino coordinator (e.g., `trino.stackable.svc.cluster.local` or `212.132.83.150`). |
| **Trino Port** | — | `AI_INSIGHT_TRINO__PORT` | `FACIS_TRINO_PORT` | Default: `8080` (dev) or `8443` (cluster HTTPS). Must match. |
| **Trino Catalog** | — | `AI_INSIGHT_TRINO__CATALOG` | — | Hardcoded in ORCE flows as `hive` or `iceberg`. Verify against actual Trino setup. |
| **Trino Schema** | — | `AI_INSIGHT_TRINO__TARGET_SCHEMA` | — | Default: `gold`. Hardcoded in ORCE flows. Must exist in Trino. |
| **Keycloak URL** | — | `AI_INSIGHT_TRINO__OIDC_TOKEN_URL` | `FACIS_KEYCLOAK_URL` | Both use for OIDC password-grant token exchange. Example: `https://identity.facis.cloud/realms/facis/protocol/openid-connect/token`. |
| **Keycloak Client ID** | — | `AI_INSIGHT_TRINO__OIDC_CLIENT_ID` | `FACIS_OIDC_CLIENT_ID` | Must be registered in Keycloak with `password` grant enabled. Default: `trino`. |
| **Keycloak Client Secret** | — | `AI_INSIGHT_TRINO__OIDC_CLIENT_SECRET` | `FACIS_OIDC_CLIENT_SECRET` | Sensitive; obtain from DevOps. Same secret on both services. |
| **Trino Username (OIDC)** | — | `AI_INSIGHT_TRINO__OIDC_USERNAME` | `FACIS_TRINO_USER` | Service account for password-grant flow (e.g., `admin` or `facis-service`). |
| **Trino Password (OIDC)** | — | `AI_INSIGHT_TRINO__OIDC_PASSWORD` | `FACIS_TRINO_PASSWORD` | Service account password. Keep secure. |
| **AI Insight Service URL** | — | — | `AI_INSIGHT_BASE_URL` | ORCE uses to call AI Insight Service. Default: `http://ai-insight-service:8080` (cluster) or `http://localhost:8080` (local dev). |
| **OpenAI API Key** | — | — | `FACIS_OPENAI_API_KEY` | For Tab 2 (LLM Router) OpenAI path. Optional if only using Claude or custom LLM. |
| **OpenAI Model** | — | — | `FACIS_OPENAI_MODEL` | Default: `gpt-4.1-mini`. Must be available in your OpenAI account. |
| **Anthropic API Key** | — | — | `FACIS_ANTHROPIC_API_KEY` | For Claude support. Optional if only using OpenAI. |
| **Anthropic Model** | — | — | `FACIS_ANTHROPIC_MODEL` | Default: `claude-sonnet-4-20250514`. Verify model name against Anthropic API. |
| **Custom LLM Endpoint** | — | — | `FACIS_CUSTOM_LLM_URL` | Optional OpenAI-compatible endpoint (e.g., local Ollama, Azure OpenAI). |
| **Custom LLM Key** | — | — | `FACIS_CUSTOM_LLM_KEY` | API key for custom LLM (if required). |

**Validation Steps:**

1. After deploying Simulation, verify Kafka topics exist: `kafka-topics.sh --list --bootstrap-server <broker>:9092`
2. Confirm NiFi is consuming Kafka topics: check NiFi UI for active KafkaConsumer processors and queue depth.
3. Query Trino directly to verify Gold views exist: `SELECT * FROM hive.gold.net_grid_hourly LIMIT 1`
4. Test AI Insight Service locally: `curl -X GET http://ai-insight-service:8080/health`
5. Import ORCE flows and check the debug tab for error messages.
6. Open browser to `http://localhost:1880/aiInsight/` and verify UI loads without console errors.

---

## Cross-Service Debugging

### Request Tracing: End-to-End Example

**Scenario:** User selects "Energy Summary" in the AI Insight UI dashboard.

**Step 1: Check Simulation Data Production**

Verify that the Simulation service is producing data to Kafka:

```bash
# Port-forward Kafka (if in cluster)
kubectl port-forward svc/kafka 9092:9092 -n stackable

# Check topics
kafka-topics.sh --list --bootstrap-server localhost:9092

# Consume recent messages
kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic simulation.telemetry \
  --from-beginning \
  --max-messages 5
```

Check Simulation health endpoint:

```bash
curl -X GET http://localhost:8080/health
# Expected: 200 OK, JSON with service metadata
```

**Step 2: Verify NiFi Processors Are Running**

Open NiFi UI (`http://localhost:8080/nifi`) and confirm:

- KafkaConsumer for `simulation.telemetry` is **running** (green play button)
- Queue depth is non-zero (messages queued)
- Schema validation processor completed without errors
- Bronze S3 writer is flushing data to MinIO

Check NiFi logs:

```bash
# If in Kubernetes
kubectl logs -f deployment/nifi -n stackable | grep -i error
```

**Step 3: Confirm Data in Trino Gold Views**

Query Trino directly (requires OIDC token if auth enabled):

```bash
# Local dev (no auth)
trino --server http://localhost:8080 \
      --catalog hive \
      --schema gold

trino> SELECT COUNT(*) FROM net_grid_hourly;
# Expected: non-zero row count

trino> SELECT hour, avg_consumption_kw FROM net_grid_hourly ORDER BY hour DESC LIMIT 1;
# Expected: recent timestamp with numeric value
```

**Step 4: Test AI Insight Service Endpoints**

Call the energy-summary endpoint directly with governance headers:

```bash
curl -X POST http://ai-insight-service:8080/api/v1/insights/energy-summary \
  -H 'Content-Type: application/json' \
  -H 'x-agreement-id: agreement-ui' \
  -H 'x-asset-id: asset-ui' \
  -H 'x-user-roles: ai_insight_consumer' \
  -d '{
    "start_ts": "2026-04-01T00:00:00Z",
    "end_ts": "2026-04-05T23:59:59Z",
    "timezone": "UTC"
  }'
# Expected: 200 OK with InsightResponse JSON
```

**Step 5: Check ORCE Flow Execution**

Open ORCE editor (`http://localhost:1880`) and:

1. Navigate to **Tab 1 (AI Insight Proxy)**
2. Click the **Debug tab** on the right sidebar
3. Trigger "Energy Summary" from the UI dashboard
4. Watch debug messages flow through the nodes (green dots = messages passed)
5. Check for errors (red debug nodes)

Inspect the HTTP request node's outgoing URL:

```
AI Insight Proxy → Build HTTP Request → http-insight-request
```

Verify headers and URL are correct in the debug output.

**Step 6: Verify AI Insight UI Rendering**

Open the browser dashboard (`http://localhost:1880/aiInsight/`) and:

1. Open **Browser DevTools** (F12)
2. Go to **Console** tab
3. Check for JavaScript errors (red text)
4. Go to **Network** tab
5. Trigger an action (e.g., "Load Latest Insights")
6. Verify HTTP requests:
   - `POST /api/v1/insights/latest` → AI Insight Service (200 OK)
   - Responses should contain insight data

**Common Failure Points:**

| Issue | Diagnosis | Fix |
|---|---|---|
| Simulation not producing Kafka data | Kafka topic is empty; Simulation health returns 500 | Check Simulation logs; verify `SIMULATOR_KAFKA__BOOTSTRAP_SERVERS` matches Kafka brokers |
| NiFi processors failing | NiFi UI shows errors; queue has backlog | Check NiFi logs for schema mismatches; verify MinIO credentials |
| Trino returns no results | Gold views are empty or schema mismatch | Verify data flowed to Bronze/Silver; confirm table names match config |
| AI Insight Service 401 errors | Trino rejects queries | Check Keycloak token endpoint; verify OIDC credentials |
| ORCE flows not triggering | UIBuilder doesn't send messages | Check ORCE logs; verify `AI_INSIGHT_BASE_URL` environment variable |
| Browser UI shows blank dashboard | WebSocket connection failed; console errors | Check ORCE is running; verify network connectivity to ORCE port 1880 |

---

## Network Topology

### Kubernetes Namespace Layout

FACIS services are distributed across two Kubernetes namespaces:

**Namespace: `facis`** — FACIS application services
- `simulation` — Simulation Service (REST API, Modbus, Kafka producer)
- `ai-insight-service` — AI Insight Service (FastAPI)
- `orce` — ORCE instance (Node-RED, UIBUILDER, UI hosting)

**Namespace: `stackable`** (or similar) — Data infrastructure
- `trino-coordinator-0`, `trino-worker-0`, etc. — Trino SQL cluster
- `kafka-0`, `kafka-1`, `kafka-2` — Kafka brokers
- `nifi-0` — NiFi ingestion
- `minio` — MinIO object storage (Bronze/Silver/Gold data)
- `keycloak` — Keycloak identity provider
- `redis` (optional) — Redis cache

### Service DNS Names

Services communicate via Kubernetes internal DNS (`<service>.<namespace>.svc.cluster.local`):

- `simulation.facis.svc.cluster.local:8080` — Simulation Service REST API
- `ai-insight-service.facis.svc.cluster.local:8080` — AI Insight Service
- `orce.facis.svc.cluster.local:1880` — ORCE HTTP/WebSocket
- `trino-coordinator-0.stackable.svc.cluster.local:8080` — Trino SQL (dev) or `8443` (HTTPS)
- `kafka-0.stackable.svc.cluster.local:9092` — Kafka broker (also kafka-1, kafka-2)
- `keycloak.stackable.svc.cluster.local:8080` — Keycloak (or external HTTPS endpoint)
- `minio.stackable.svc.cluster.local:9000` — MinIO API
- `redis.stackable.svc.cluster.local:6379` — Redis (optional)

### Network Policies (Optional)

In a production cluster, you may want to enforce network policies:

```yaml
# Example: Allow AI Insight UI (ORCE) to call AI Insight Service
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: orce-to-ai-insight
  namespace: facis
spec:
  podSelector:
    matchLabels:
      app: ai-insight-service
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: orce
      ports:
        - protocol: TCP
          port: 8080
```

---

## See Also

- [Deployment Walkthrough](./deployment-walkthrough.md) — Step-by-step deployment guide
- [AI Insight Service Documentation](./services/ai-insight-service/docs/) — Service architecture, API reference
- [AI Insight UI README](./services/ai-insight-ui/README.md) — UI flows, UIBUILDER setup
- [Simulation Service Configuration](./services/simulation/.env.example) — Telemetry producer config

---

(c) ATLAS IoT Lab GmbH -- FACIS FAP IoT & AI Demonstrator  
Licensed under Apache License 2.0
