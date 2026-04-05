# Configuration Reference

**Project:** FACIS FAP IoT & AI — AI Insight UI
**Version:** 0.1
**Date:** 05 April 2026

---

## 1. Configuration Layers

The AI Insight UI uses a **three-layer configuration model**:

1. **Vite Build-Time Variables** — Baked into the SPA at build time. Control Keycloak URLs, API endpoints, branding.
2. **ORCE Runtime Environment Variables** — Injected into the Node-RED container. Control backend service URLs, API keys, authentication credentials.
3. **Helm Values** — Configure both layers for Kubernetes deployments. Override defaults for different environments (dev, staging, production).

Configuration resolution order (higher priority overrides lower):

```
Helm values.yaml
    ↓
Environment variables (ORCE container)
    ↓
Vite .env.development / .env.production
    ↓
Hardcoded defaults in code
```

---

## 2. Vite Build-Time Variables

These variables are embedded in the compiled SPA (`dist/index.html` and `dist/assets/*.js`). They control browser-side behavior and are visible in the source (not sensitive).

### 2.1 Variable Table

| Variable | Default | Example | Description |
|---|---|---|---|
| `VITE_KEYCLOAK_URL` | `http://localhost:8180` | `https://identity.facis.cloud` | Keycloak server base URL |
| `VITE_KEYCLOAK_REALM` | `facis` | `facis` | Keycloak realm name |
| `VITE_KEYCLOAK_CLIENT_ID` | `facis-ui` | `facis-ai-insight` | OIDC client ID registered in Keycloak |
| `VITE_API_BASE_URL` | `/api` | `/api` | API base path (relative or absolute) |

### 2.2 Configuration File

Create `ui/app/.env.production` or `ui/app/.env.development`:

```env
# .env.production
VITE_KEYCLOAK_URL=https://identity.facis.cloud
VITE_KEYCLOAK_REALM=facis
VITE_KEYCLOAK_CLIENT_ID=facis-ai-insight
VITE_API_BASE_URL=/api
```

These are injected into `index.js` at build time by Vite. Check `ui/app/vite.config.ts` for the build configuration.

### 2.3 Build-Time Loading

In the browser, Keycloak is initialized with these variables (see `ui/src/index.js`):

```javascript
const keycloak = new Keycloak({
    url: 'https://identity.facis.cloud',
    realm: 'facis',
    clientId: 'facis-ai-insight'
});
```

---

## 3. ORCE Runtime Environment Variables

These are set in the **ORCE (Node-RED) container** and are referenced by the Node-RED flow tabs (Tabs 1–4). They are **sensitive** (contain API keys and passwords) and should be stored in Kubernetes Secrets.

### 3.1 AI Insight Service

| Variable | Required | Example | Description |
|---|---|---|---|
| `AI_INSIGHT_BASE_URL` | Yes | `http://ai-insight-service:8080` | Base URL of the AI Insight FastAPI service. Used by Tab 1 (Proxy) to call `/api/v1/insights/{promptId}`. |

### 3.2 Keycloak / OIDC

These credentials are used by **Tab 3 (Trino Query)** to acquire OIDC tokens for Trino authentication.

| Variable | Required | Example | Description |
|---|---|---|---|
| `FACIS_KEYCLOAK_URL` | Yes | `https://identity.facis.cloud/realms/facis/protocol/openid-connect/token` | Keycloak token endpoint. Format: `{keycloak-url}/realms/{realm}/protocol/openid-connect/token` |
| `FACIS_OIDC_CLIENT_ID` | Yes | `trino` | OIDC client ID for Trino authentication. Must be registered in Keycloak with password grant enabled. |
| `FACIS_OIDC_CLIENT_SECRET` | Yes | `secret-key-xxx` | OIDC client secret. Store in Kubernetes Secret. |
| `FACIS_OIDC_USERNAME` | Yes | `trino-user` | Username for the password grant flow. Typically a service account. |
| `FACIS_OIDC_PASSWORD` | Yes | `password-xxx` | Password for the password grant flow. Store in Kubernetes Secret. |

### 3.3 Trino / Gold Layer

These variables are used by **Tab 3 (Trino Query)** to connect to the Trino cluster and query the Gold Layer.

