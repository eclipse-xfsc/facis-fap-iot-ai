# Features

## FACIS FAP IoT & AI — Feature Overview

The IoT-AI Federated Architecture Pattern enables secure IoT data collection,
dataspace-compliant transfer, data-lake aggregation, AI-supported analytics,
and dashboard visualization.

## Feature-FAPs

### 1. IoT Data Collection (Simulation Service)

Deterministic simulation of 9 correlated IoT time-series feeds:

**Smart Energy feeds:**
- Energy Meter (3-phase Janitza UMG 96RM with IEEE 754 registers)
- PV Generation (physics-based irradiance/temperature modeling)
- Weather (atmospheric: temperature, wind, cloud cover, GHI)
- Energy Price (EPEX Spot day-ahead market simulation)
- Consumer Load (industrial device schedules with duty cycles)

**Smart City feeds:**
- Streetlights (event-driven dimming with schedules)
- Traffic (flow and congestion simulation)
- City Events (incident and event generation)
- Visibility (atmospheric visibility conditions)

**Key capabilities:**
- Deterministic output via seeded RNG (reproducible for BDD/testing)
- Multi-protocol publishing: MQTT, Kafka, REST, Modbus TCP, ORCE webhooks
- Configurable time acceleration (1x to 60x+)
- Correlation engines enforce physical dependencies between feeds

### 2. Data-Lake Management

**Bronze Layer:**
- Raw ingestion from MQTT/Kafka into Apache NiFi
- Avro-serialized storage with 9 Bronze schemas
- Partitioned by timestamp for efficient queries

**Silver Layer:**
- Type enrichment and data cleansing
- 9 Silver schemas with derived fields
- Processed via NiFi dataflows

**Gold Layer:**
- Aggregated analytics materialized via Trino SQL
- Cost analysis, PV performance, consumption trends
- Queryable by AI Insight Service

### 3. AI / Visualization

**AI Insight Service:**
- Three governed insight endpoints (anomaly-report, city-status, energy-summary)
- LLM integration (OpenAI-compatible API) with rule-based fallback
- Policy-based access control (agreement, asset, role headers)
- Per-agreement rate limiting
- Trino Gold Layer queries for analytics context
- Audit logging for compliance

**AI Insight UI (Dashboard):**
- AI-first Vue.js SPA with prompt-driven interaction
- Smart prompts (pre-built queries) + freeform natural language
- KPI cards with real-time metrics
- Chart.js visualizations (24h forecast, cost trends, PV performance)
- Multi-LLM support (OpenAI, Claude, custom providers)
- UIBUILDER integration with ORCE (Node-RED)

## Cross-Cutting Features

### Security & Trust
- TLS 1.3 for all endpoints
- Keycloak OIDC integration for authentication
- Policy-based access control
- Secrets stored in Kubernetes Secrets
- Pod security contexts (non-root, read-only filesystem, dropped capabilities)

### Orchestration (ORCE)
- XFSC ORCE (Node-RED) for service orchestration
- Zero-touch deploy/redeploy/uninstall
- Builder Node orchestration
- Low-code integration flows

### Deployment
- Kubernetes v1.29+ on IONOS Cloud
- Helm charts for all services
- GitHub Actions CI/CD
- Multi-stage Docker images (non-root, minimal attack surface)

### Observability
- Structured JSON logging
- Health check endpoints (`/api/v1/health`)
- Kubernetes liveness and readiness probes
- Audit logging for AI inference requests
