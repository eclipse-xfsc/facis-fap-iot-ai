# Component Design and Data Flow

**Project:** FACIS FAP IoT & AI — AI Insight UI
**Version:** 0.1
**Date:** 05 April 2026

---

## 1. High-Level Architecture

The AI Insight UI is a two-tier system: a **Vue.js Single-Page Application (SPA)** in the browser communicates via UIBUILDER's message protocol to an **ORCE (Node-RED) orchestration engine**, which routes requests to three backend services: the **AI Insight Service**, the **LLM providers** (OpenAI, Anthropic), and the **Trino Gold Layer** for analytics.

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (Vue 3 SPA)                                             │
│  ├─ Keycloak PKCE Authentication                                │
│  ├─ KPI Cards (energy, cost, PV, anomalies)                     │
│  ├─ Conversation Interface (messages, charts)                    │
│  └─ Time Range Selector (24h, 7d, 30d, custom)                  │
└─────────────────────┬──────────────────────────────────────────┘
                      │ uibuilder.send() / onChange()
                      ▼
┌──────────────────────────────────────────────────────────────────┐
│  ORCE (Node-RED) — Flow Tabs                                     │
│  ├─ Tab 0: UI Routing & Session Merge                            │
│  ├─ Tab 1: AI Insight Service Proxy (HTTP)                       │
│  ├─ Tab 2: LLM Router (OpenAI / Claude / Custom)                 │
│  ├─ Tab 3: Trino Query (OIDC auth, Gold Layer)                   │
│  └─ Tab 4: Session Context (conversation history)                │
└─────────────────────┬──────────────────────────────────────────┘
        │             │             │
        ▼             ▼             ▼
   ┌────────────┐ ┌────────────┐ ┌──────────┐
   │ AI Insight │ │ LLM APIs   │ │ Trino    │
   │ Service    │ │ (OpenAI,   │ │ (Iceberg │
   │ (FastAPI)  │ │  Claude,   │ │ tables)  │
   │ :8080      │ │  custom)   │ │ :8443    │
   └────────────┘ └────────────┘ └──────────┘
```

---

## 2. Two-Path AI Architecture

The UI supports two distinct interaction patterns for user queries:

### 2.1 Path A: Structured Insights (Smart Prompts)

**Use case:** Predefined analytical queries (energy cost, PV forecast, anomalies, city status).

**Flow:**
1. User clicks a **Smart Prompt** button (e.g., "Daily Energy Cost Analysis")
2. Frontend sends `{ topic: 'insight.request', smartPromptId: '...' }` via UIBUILDER
3. **Tab 0 (UI Routing)** routes to **Tab 1 (AI Insight Proxy)**
4. **Tab 1** makes HTTP POST to `AI_INSIGHT_BASE_URL/api/v1/insights/{promptId}`
5. **AI Insight Service** returns structured JSON:
   ```json
   {
     "summary": "Daily energy cost is €45.32...",
     "key_findings": ["PV generation down 15%", "Grid demand peaked at 14:00"],
     "recommendations": ["Shift loads to 10:00–12:00"],
     "metadata": { "insight_type": "cost_analysis", "llm_model": "rule-based" }
   }
   ```
6. **Tab 1** formats response and sends `{ topic: 'insight.response', ... }` to **Tab 0**
7. **Tab 0** merges session context and sends to browser
8. Frontend renders as **Insight Card** (summary + findings + recommendations + metadata badges)

### 2.2 Path B: Freeform Questions (Natural Language)

**Use case:** User types a custom question (e.g., "Why did energy cost spike yesterday?").

**Flow:**
1. User types question in the input box and presses Enter
2. Frontend sends `{ topic: 'llm.freeform', userMessage: '...', history: [...] }` via UIBUILDER
3. **Tab 0 (UI Routing)** routes to **Tab 3 (Trino Query)** then **Tab 2 (LLM Router)**
4. **Tab 3** executes Trino query to fetch Gold Layer context:
   - Acquires OIDC token via Keycloak password grant
   - Executes: `SELECT * FROM gold.net_grid_hourly LIMIT 24` (or similar)
   - Formats tabular results as markdown (e.g., `| timestamp | power_kw |\n|---|---|\n|...`)
5. **Tab 2** injects Trino data into LLM prompt:
   ```
   "You are an energy analyst. Here is recent data:\n{trino_results}\n\nUser asked: {userQuestion}"
   ```
6. **Tab 2** switches by `msg.selectedProvider`:
   - **OpenAI:** POST to `https://api.openai.com/v1/chat/completions` (Bearer auth)
   - **Claude:** POST to `https://api.anthropic.com/v1/messages` (x-api-key header)
   - **Custom:** POST to `FACIS_CUSTOM_LLM_URL` (custom auth)
