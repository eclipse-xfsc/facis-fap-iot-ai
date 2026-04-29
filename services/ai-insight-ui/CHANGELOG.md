# AI Insight UI — Changelog

## [ORCE-native] — 2026-04-29

### Migrated
- Vue 3 SPA now served by `node-red-contrib-uibuilder` inside the existing
  ORCE pod at `https://fap-iotai.facis.cloud/aiInsight/`. No standalone
  Deployment/Service/Nginx sidecar.
- Bundle delivery: gzipped tarball in `ConfigMap/ai-insight-ui-bundle`
  (`binaryData`), extracted by a new `init-ai-ui` initContainer onto the
  persistent volume. Idempotent via sha256 marker.

### Added
- 6 ORCE-native backend flows under `services/ai-insight-ui/orce/flows/`:
  - `alerts.json`            → `GET /api/v1/alerts` (catch-ring buffer of runtime errors)
  - `data-sources.json`      → `GET /api/v1/data-sources` (synthesised from `global.latest_*`)
  - `provenance.json`        → `GET /api/v1/provenance/{transfers,insights}`
  - `integrations.json`      → `GET /api/v1/integrations/health` (parallel probes to ORCE / AI Insight / Trino / NiFi / Kafka)
  - `schemas.json`           → `GET /api/v1/schemas[/:catalog/:schema/:table]` (Trino information_schema, regex-validated identifiers)
  - `admin.json`             → `GET /api/v1/admin/{users,roles,access}` (Keycloak Admin API proxy, JWT-gated, requires `admin` realm role)
- `infrastructure/orce/init-ai-ui-patch.yaml` — strategic-merge patch wiring the bundle-extraction initContainer.
- `infrastructure/ingress/facis-ingress-dynamicsrc-rewrite.yaml` — separate
  Ingress that rewrites `/orce/dynamicsrc/(.*)` to `/dynamicsrc/$1` so
  the editor theme's hardcoded `dynamicsrc/...` URLs resolve.
- `infrastructure/keycloak/configure-ai-insight-client.sh` — idempotent
  redirect-URI / web-origin setup for the `facis-ai-insight` client.
- `services/ai-insight-ui/docs/deployment/orce-native-runbook.md` —
  operator runbook for this deployment model.

### Changed
- `src/services/api.ts` rewritten: 14 client functions now adapt the simulation
  REST flow's raw shapes (flat arrays, single-object snapshots, missing
  `/:id/current` endpoints) into the wrapped `{meters, count}` /
  `{stations, count}` / etc. catalog shapes the views expect.
- `src/auth.ts` — preserves the deep-link path through the Keycloak round-trip
  and uses a redirect URI inside the registered allow-list on logout.
- `src/router/index.ts` — uses `createWebHistory(import.meta.env.BASE_URL)`
  so deep links work under `/aiInsight/`.
- `vite.config.ts` — `base: process.env.BASE_PATH || '/aiInsight/'`.
- `src/stores/notifications.ts` — alerts now load from `/api/v1/alerts`
  on first access. Removed the 5 hardcoded `INITIAL_ALERTS` (alert-001..005).
- `src/views/admin/AdminUsersView.vue`, `AdminRolesView.vue` — replaced
  the hardcoded `BASE_USERS` / `ROLE_USER_COUNTS` with `getAdminUsers()` /
  `getAdminRoles()` against the Keycloak proxy.
- `src/views/data-sources/AllSourcesView.vue` — single call to
  `/api/v1/data-sources` instead of 4-way synthesis.
- `src/views/analytics/AnalyticsOverviewView.vue` — rewritten as 3 LLM-
  narrated insight cards (energy / anomaly / city) + recent alerts panel.

### Removed
- Smart City use case (8 view files) — simulation engine emits no
  streetlight / traffic / event feeds.
- 4 dead Analytics sub-tabs (Trends / Correlations / Anomalies /
  Recommendations) — all required `/history` endpoints that don't exist.
- `EnergyInsightsView` — same reason.
- Top-level `Data Products` section (5 view files) — no
  `/api/v1/data-products` backend.
- "Recent Data Products" section on the Dashboard.
- "Related Data Products" card on Alert Detail.
- 5 hardcoded `INITIAL_ALERTS` in the notifications store.
- 80 stale `*.vue.js` / `*.ts.js` compilation siblings shadowing the
  canonical `.ts` sources at build time.

### Fixed
- **`Access Denied: User test cannot impersonate user trino`** —
  `AI_INSIGHT_TRINO__USER` was `trino` while the OIDC subject was `test`;
  Trino requires they match. Patched the secret to
  `AI_INSIGHT_TRINO__USER=test`. AI Insight LLM-narrated responses now
  flow with real Trino rows.
- **"Demo Admin" user appearing post-login** — caused by the build picking
  up a stale `vite.config.js` shadowing the canonical `.ts` and bundling
  an older `LoginView` with a "Continue as Demo" button. Removed the
  legacy `.js`, set the absolute `base: '/aiInsight/'`, dropped the
  `LoginView` route entirely (Keycloak's `onLoad: 'login-required'`
  handles the login step).
- **Editor toolbar showed broken-image placeholders** for Delete / Disable /
  Setting / error-badge icons + the editor used a fallback font instead of
  Manrope/Poppins. Two root causes: the colleague's `guided-style.css` had
  the `@font-face` block commented out, and the colleague's customised
  `red.min.js` references images via relative paths that resolve to
  `/orce/dynamicsrc/...` (which 404s — it's served at `/dynamicsrc/...`).
  Fixed by uncommenting the @font-face block, patching the writable
  `guided-script.js` to use absolute URLs, and adding the
  `/orce/dynamicsrc` rewrite Ingress for the read-only `red.min.js`.
- **Editor "URL already in use" false positive** — was a stale browser
  session after several flow API POSTs. Hard-reload clears it; only one
  uibuilder node ever existed in the deployed flow set.
- **Phase-5 flow function-node sandbox lacks `fetch` / `URLSearchParams`
  / `AbortController`** — added a `httpsFetch` shim using Node stdlib
  `https`/`http`/`url` modules via the `libs:` field on each function node.

### Security
- `/api/v1/admin/*` is now JWT-authenticated. The flow verifies the
  caller's token via Keycloak `/userinfo` and requires `admin` in
  `realm_access.roles`. Without this, the user-list endpoint was
  publicly reachable.
- `/api/v1/schemas/:catalog/:schema/:table` rejects identifiers that
  don't match `^[A-Za-z0-9_.-]{1,64}$` to prevent SQL injection.
- `rejectUnauthorized: false` is documented as a known compromise on
  Keycloak/Trino calls (Alpine image lacks the LE / Stackable CA chains).
- Error responses no longer leak `String(e.message)` into payloads;
  detailed errors go to `node.warn`, the user-facing payload says only
  "Trino query failed" / "Keycloak admin call failed".

### Known limitations
- Simulation REST flow has no `/history` or `/forecast` endpoints; views
  that depended on them were trimmed.
- No smart-city feeds in the simulation; whole section deleted from the UI.
- NiFi Lakehouse Ingestion is paused awaiting the Trino JDBC driver on
  the Stackable cluster.