| Variable | Required | Default | Example | Description |
|---|---|---|---|---|
| `FACIS_TRINO_HOST` | Yes | — | `212.132.83.150` or `trino.stackable.svc.cluster.local` | Trino coordinator hostname or IP. |
| `FACIS_TRINO_PORT` | Yes | — | `8443` (cluster) or `8080` (local dev) | Trino HTTP(S) port. Cluster deployments use 8443 (HTTPS); local dev uses 8080. |
| `FACIS_TRINO_HTTP_SCHEME` | No | `http` | `https` (cluster) or `http` (dev) | Protocol scheme (`http` or `https`). |
| `FACIS_TRINO_VERIFY_SSL` | No | `true` | `true` or `/app/certs/ca.crt` | SSL certificate verification. `true` = default CA bundle, `false` = skip, or path to CA file. |
| `FACIS_TRINO_CATALOG` | No | `hive` | `iceberg` | Trino catalog name. Usually `iceberg` for Stackable deployments. |
| `FACIS_TRINO_SCHEMA` | No | `facis` | `facis` | Trino schema (database) containing the Gold tables. |

### 3.4 OpenAI Configuration

For **Path B (Freeform)** when user selects OpenAI provider:

| Variable | Required | Example | Description |
|---|---|---|---|
| `FACIS_OPENAI_API_KEY` | Yes (if OpenAI enabled) | `sk-proj-abc123...` | OpenAI API key. Store in Kubernetes Secret. |
| `FACIS_OPENAI_MODEL` | No | `gpt-4.1-mini` | Model identifier. Defaults to `gpt-4.1-mini`; update for newer models. |

### 3.5 Anthropic Claude Configuration

For **Path B (Freeform)** when user selects Claude provider:

| Variable | Required | Example | Description |
|---|---|---|---|
| `FACIS_ANTHROPIC_API_KEY` | Yes (if Claude enabled) | `sk-ant-abc123...` | Anthropic API key. Store in Kubernetes Secret. |
| `FACIS_ANTHROPIC_MODEL` | No | `claude-sonnet-4-20250514` | Model identifier. Update to match available Anthropic models. |

### 3.6 Custom LLM Configuration (Optional)

For self-hosted or alternative LLM endpoints:

| Variable | Required | Example | Description |
|---|---|---|---|
| `FACIS_CUSTOM_LLM_URL` | No | `http://custom-llm:5000/v1/chat/completions` | Custom LLM endpoint. If empty, custom provider is disabled. |
| `FACIS_CUSTOM_LLM_KEY` | No | `bearer-token-xxx` | Custom LLM API key or bearer token. |

---

## 4. Nginx Proxy Configuration (Dockerfile)

The `Dockerfile` embeds an Nginx configuration that handles SPA routing and proxies to backend services.

### 4.1 Embedded Nginx Config

The Dockerfile writes the following configuration to `/etc/nginx/nginx.conf`:

```nginx
server {
    listen 8080;
    root /usr/share/nginx/html;

    # SPA routing: fallback all unknown paths to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets (JS, CSS, images) for 1 year
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Proxy to Simulation service
    location /api/sim/ {
        proxy_pass http://facis-simulation.facis.svc.cluster.local:8080/api/v1/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Proxy to AI Insight service
    location /api/ai/ {
        proxy_pass http://facis-ai-insight.facis.svc.cluster.local:8080/api/v1/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 4.2 Proxy Targets

| Path | Target | Purpose | When Used |
|---|---|---|---|
| `/api/sim/` | `facis-simulation:8080/api/v1/` | Simulation service API | Smart city / energy simulation queries (optional, for demo) |
| `/api/ai/` | `facis-ai-insight:8080/api/v1/` | AI Insight Service | Tab 1 proxy calls (if calling via browser instead of ORCE) |

Note: In the current architecture, **Tab 1 and Tab 3 call backend services directly from ORCE**, not through the Nginx proxy. These proxies are available for alternative architectures or for enabling browser-direct calls.

---

## 5. LLM Provider Configuration

The **Tab 2 (LLM Router)** flow uses `msg.selectedProvider` to route requests to the correct LLM endpoint.

### 5.1 Provider Routing

The frontend selector (`selectedLLM` in `ui/src/index.js`) offers three providers:

```javascript
llmProviders: [
    { id: 'openai', label: 'OpenAI GPT-4.1' },
    { id: 'claude', label: 'Claude Sonnet' },
    { id: 'custom', label: 'Custom LLM' }
]
```

### 5.2 OpenAI Route

```javascript
// Tab 2: LLM Router switch node
if (msg.selectedProvider === 'openai') {
    msg.url = 'https://api.openai.com/v1/chat/completions';
    msg.headers = {
        'Authorization': 'Bearer ' + process.env.FACIS_OPENAI_API_KEY,
        'Content-Type': 'application/json'
    };
    msg.payload = {
        model: process.env.FACIS_OPENAI_MODEL || 'gpt-4.1-mini',
        messages: [{role: 'system', content: '...'}, {role: 'user', content: msg.userQuestion}],
        temperature: 0.7
    };
}
```

Response schema: `{ choices: [{ message: { content: "..." } }] }`

### 5.3 Anthropic Claude Route

```javascript
if (msg.selectedProvider === 'claude') {
    msg.url = 'https://api.anthropic.com/v1/messages';
    msg.headers = {
        'x-api-key': process.env.FACIS_ANTHROPIC_API_KEY,
        'Content-Type': 'application/json'
    };
    msg.payload = {
        model: process.env.FACIS_ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        messages: [{role: 'user', content: msg.userQuestion}],
        max_tokens: 1024,
        system: '...'
    };
}
```

Response schema: `{ content: [{ type: 'text', text: "..." }] }`

### 5.4 Custom LLM Route

```javascript
if (msg.selectedProvider === 'custom' && process.env.FACIS_CUSTOM_LLM_URL) {
    msg.url = process.env.FACIS_CUSTOM_LLM_URL;
    msg.headers = {
        'Authorization': 'Bearer ' + process.env.FACIS_CUSTOM_LLM_KEY,
        'Content-Type': 'application/json'
    };
    msg.payload = {
        model: 'custom',
        messages: [...],
        temperature: 0.7
    };
}
```

Assumes OpenAI-compatible response schema.

### 5.5 Behavior When API Key Is Missing

If a user selects a provider but the API key is not set, **Tab 2** returns an error:

```json
{
    "topic": "error",
    "content": "OpenAI API key not configured. Contact administrator."
}
```

The frontend displays this as an error toast.

---

## 6. Keycloak Integration

### 6.1 Browser Authentication (PKCE)

The Vue SPA uses Keycloak's JavaScript adapter with PKCE (Proof Key for Code Exchange):

1. **On load:** `keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256' })`
2. **User redirected** to Keycloak login form
3. **PKCE exchange:** Authorization code is traded for access token using a cryptographic proof
4. **Token stored** in browser memory (not localStorage for security)
5. **Token refreshed:** Every 60 seconds, if <70 seconds until expiry
6. **Vue app mounted** only after successful authentication