7. LLM returns text response. **Tab 2** normalizes the response schema (different for each provider)
8. **Tab 2** sends `{ topic: 'llm.response', content: '...', llm_model: '...' }` to **Tab 0**
9. **Tab 0** merges session and sends to browser
10. Frontend renders as **Message** (plain text with markdown) in the conversation area

---

## 3. Flow Tab Responsibilities

| Tab | Name | Responsibility | Key Nodes |
|---|---|---|---|
| **0** | UI | Message routing by topic; session merge. Receives from browser, routes to 1/2/3, merges responses, returns to browser. | UIBUILDER in/out, switch by topic, merge session |
| **1** | AI Insight Proxy | HTTP POST to AI Insight Service. Builds request, calls `/api/v1/insights/{promptId}`, parses JSON response, formats for UI. | http request, JSON parse, response formatter |
| **2** | LLM Router | Multi-provider LLM routing & prompt injection. Builds LLM-specific request body, routes by provider, normalizes response schema. | Keycloak token (for Trino context), switch provider, function nodes for schema normalization |
| **3** | Trino Query | Direct Trino queries via OIDC. Acquires Keycloak token, executes SQL, formats results as markdown context. | Keycloak token request, Trino HTTP client, SQL formatter |
| **4** | Session Context | Session lifecycle (socketId key) and conversation history. Tracks connection time, merges session context into responses. | Session init, context accumulation, cleanup |

For detailed flow diagrams and cross-tab wiring, see `docs/flow-architecture.md`.

---

## 4. Frontend Components

The Vue 3 SPA (`ui/src/index.js` + `ui/app/src/`) comprises:

### 4.1 Keycloak Authentication

- **Adapter:** Keycloak 25+ JavaScript library (CDN-hosted)
- **Flow:** PKCE (Proof Key for Code Exchange) for public clients
- **Login:** `onLoad: 'login-required'` — redirect to Keycloak immediately
- **Token refresh:** Every 60 seconds, refresh if <70 seconds remaining
- **User info:** Extracted from `keycloak.tokenParsed` (username, name, roles)

### 4.2 KPI Cards Section

Four cards display real-time metrics:

| Card | Key Data | Source | Update Trigger |
|---|---|---|---|
| **Net Grid Power** | Current power (kW) + trend (up/down/stable) + percent change | Trino `net_grid_hourly` | Every message response (Tab 3) |
| **PV Generation** | Current solar output (kW) + trend | Trino `pv_self_consumption_daily` | Smart prompts + LLM responses |
| **Daily Cost** | Accumulated cost today (EUR) + trend | Trino `energy_cost_daily` | Smart prompts |
| **Anomalies** | Count of detected anomalies + trend | AI Insight Service (structured) | Smart prompts (cost, anomaly-report) |

Data binding: `v-for="(kpi, key) in kpiData"` with CSS class for styling and trend arrows (↑↓–).

### 4.3 Smart Prompts

Pre-defined buttons triggering structured insights:

```javascript
smartPrompts: [
  { id: 'daily-cost', label: 'Daily Cost', icon: '💰' },
  { id: 'pv-forecast', label: 'PV Forecast', icon: '☀️' },
  { id: 'anomaly-report', label: 'Anomalies', icon: '🔍' },
  { id: 'city-status', label: 'City Status', icon: '🌆' }
]
```

Each button sends `insight.request` topic with the `smartPromptId` field.

### 4.4 Conversation Interface

Scrollable message area displaying:

- **User messages:** Right-aligned, plain text
- **AI insight messages:** Rounded card with:
  - Summary (markdown-rendered)
  - Key findings (bulleted list)
  - Recommendations (bulleted list)
  - Metadata badges (insight type, LLM model, timestamp)
