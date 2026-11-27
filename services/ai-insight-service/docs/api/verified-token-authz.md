# Verified-Token Authorization (NF-6)

Closure of QA follow-up **NF-6** ("the policy layer reads agreement ID, asset
ID and roles from client-supplied request headers"): identity now derives
exclusively from a **cryptographically verified Keycloak access token**.
Client-supplied `x-user-roles` headers are never consulted.

## Model

```
caller ── Authorization: Bearer <JWT> ──▶ ai-insight endpoint (ORCE)
                                             │ link call
                                             ▼
                                   ai-insight-auth (shared verifier)
                                   • Bearer extract, issuer check
                                   • JWKS fetch (Keycloak /certs, cached)
                                   • jose.jwtVerify: signature, exp, iss
                                   • identity = { sub, roles: <roles claim> }  
                                             │
                                             ▼
                                   PolicyAndRateLimit
                                   • roles ← verified identity (never headers)
                                   • agreement/asset = request scope (headers),
                                     checked against allow-lists
                                   • rate limit keyed by sub|agreement
```

- **401 + `WWW-Authenticate: Bearer`** — missing, malformed, expired, wrong
  issuer, or wrongly signed token (authentication). Expired tokens return
  **401**, per QA requirement-set item on test 7.
- **403** — verified caller with none of the required roles (default
  `administrator`, `data_scientist`, `data_analyst`), or agreement/asset outside the allow-lists (authorization).
- **429 + `Retry-After`** — per-subject-per-agreement window exceeded. The
  bucket key is the **verified `sub`**, so a spoofed `x-agreement-id` can no
  longer evade or pollute another caller's window.
- **503** — JWKS endpoint unreachable (fail closed; requests are never
  admitted unverified).

Guarded endpoints: the three insight POSTs, plus `GET /api/v1/insights/latest`
and `GET /api/ai/outputs/{output_id}` (previously unauthenticated).

## Configuration (ORCE pod env)

| Env var | Default | Purpose |
|---|---|---|
| `AI_INSIGHT_AUTH__MODE` | `verified` | the only mode: `off` (the former header-trust mode) fails closed with `401 mode_removed` |
| `AI_INSIGHT_AUTH__ISSUER` | **required** | Expected `iss`: the guard's `<publicUrl>/` (or another issuer, such as a Keycloak realm URL) |
| `AI_INSIGHT_AUTH__JWKS_URL` | **required** | Key material: the guard's `<publicUrl>/.well-known/jwks.json` (a Keycloak realm's is `<realm URL>/protocol/openid-connect/certs`). Without the issuer or the JWKS URL every call answers 503 |
| `AI_INSIGHT_AUTH__AUDIENCE` | unset (local only) | `aud` check. **Required outside local dev**: without it, any access token of the issuer is accepted regardless of the client it was minted for (cross-client replay). Set it to the AI Insight client id (with a Keycloak issuer, through an audience mapper) |
| `AI_INSIGHT_AUTH__JWKS_TTL_SECONDS` | `300` | JWKS cache TTL |
| `AI_INSIGHT_AUTH__ROLES_CLAIM` | `roles` | Dot path of the roles claim in the verified token: `roles` for the guard's tokens; `realm_access.roles` for a Keycloak issuer |
| `AI_INSIGHT_POLICY__REQUIRED_ROLES` | `["administrator","data_scientist","data_analyst"]` | At least one of these roles is required (the AI Insight roles of the credential schemas) |

Deploy prerequisite: legitimate consumers (dashboards, service accounts) must
present a token of the configured issuer whose roles claim includes one of the
required roles — with Keycloak, assign the realm role to the relevant
clients/service accounts; with the guard, the role comes from the role credential. The old `x-user-roles` header is ignored; the
`x-agreement-id` / `x-asset-id` headers remain as **request scope** only.