**Keycloak client configuration (must be set in Keycloak admin console):**
- Client ID: `facis-ai-insight` (or `VITE_KEYCLOAK_CLIENT_ID`)
- Client Authentication: **OFF** (public client)
- Valid Redirect URIs: `http://localhost:1880/uibuilder/ai-insight/`, `https://facis.cloud/ai-insight/`, etc.
- Web Origins: Same as above
- Standard Flow: ENABLED
- PKCE Code Challenge Method: `S256`

### 6.2 Backend OIDC (Password Grant)

**Tab 3 (Trino Query)** uses Keycloak's password grant to acquire service-account tokens:

```bash
curl -X POST $FACIS_KEYCLOAK_URL \
  -d "client_id=$FACIS_OIDC_CLIENT_ID" \
  -d "client_secret=$FACIS_OIDC_CLIENT_SECRET" \
  -d "grant_type=password" \
  -d "username=$FACIS_OIDC_USERNAME" \
  -d "password=$FACIS_OIDC_PASSWORD"
```

Response:

```json
{
    "access_token": "eyJhbGciOiJSUzI1NiIs...",
    "token_type": "Bearer",
    "expires_in": 300
}
```

**Keycloak client configuration (for service account):**
- Client ID: `trino` (or `FACIS_OIDC_CLIENT_ID`)
- Client Authentication: **ON** (confidential client)
- Service Account Enabled: **ON**
- Valid Scopes: At minimum, the default scope
- Credentials: Store the client secret in Kubernetes Secret

---

## 7. Helm Chart Configuration

The Helm chart (`helm/facis-ai-insight-ui/`) uses a `values.yaml` file to configure all three layers.

### 7.1 Key Helm Values

| Value Path | Default | Description |
|---|---|---|
| `orce.deploymentName` | `orce` | Name of the ORCE Deployment in the namespace |
| `orce.serviceName` | `orce` | Name of the ORCE Service |
| `orce.port` | `1880` | ORCE Node-RED admin API port |
| `flows.configMapName` | `ai-insight-ui-flows` | ConfigMap name for flows JSON |
| `flows.filePath` | `files/flows.full.json` | Path to flows in chart (or inline) |
| `uiFiles.configMapName` | `ai-insight-ui-files` | ConfigMap name for UI assets |
| `uiFiles.dirPath` | `files/ui` | Directory in chart containing built UI (from build script) |
| `llmSecret.create` | `true` | Whether to create the LLM secrets |
| `llmSecret.name` | `orce-llm-secrets` | Secret name for API keys |
| `llmSecret.openaiApiKey` | — | OpenAI API key (set via --set) |
| `llmSecret.anthropicApiKey` | — | Anthropic API key (set via --set) |
| `llm.openaiModel` | `gpt-4.1-mini` | OpenAI model identifier |
| `llm.anthropicModel` | `claude-sonnet-4-20250514` | Anthropic model identifier |
| `llm.customLlmUrl` | — | Custom LLM endpoint (leave empty to disable) |
| `aiInsight.serviceUrl` | `http://ai-insight-service:8080` | AI Insight Service URL (cluster-internal) |
| `keycloak.enabled` | `false` | Enable Keycloak integration |
| `keycloak.realmUrl` | — | Keycloak realm URL (if enabled) |
| `keycloak.clientId` | `facis-ai-insight` | OIDC client ID |
| `trino.host` | `trino.stackable.svc.cluster.local` | Trino coordinator hostname |
| `trino.port` | `8080` | Trino port (8443 for HTTPS Stackable) |
| `trino.catalog` | `iceberg` | Trino catalog |
| `trino.schema` | `facis` | Trino schema |