- **AI freeform messages:** Markdown-rendered text response
- **Typing indicator:** Animated dots while waiting for response

Message ID, type, timestamp, and content tracked in `messages[]` array.

### 4.5 LLM Provider Selector

Dropdown in the header (`selectedLLM` binding) with options:
- OpenAI GPT-4.1
- Claude Sonnet
- Custom LLM

Sent with each freeform request as `msg.selectedProvider`.

### 4.6 Time Range Selector

Quick buttons to adjust time range for Trino queries:
- 24h (last 24 hours)
- 7d (last 7 days)
- 30d (last 30 days)
- Custom (date picker)

Stored in `timeRange` object; injected into Trino SQL queries.

### 4.7 Chart Panel (Collapsible)

Renders Chart.js visualizations:
- **24h Forecast:** Line chart of predicted energy
- **Cost Trends:** Bar chart of daily costs
- **PV Performance:** Area chart of solar output

Toggled by `showChartPanel` flag.

---

## 5. Session Management

Sessions are managed in **Tab 4 (Session Context)** using Node-RED's **flow context** (in-memory, not persisted across restarts).

### 5.1 Session Key

Each browser connection is identified by `_socketId` (assigned by UIBUILDER on first connection).

### 5.2 Session Data Structure

```javascript
sessions[_socketId] = {
  connectedAt: <timestamp>,
  conversationHistory: [
    { role: 'user', content: 'What was yesterday cost?' },
    { role: 'assistant', content: 'Yesterday\'s cost was €42.15...' },
    ...
  ]
}
```

### 5.3 Conversation History

- Frontend maintains a **rolling 10-message history** (last 10 user + AI exchanges)
- On each **freeform request**, frontend sends the **last 6 messages** to ORCE for LLM context
- Enables multi-turn follow-up queries (e.g., "Why?" after asking about cost)
- Smart prompts do **not** use history (stateless, deterministic)

### 5.4 Response Merge

**Tab 0** merges session metadata into responses before sending to browser:

```javascript
// Tab 0 merges session into response
msg.payload = {
  ...msg.payload,                    // Original response from Tab 1/2/3
  _socketId: msg._socketId,          // Echo socket ID
  sessionTime: <elapsed>,            // Time since connection
  messageCount: <count>              // Messages exchanged in session
}
```

---

## 6. Nginx Proxy Topology (Dockerfile)

The production image embeds Nginx with this routing:

| Path | Upstream | Purpose |
|---|---|---|
| `/api/sim/*` | `http://facis-simulation.facis.svc.cluster.local:8080/api/v1/` | Simulation service API (not used by AI UI, available for other apps) |
| `/api/ai/*` | `http://facis-ai-insight.facis.svc.cluster.local:8080/api/v1/` | AI Insight Service (used by Tab 1 for smart prompts) |
| `/` | `index.html` (SPA fallback) | Vue Router handling |
| `/assets/*` | Static file cache | 1-year immutable cache |

Note: LLM API calls (OpenAI, Anthropic) are made **from ORCE**, not from the browser, to avoid CORS and keep API keys server-side.

---

## 7. Key Design Decisions

**Message-based routing over REST.** UIBUILDER's message protocol decouples frontend from backend. The same flow tab can be called from web UI, mobile app, or automation — only the message format changes.

**ORCE middleware over direct browser APIs.** All backend calls (AI Insight Service, LLM, Trino) go through ORCE. This centralizes authentication, rate limiting, and error handling, and keeps API keys off the browser.

**Two-path architecture over single prompt handler.** Smart prompts use deterministic rules (no LLM), enabling fast, reproducible structured insights. Freeform questions use LLM for flexibility. Users choose the right tool for the task.

**Session context in flow context over persistent database.** For single-region deployments, flow context is sufficient. For multi-region, sessions can be moved to Redis via the `redis` NPM module (not implemented in current version).

**Keycloak PKCE for browser auth over password grant.** PKCE is the modern OAuth standard for public clients. Password grant is used **only** server-side (ORCE → Keycloak) for Trino token acquisition.

---

© ATLAS IoT Lab GmbH — FACIS FAP IoT & AI Demonstrator
Licensed under Apache License 2.0