**Upgrading from the Keycloak defaults.** Until this change the issuer and the JWKS URL defaulted to the Keycloak realm (`FACIS_KEYCLOAK_URL` and its `/protocol/openid-connect/certs`), the roles claim to `realm_access.roles` and the required role to `ai_insight_consumer`. Before deploying, set `AI_INSIGHT_AUTH__ISSUER` and `AI_INSIGHT_AUTH__JWKS_URL`: with the guard, its issuer and JWKS (and keep the default roles claim); to stay on a Keycloak realm for now, its URL and certs, plus `AI_INSIGHT_AUTH__ROLES_CLAIM=realm_access.roles`.

**Upgrading from the former default role.** Until this change the default required role was `ai_insight_consumer`, a realm role. Before deploying, give the users and service accounts one of `administrator`, `data_scientist` or `data_analyst` at the token issuer (with Keycloak: create the realm roles and assign them), or keep the former behaviour for now with `AI_INSIGHT_POLICY__REQUIRED_ROLES='["ai_insight_consumer"]'` on the ORCE pod. Otherwise every insight request answers 403.

## Live-session evidence (QA tests 14 / 15 / 29)

```bash
BASE=https://<orce-host>
BODY='{"start_ts":"2026-07-01T00:00:00Z","end_ts":"2026-07-02T00:00:00Z"}'

# 1. Header-injection attempt (test 29, NF-6 demonstration):
#    forged roles, no token -> 401 + WWW-Authenticate, no data returned.
curl -si -X POST "$BASE/api/v1/insights/anomaly-report" \
  -H 'Content-Type: application/json' \
  -H 'x-agreement-id: agreement-1' -H 'x-asset-id: asset-7' \
  -H 'x-user-roles: administrator' \
  -d "$BODY" | head -5

# 2. Header injection WITH a valid token lacking the role -> 403
#    (proves the forged header is ignored even for authenticated callers).
TOKEN_NOROLE=$(curl -s "$KC/protocol/openid-connect/token" -d 'grant_type=password' \
  -d "client_id=$CID" -d "client_secret=$CSEC" -d "username=$USER_NO_ROLE" \
  -d "password=$PASS" | jq -r .access_token)
curl -si -X POST "$BASE/api/v1/insights/anomaly-report" \
  -H "Authorization: Bearer $TOKEN_NOROLE" \
  -H 'Content-Type: application/json' \
  -H 'x-agreement-id: agreement-1' -H 'x-asset-id: asset-7' \
  -H 'x-user-roles: data_analyst' \
  -d "$BODY" | head -5

# 3. Authorized retrieval (tests 14/15): token whose roles claim includes
#    one of the required roles -> 200 with insight data.
curl -si -X POST "$BASE/api/v1/insights/anomaly-report" \
  -H "Authorization: Bearer $TOKEN_CONSUMER" \
  -H 'Content-Type: application/json' \
  -H 'x-agreement-id: agreement-1' -H 'x-asset-id: asset-7' \
  -d "$BODY" | head -5

# 4. Expired token -> 401 token_expired (test 7 semantics).
curl -si "$BASE/api/v1/insights/latest" -H "Authorization: Bearer $EXPIRED" | head -5

# 5. Previously-open GET endpoints now refuse anonymous access.
curl -si "$BASE/api/v1/insights/latest" | head -3
curl -si "$BASE/api/ai/outputs/some-id" | head -3
```

## CI evidence

`services/ai-insight-service/orce/tests/flows/auth.spec.js` (token
verification with real RS256-signed JWTs: valid, expired, forged signature,
wrong issuer, unknown kid, malformed) and `policy-rate-limit.spec.js`
(header-injection rejection, 401 pass-through, allow-lists, subject-keyed
rate limiting). Flow-JSON guards pin the wiring: every data endpoint calls
the shared verifier, and the policy nodes read roles only from
`msg.identity`.

Run: `npm run test:flows` in `services/ai-insight-service/orce`.
