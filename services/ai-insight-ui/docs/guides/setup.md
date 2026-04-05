# Development Environment Setup

**Project:** FACIS FAP IoT & AI — AI Insight UI
**Version:** 0.1
**Date:** 05 April 2026

---

## 1. Prerequisites

| Requirement | Minimum Version | Verify Command |
|---|---|---|
| Node.js | 22 | `node --version` |
| npm | 10 | `npm --version` |
| Docker | 24.0 | `docker --version` |
| ORCE (Node-RED) | 4.0+ | Check ORCE UI at port 1880 |
| UIBUILDER node | 6.0+ | Check ORCE Palette |
| AI Insight Service | (running) | curl http://localhost:8080/docs |

Optional (for cluster deployment):

| Requirement | Minimum Version | Purpose |
|---|---|---|
| kubectl | 1.28 | Kubernetes cluster access |
| helm | 3.14 | Helm chart deployment |

---

## 2. Repository Setup

```bash
# Clone the repository
git clone <repo-url> facis
cd facis-fap-iot-ai/services/ai-insight-ui
```

All commands below assume you are in the `ai-insight-ui/` directory.

---

## 3. Local Development with ORCE

### 3.1 Import Node-RED Flow Tabs

The flows are pre-split into 5 tabs (0–4). Import them into Node-RED via the Node-RED editor:

1. Open Node-RED admin UI at `http://localhost:1880`
2. Menu → Import
3. Upload each file from `flows/tabs/`:
   - `0-UI.json` — Message routing by topic (UI ↔ Tabs 1–3)
   - `1-AI-Insight-Proxy.json` — HTTP calls to AI Insight Service (FastAPI :8080)
   - `2-LLM-Router.json` — Multi-provider LLM routing (OpenAI, Claude, custom)
   - `3-Trino-Query.json` — Direct Trino Gold Layer queries with OIDC auth
   - `4-Session-Context.json` — Session lifecycle and conversation history

Or import the merged flow in one operation:

```bash
curl -X POST http://localhost:1880/flows \
  -H 'Content-Type: application/json' \
  -d @flows/flows.full.json
```

### 3.2 Copy UI Files to UIBUILDER

```bash
# Copy Vue SPA files to UIBUILDER source directory
# (replace {uibuilder-path} with your ORCE container or local UIBUILDER path)
cp -r ui/src/* /data/uibuilder/ai-insight/src/

# If using Docker, copy into the container:
docker cp ui/src/. <orce-container-id>:/data/uibuilder/ai-insight/src/
```

Expected UIBUILDER structure after copy:

```
/data/uibuilder/ai-insight/src/
├── index.html          # Vue 3 SPA entry point
├── index.js            # Vue app logic + UIBUILDER bindings
├── index.css           # FACIS design system
└── Facis-logo.svg      # Branding asset
```

### 3.3 Set ORCE Environment Variables

Configure these environment variables in ORCE's Docker container or system environment. These are referenced by the Node-RED flow tabs:

```bash
export AI_INSIGHT_BASE_URL="http://ai-insight-service:8080"
export FACIS_KEYCLOAK_URL="https://identity.facis.cloud/realms/facis/protocol/openid-connect/token"
export FACIS_OIDC_CLIENT_ID="trino"
export FACIS_OIDC_CLIENT_SECRET="<secret>"
export FACIS_TRINO_USER="admin"
export FACIS_TRINO_PASSWORD="<password>"
export FACIS_TRINO_HOST="212.132.83.150"
export FACIS_TRINO_PORT="8443"
export FACIS_OPENAI_API_KEY="sk-..."
export FACIS_OPENAI_MODEL="gpt-4.1-mini"
export FACIS_ANTHROPIC_API_KEY="sk-ant-..."
export FACIS_ANTHROPIC_MODEL="claude-sonnet-4-20250514"
export FACIS_CUSTOM_LLM_URL=""       # Leave empty to disable
export FACIS_CUSTOM_LLM_KEY=""       # Leave empty to disable
```

### 3.4 Access the Dashboard

Open your browser to the UIBUILDER path:

```
http://localhost:1880/uibuilder/ai-insight/
```

The Keycloak login overlay will appear. Authenticate with your FACIS Identity credentials.

---

## 4. Standalone Development with Vite

For frontend-only development without ORCE, use Vite dev server with API proxy:

```bash
cd ui/app

# Install dependencies
npm ci

# Start dev server (hot reload enabled)
npm run dev
```

The app will be available at `http://localhost:3000` with automatic proxy to `http://localhost:8080/api/` (configured in `vite.config.ts`).

Note: Keycloak authentication is configured to `https://identity.facis.cloud`. For local development, either:
- Mock the Keycloak responses in the browser console, or
- Update `ui/src/index.js` to point to a local Keycloak instance

---

## 5. Docker Build

The `Dockerfile` uses a two-stage build: Node.js 22 builder → Nginx 1.27 runtime.

### 5.1 Build the Image

