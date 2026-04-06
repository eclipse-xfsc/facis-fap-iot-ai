# AI Insight UI — Flow Architecture

## Overview

The AI Insight Dashboard uses ORCE (Node-RED) as its backend, with 5 flow tabs handling different responsibilities. All communication between the Vue.js frontend and ORCE uses UIBUILDER's message-based protocol.

## Message Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (Vue 3 + UIBUILDER)                                   │
│  uibuilder.send({ data: { topic, session, recordDetails } })   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────── Tab 0: UI ───────────────────────────────────┐
│  [UIBUILDER node]                                               │
│       │                                                         │
│       ▼                                                         │
│  [Route by Topic]                                               │
│       ├── insight.request / init ──→ link-to-insight-proxy      │
│       ├── trino.query ──→ link-to-trino-query                   │
│       └── llm.freeform ──→ link-to-llm-router                  │
│                                                                 │
│  [← Response to UI] ──→ [Merge Session] ──→ [UIBUILDER node]   │
└─────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─── Tab 1: Proxy ───┐ ┌─ Tab 3: Trino ──┐ ┌─── Tab 2: LLM ────┐
│ Build HTTP Request  │ │ Keycloak Token  │ │ Keycloak Token     │
│ ↓                   │ │ ↓               │ │ ↓                  │
│ AI Insight Service  │ │ Execute SQL     │ │ Trino Context Query│
│ (FastAPI :8080)     │ │ ↓               │ │ ↓                  │
│ ↓                   │ │ Format Result   │ │ Build LLM Prompt   │
│ Format Response     │ │ ↓               │ │ ↓                  │
│ ↓                   │ │ → Response      │ │ [Switch Provider]  │
│ → Response to UI    │ └─────────────────┘ │   ├─ OpenAI        │
└─────────────────────┘                     │   ├─ Claude        │
                                            │   └─ Custom        │
                                            │ ↓                  │
                                            │ Normalize Response │
                                            │ ↓                  │
                                            │ → Response to UI   │
                                            └────────────────────┘
```

## Message Topics

### Frontend → Backend

| Topic | Purpose | Routed To |
|---|---|---|
| `insight.request` | Structured insight (energy-summary, anomaly-report, city-status) | Tab 1 |
| `init` | Load latest cached insights for KPI cards | Tab 1 |
| `llm.freeform` | Freeform natural language question | Tab 2 |
| `trino.query` | Direct Gold Layer data query | Tab 3 |

### Backend → Frontend

| Topic | Purpose | Source |
|---|---|---|
| `insight.response` | Structured AI insight with summary/findings/recommendations | Tab 1 |
| `llm.response` | Freeform LLM response text | Tab 2 |
| `kpi.update` | KPI card data (netGrid, pvGeneration, dailyCost, anomalies) | Tab 3 |
| `latest.response` | Latest cached insights from AI Insight Service | Tab 1 |
| `error` | Error message for display | Any tab |

## Cross-Tab Link Wiring

| Link Out (source) | Link In (target) | Direction |
|---|---|---|
| `link-to-insight-proxy` (Tab 0) | `link-from-ui-insight` (Tab 1) | UI → Proxy |
| `link-to-trino-query` (Tab 0) | `link-from-ui-trino` (Tab 3) | UI → Trino |
| `link-to-llm-router` (Tab 0) | `link-from-ui-llm` (Tab 2) | UI → LLM |
| `link-response-insight` (Tab 1) | `link-from-response` (Tab 0) | Proxy → UI |
| `link-response-llm` (Tab 2) | `link-from-response` (Tab 0) | LLM → UI |
| `link-response-trino` (Tab 3) | `link-from-response` (Tab 0) | Trino → UI |

## LLM Provider Routing (Tab 2)

The switch node routes based on `msg.selectedProvider`:

- **`openai`**: POST to `https://api.openai.com/v1/chat/completions` with Bearer auth
- **`claude`**: POST to `https://api.anthropic.com/v1/messages` with `x-api-key` header
- **`custom`**: POST to configurable endpoint (`FACIS_CUSTOM_LLM_URL`) with OpenAI-compatible format

Response normalization handles the different response schemas:
- OpenAI: `choices[0].message.content`
- Claude: `content[0].text` (filtered by `type === 'text'`)
- Custom: same as OpenAI format

## Session Management

Sessions are stored in Node-RED's flow context (`flow.get/set('sessions')`), keyed by `_socketId`. Each session tracks:
- Connection timestamp
- Conversation history (maintained by the frontend, sent with each freeform request)

The frontend maintains a rolling 10-message conversation context and sends the last 6 messages with each freeform question to enable follow-up queries.