### 7.2 Deployment Command

```bash
helm upgrade facis-ai-insight-ui ./helm/facis-ai-insight-ui \
  -n facis \
  --create-namespace \
  -f ./helm/facis-ai-insight-ui/values.yaml \
  --set llmSecret.openaiApiKey=sk-... \
  --set llmSecret.anthropicApiKey=sk-ant-... \
  --set keycloak.enabled=true \
  --set keycloak.realmUrl=https://identity.facis.cloud/realms/facis
```

### 7.3 ConfigMaps Created

The chart creates two ConfigMaps:

1. **`ai-insight-ui-flows`** — Contains `flows.full.json`. Mounted into ORCE pod at `/data/flows/ai-insight-ui-flows.json` (see ORCE Deployment spec).
2. **`ai-insight-ui-files`** — Contains built UI assets (`index.html`, `index.css`, `assets/**`). Mounted into ORCE pod at `/data/uibuilder/ai-insight/src/`.

The Secret **`orce-llm-secrets`** contains:
- `openai-api-key`
- `anthropic-api-key`
- `custom-llm-key` (optional)

These are injected as environment variables into the ORCE Deployment.

---

## 8. Secure Configuration Recommendations

### 8.1 Secrets Management

- **Store API keys in Kubernetes Secrets**, never in ConfigMaps.
  ```bash
  kubectl create secret generic orce-llm-secrets \
    --from-literal=openai-api-key=sk-... \
    --from-literal=anthropic-api-key=sk-ant-... \
    -n facis
  ```

- **Use External Secrets Operator** for enterprise secret management (HashiCorp Vault, AWS Secrets Manager, etc.)

### 8.2 Transport Security

- **HTTPS for all external APIs:** Set `FACIS_KEYCLOAK_URL` and custom LLM endpoints to `https://` URLs.
- **HTTPS for Trino in production:** Set `FACIS_TRINO_HTTP_SCHEME=https` and `FACIS_TRINO_PORT=8443`.
- **SSL certificate verification:** Ensure `FACIS_TRINO_VERIFY_SSL=true` or point to a CA bundle.

### 8.3 OIDC Credentials

- **Use service accounts for backend OIDC flows** (Tab 3), not user credentials.
- **Rotate OIDC client secrets regularly** (at least every 90 days).
- **Never log** password grant credentials; if logging is necessary, redact the password field.

### 8.4 LLM API Keys

- **Rotate API keys** when employees leave or on a schedule (quarterly recommended).
- **Use API key scoping** (OpenAI, Anthropic support role-based key restrictions).
- **Monitor API key usage** for anomalies (rate limits, unusual models being called).

### 8.5 Audit and Compliance

- **Enable audit logging** on the ORCE Deployment for flow modifications.
- **Log all LLM API calls** (request/response pairs) for compliance; **redact sensitive user data** if required by GDPR/similar regulations.
- **Review Keycloak logs** for failed authentication attempts.

---

## 9. Reference Files

- `ui/app/.env.example` — Template for Vite build variables
- `ui/app/vite.config.ts` — Vite build config (references VITE_* variables)
- `ui/src/index.js` — Keycloak initialization and Vue app
- `helm/facis-ai-insight-ui/values.yaml` — Helm defaults
- `helm/facis-ai-insight-ui/templates/secret.yaml` — Secret template
- `helm/facis-ai-insight-ui/templates/configmap-flows.yaml` — Flows ConfigMap template
- `helm/facis-ai-insight-ui/templates/configmap-ui.yaml` — UI ConfigMap template
- `Dockerfile` — Embedded Nginx config with proxy rules

---

© ATLAS IoT Lab GmbH — FACIS FAP IoT & AI Demonstrator
Licensed under Apache License 2.0