```bash
docker build -t facis-ai-insight-ui:latest .
```

The build performs these steps:

1. **Builder stage:** Installs npm dependencies, runs `npm run build`, outputs to `dist/`
2. **Runtime stage:** Copies `dist/` to Nginx document root, configures SPA routing and proxy rules

### 5.2 Proxy Rules

The Nginx configuration (embedded in the Dockerfile) includes:

- **`/api/sim/`** → Proxies to `http://facis-simulation.facis.svc.cluster.local:8080/api/v1/`
- **`/api/ai/`** → Proxies to `http://facis-ai-insight.facis.svc.cluster.local:8080/api/v1/`
- **`/` (root)** → Falls back to `index.html` for SPA routing
- **`/assets/`** → Sets cache headers (1 year, immutable)

### 5.3 Run the Container

```bash
docker run -p 8080:8080 facis-ai-insight-ui:latest
```

Access the UI at `http://localhost:8080`. The container runs as the unprivileged `nginx` user.

---

## 6. Build Pipeline

The build script automates packaging for Helm deployment:

```bash
./scripts/build-and-package.sh [--skip-install]
```

### 6.1 What It Does

1. **Installs npm dependencies** (unless `--skip-install` is passed)
2. **Runs `npm run build`** via Vite — outputs to `ui/app/dist/`
3. **Copies dist/* to Helm chart** — places files in `helm/facis-ai-insight-ui/files/ui/`

### 6.2 Usage

```bash
# Full build (install + vite build + copy to helm)
./scripts/build-and-package.sh

# Skip npm install (reuse node_modules)
./scripts/build-and-package.sh --skip-install
```

### 6.3 Post-Build Deployment

After the script completes, deploy with Helm:

```bash
helm upgrade facis-ui ./helm/facis-ai-insight-ui \
  -n facis \
  -f ./helm/facis-ai-insight-ui/values.yaml
```

---

## 7. Project Structure

```
ai-insight-ui/
├── ui/
│   ├── src/
│   │   ├── index.html            Entry point (Vue 3 SPA, 225 lines)
│   │   ├── index.js              Vue logic + UIBUILDER bindings (650+ lines)
│   │   ├── index.css             FACIS design system (1160 lines)
│   │   └── Facis-logo.svg        Branding asset
│   └── app/
│       ├── src/                  (TypeScript source, components, stores, composables)
│       ├── public/               (Static assets)
│       ├── package.json          Dependencies: Vue 3, Chart.js, Keycloak, PrimeVue
│       ├── vite.config.ts        Vite build config + dev proxy
│       └── tsconfig.json         TypeScript configuration
├── flows/
│   ├── flows.full.json           Merged flow file (40 nodes)
│   └── tabs/
│       ├── 0-UI.json             UI message routing
│       ├── 1-AI-Insight-Proxy.json HTTP proxy to AI Insight Service
│       ├── 2-LLM-Router.json     LLM provider routing
│       ├── 3-Trino-Query.json    Trino Gold Layer queries
│       └── 4-Session-Context.json Session management
├── k8s/
│   └── ai-insight-ui-configmap.yaml K8s ConfigMap for UI files
├── helm/
│   └── facis-ai-insight-ui/      Helm chart (ConfigMaps, Secrets)
│       ├── Chart.yaml
│       ├── values.yaml
│       ├── templates/
│       │   ├── configmap-flows.yaml
│       │   ├── configmap-ui.yaml
│       │   └── secret.yaml
│       └── files/                (UI dist/ copied here by build script)
├── docs/
│   ├── guides/                   (This documentation)
│   └── flow-architecture.md      (Detailed flow diagrams)
├── scripts/
│   └── build-and-package.sh      Build automation script
├── README.md                      Quick start guide
├── Dockerfile                     Multi-stage build
├── LICENSE                        Apache 2.0
└── .gitignore
```

---

## 8. Troubleshooting

**"Cannot find module 'vue'"** — Run `npm ci` in `ui/app/` to install dependencies.

**ORCE flows show errors** — Ensure all environment variables are set in ORCE's container. Check ORCE debug output: Node-RED editor → Debug messages panel.

**Keycloak login hangs** — Verify Keycloak is reachable at `https://identity.facis.cloud`. If using local Keycloak, update the URL in `ui/src/index.js`.

**Nginx container won't start** — Check that port 8080 is not in use. The Dockerfile configures Nginx to run as unprivileged user; ensure `/tmp` is writable in the container.

**"AI Insight Service unreachable"** — Verify the service is running at the configured `AI_INSIGHT_BASE_URL`. In Kubernetes, use the cluster-internal DNS: `http://ai-insight-service:8080`.

**Build size large** — The compiled Vue SPA is typically 1–2 MB. To optimize, disable unused chart types or components in `ui/app/src/`.

---

© ATLAS IoT Lab GmbH — FACIS FAP IoT & AI Demonstrator
Licensed under Apache License 2.0
