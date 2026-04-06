# FACIS AI Insight Dashboard

Vue.js + UIBUILDER frontend for AI-powered interaction with FACIS IoT & Smart City data.

## What This Provides

- AI-first dashboard with prompt-driven interaction as the central feature
- Smart prompts for common analytical queries (energy cost, PV forecast, anomalies, city events)
- Free-form natural language questions with Gold Layer data context
- Multi-LLM support: OpenAI, Claude (Anthropic), and configurable custom providers
- KPI cards populated from cached AI insights
- Chart.js data visualization (24h forecast, cost trends, PV performance)
- Follows the Reference FAP (Partner Onboarding) UIBUILDER pattern

## Architecture

```
Browser (Vue 3 SPA)
    │ uibuilder.send() / onChange()
    ▼
ORCE Node-RED Flows
    ├─ Tab 0: UI routing
    ├─ Tab 1: AI Insight Service proxy (HTTP → FastAPI :8080)
    ├─ Tab 2: LLM Router (OpenAI / Claude / Custom)
    ├─ Tab 3: Trino Gold Layer queries (OIDC auth)
    └─ Tab 4: Session context management
```

**Two-path AI architecture:**
- **Path A (Structured):** Smart prompts → AI Insight Service → deterministic analytics + LLM
- **Path B (Freeform):** Free text → Trino context → user-selected LLM provider

## Quick Start (Local Development)

### Prerequisites
- ORCE (Node-RED) with UIBUILDER node installed
- AI Insight Service running at `http://localhost:8080`
- LLM API keys (OpenAI and/or Anthropic)

### Deploy UI Files
Copy `ui/src/` contents to UIBUILDER's source directory:
```bash
cp -r ui/src/* /data/uibuilder/aiInsight/src/
```

### Import Flows
Import the merged flow file into Node-RED:
```bash
curl -X POST http://localhost:1880/flows \
  -H 'Content-Type: application/json' \
  -d @flows/flows.full.json
```

Or import individual tabs via the Node-RED editor (Menu → Import).

### Set Environment Variables
```bash
export AI_INSIGHT_BASE_URL=http://localhost:8080
export FACIS_OPENAI_API_KEY=sk-...
export FACIS_OPENAI_MODEL=gpt-4.1-mini
export FACIS_ANTHROPIC_API_KEY=sk-ant-...
export FACIS_ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

### Access
Open `http://localhost:1880/aiInsight/` in your browser.

## Cluster Deployment (Kubernetes)

1. Create the LLM secrets:
```bash
kubectl create secret generic orce-llm-secrets \
  --from-literal=openai-api-key=sk-... \
  --from-literal=anthropic-api-key=sk-ant-... \
  -n facis
```

2. Create the flows ConfigMap:
```bash
kubectl create configmap ai-insight-ui-flows \
  --from-file=flows.json=flows/flows.full.json \
  -n facis
```

3. Copy UI files to the ORCE pod:
```bash
kubectl cp ui/src/ facis/orce-pod:/data/uibuilder/aiInsight/src/
```

4. Import flows via ORCE admin API or restart ORCE with the ConfigMap mounted.

See `k8s/ai-insight-ui-configmap.yaml` for the full K8s manifests.

## File Structure

```
ai-insight-ui/
├── ui/src/
│   ├── index.html       # Vue 3 SPA (204 lines)
│   ├── index.js         # All Vue logic (652 lines)
│   ├── index.css        # FACIS design system (1160 lines)
│   └── Facis-logo.svg   # Branding
├── flows/
│   ├── flows.full.json  # Merged flow (40 nodes)
│   └── tabs/            # Individual flow tabs
│       ├── 0-UI.json
│       ├── 1-AI-Insight-Proxy.json
│       ├── 2-LLM-Router.json
│       ├── 3-Trino-Query.json
│       └── 4-Session-Context.json
├── k8s/                 # Kubernetes manifests
├── docs/                # Documentation
├── README.md
└── LICENSE
```

## Required Environment Variables

| Variable | Default | Description |
|---|---|---|
| `AI_INSIGHT_BASE_URL` | `http://ai-insight-service:8080` | AI Insight Service endpoint |
| `FACIS_KEYCLOAK_URL` | `https://identity.facis.cloud/.../token` | Keycloak token endpoint |
| `FACIS_OIDC_CLIENT_ID` | `trino` | OIDC client for Trino |
| `FACIS_OIDC_CLIENT_SECRET` | — | OIDC client secret |
| `FACIS_TRINO_USER` | `admin` | Trino username |
| `FACIS_TRINO_PASSWORD` | — | Trino password |
| `FACIS_TRINO_HOST` | `212.132.83.150` | Trino coordinator host |
| `FACIS_TRINO_PORT` | `8443` | Trino coordinator port |
| `FACIS_OPENAI_API_KEY` | — | OpenAI API key |
| `FACIS_OPENAI_MODEL` | `gpt-4.1-mini` | OpenAI model name |
| `FACIS_ANTHROPIC_API_KEY` | — | Anthropic API key |
| `FACIS_ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | Anthropic model name |
| `FACIS_CUSTOM_LLM_URL` | — | Custom LLM endpoint (optional) |
| `FACIS_CUSTOM_LLM_KEY` | — | Custom LLM API key (optional) |
