# Guard: wallet login for the web applications

The guard is the OAuth2 / OpenID Connect authorization server of the FAP IoT & AI web
applications. A user logs in by presenting a role credential from a wallet (OID4VP); the W-Stack
credential verifier checks the presentation, the policy engine decides, and the guard issues
short-lived tokens with the verified claims. See
[the target architecture](../../docs/architecture/icam-target-architecture.md), §4 and §5.

| Part | What it is | Where |
|---|---|---|
| Authorization server | Ory Hydra v26.2.0 and its PostgreSQL: OAuth2 endpoints, token signing, JWKS | `helm/facis-guard` |
| Login and consent provider | ORCE flow: login page, presentation request, checks, login decision, consent | `orce/flows/facis-guard-login.json` |
| Policy engine | OPA serving `infrastructure/opa/bundle` (package `facis.login`) plus the deployment data | `helm/facis-guard` |
| Local test setup | Stub verifier, edge proxy, install script, end-to-end check | `local/` |

## How a login works

1. The application sends the browser to the authorization server (`/oauth2/auth`, code + PKCE),
   which sends it to the login provider (`/guard/login?login_challenge=...`).
2. The login provider checks that the application is a first-party client, asks the verifier for
   a presentation request and shows it: a QR code for a mobile wallet, a link for a wallet on the
   same device, and a button per configured web wallet. The attempt is single use and expires
   after 5 minutes.
3. The page polls `/guard/login/status`. The login provider reads the presentation the verifier
   stored for this request, never what the wallet answered, and checks:
   - the record is verified and belongs to this request, and answers its DCQL query only;
   - the nonce and the audience are this request's;
   - holder binding: the credential subject is the presenter. For an SD-JWT VC (`dc+sd-jwt`, the
     format of the role credential) the holder is the key the issuer bound in the credential
     (`cnf.jwk`, as `did:jwk`), and the key-binding JWT must carry this request's nonce and
     audience, cover exactly the presented disclosures (`sd_hash`) and be signed by that key; the
     claims come only from disclosures the issuer committed to. JSON (`ldp_vp`) and JWT
     presentations are read too;
   - the credential is valid now, and its status list (on an allowed origin) shows it is not
     revoked.
4. The policy engine decides (`facis.login`): the issuer is trusted and vouches for the
   organisation, and a disclosed role is allowed for the application.
5. The login is accepted with the holder DID as subject. Consent is given without a page for the
   first-party applications: `org_did`, `roles` and `purpose` go into the access token and the ID
   token, `name` and `email` into the ID token only. Tokens live 5 minutes; no refresh token.

Refusals caused by the presentation count as failures: five within 15 minutes lock the client
address and the holder out for 15 minutes. Failures of the platform (verifier, status list or
policy engine unavailable) do not count. `GET /guard/admin/lockouts` lists the lockouts and
`DELETE /guard/admin/lockouts?key=...` lifts one (bearer admin token, inside the cluster only).
Every decision is logged as a JSON line without credential content.

## Verifier releases

The verifier routes are the same in the W-Stack releases 1.2.x and 1.3.x; only the body that
creates a presentation request differs. `loginProvider.verifier.api` selects it:

| `api` | Verifier | Create request body |
|---|---|---|
| `cvs-1.3` (default) | 1.3.x | `{permissionSet, ttl}`; the client id comes from the tenant's verifier profile |
| `cvs-1.2` | 1.2.x | `{presentationPolicyId, clientId, ttl}` |

## Deploy

1. **Policy bundle.** Write the deployment data (trusted issuers, the organisations each one may
   vouch for, the roles per application) as `facis/login_config/data.json` in a directory of your
   own (format in [the bundle README](../../infrastructure/opa/README.md#deployment-data)), then:
   ```bash
   opa build infrastructure/opa/bundle <deployment-data-dir> -o bundle.tar.gz
   kubectl -n <ns> create configmap facis-policy-bundle --from-file=bundle.tar.gz
   ```
2. **Secrets.** Either let the chart render them from values (`hydra.systemSecret`,
   `postgres.password`, `loginProvider.adminToken`), or create them and name them in
   `existingSecrets` (keys in `values.yaml`).
3. **Install.** Sync the flow into the chart, then install with your values:
   ```bash
   services/guard/helm/facis-guard/sync-flows.sh
   helm upgrade --install guard services/guard/helm/facis-guard -n <ns> -f <your-values.yaml>
   ```
   Required values: `publicUrl` (https), `clients`, `loginProvider.verifier.*`,
   `loginProvider.statusListOrigins`; `helm template` names any that is missing.
4. **Applications.** Each application is a public OAuth2 client (`clients`), uses code + PKCE
   against `publicUrl`, and checks tokens against `<publicUrl>/.well-known/jwks.json`. For AI
   Insight: `AI_INSIGHT_AUTH__ISSUER=<publicUrl>/`, `AI_INSIGHT_AUTH__JWKS_URL=<publicUrl>/.well-known/jwks.json`,
   `AI_INSIGHT_AUTH__ROLES_CLAIM=roles`, `AI_INSIGHT_AUTH__AUDIENCE` = the client's audience.

The ingress routes only `/oauth2/`, `/.well-known/`, `/userinfo` and the login pages. The
authorization server's admin API, the lockout endpoints and the policy engine stay inside the
cluster, and network policies restrict who reaches them.

Attempts and lockouts are held in the login provider's memory: one replica, and a restart ends
the logins in progress.

## Change the login provider

The login provider's code lives in `orce/src/`, one file per function node (`<node id>.js`);
`orce/build-flow.py` holds the wiring (nodes, routes, outputs) and builds the flow ORCE loads
(`orce/flows/facis-guard-login.json`) and the chart's copy. Edit `src/` or the wiring, never the
JSON, then:
```bash
python3 services/guard/orce/build-flow.py            # rebuilds the flow and the chart's copy
(cd services/guard/orce/tests && npm test)           # includes a check that the flow matches src/
```
Commit the sources and both JSON files together; CI runs `build-flow.py --check`. A new function
node needs its `src/<id>.js` and a `fn(...)` line in `build-flow.py`. `src/guard-config.js`
reads the `GUARD_*` settings; `src/guard-brand.js` holds the pages' look (the FACIS logo is
embedded from the UI's `facis-logo.svg` at build time).

## Test

**Flow tests** (Node.js 20+, no install needed):
```bash
cd services/guard/orce/tests && npm test
```
They run the real function-node code of the flow JSON (with the DSP connector's
`run-node.js`), the HTTP replies being played by the tests, and check that the flow matches
`orce/src/`.

**Policy tests:** `opa test infrastructure/opa/bundle` and `infrastructure/opa/check-fixtures.sh`.

**Local setup, step by step** (prerequisites, the browser login with the AI Insight UI, the real
W-Stack, restarting after a reboot): [`local/README.md`](local/README.md).

**End to end on a local cluster** (kind, k3d, minikube; needs kubectl, helm, opa, openssl, curl,
jq). The local setup installs the chart in namespace `guard-local` with a stub verifier, which
plays the wallet's side and the issuer's status list, and an edge proxy on
`http://localhost:8444`:
```bash
services/guard/local/up.sh      # install (dev mode), port-forward localhost:8444
services/guard/local/e2e.sh     # the end-to-end check
services/guard/local/down.sh    # remove everything
```
`e2e.sh` runs real OAuth2 logins through Hydra and the login provider and checks: a valid
presentation gives a JWT that verifies against the JWKS, with the expected issuer, audience,
subject, claims and lifetime, and no refresh token; revoked credential, untrusted issuer, role not
allowed for the application, wrong nonce and another holder's credential are refused; five
refusals lock the address out and an administrator lifts it; the admin APIs are not routed.
`e2e.sh --token <role>` prints one access token, for testing an application locally.

To log in to an application from a browser against the local guard (for example the AI Insight
UI on its Vite dev server, `http://localhost:3000/orce/aiInsight/`, which `values-local.yaml`
registers), open the application: the guard's login page appears and waits; then run
`services/guard/local/present.sh <role>` to present a test role credential in place of a wallet.

The stub verifier signs and verifies nothing: the end-to-end check proves the guard's own logic
and wiring, not the W-Stack. The same scripts run against a real verifier and a wallet:

| Setting | For |
|---|---|
| `EXTRA_VALUES=<file>` (up.sh) | values pointing `loginProvider.verifier.*` and `loginProvider.statusListOrigins` at the real verifier and issuer; `loginProvider.caBundle` when they use a private CA |
| `POLICY_DATA=<dir>` (up.sh) | deployment data trusting the real issuer and its organisations |
| `PRESENT_CMD=<command>` (e2e.sh) | presents through the wallet: called with the `openid4vp://` link and the case (roles, revoked...); exits 3 for a case the wallet cannot play, which is then skipped |
| `E2E_ISSUER`, `E2E_ORG`, `E2E_HOLDER` (e2e.sh) | the real credential's issuer, organisation and holder |

### Against a real W-Stack (level 2)

The guard runs in its own cluster (the FAP deployment), the W-Stack in another (the federation
trust services), and `test-wallet.js` holds a key of its own, receives an SD-JWT VC from the
W-Stack issuer (OID4VCI) and presents it to the W-Stack verifier (OID4VP, DCQL, key binding).
`services/guard/local/wstack/` prepares both sides; every script takes its cluster, hosts and
addresses as settings.

```bash
wstack/connect-clusters.sh       # the guard cluster's node joins the W-Stack's network
wstack/wstack-local-fixes.sh     # verifier and SD-JWT service releases, CA trust (see below)
wstack/public-routes.sh          # nonce, credential and status list routes on 443 for the tenant
wstack/expose-verifier.sh        # the verifier's internal API, for the guard's node only
wstack/verifier-profile.sh       # the guard's permission set: one SD-JWT VC with org and roles
wstack/level2-config.sh <dir>    # the guard's values, policy data and CA for that W-Stack
EXTRA_VALUES=<dir>/values.yaml POLICY_DATA=<dir>/policy-data up.sh
PRESENT_CMD=wstack/wallet-present.sh E2E_ISSUER=... E2E_ORG=... E2E_HOLDER="$(node test-wallet.js holder)" e2e.sh
```

`wallet-present.sh` has the W-Stack issue a credential with the roles a case needs
(`wstack/issue.sh`) before presenting. The wallet cannot play a revoked credential or an untrusted
issuer; those cases, and so the lockout, are skipped.

What the W-Stack needs for this, found by running it (each a local deviation from the pinned
baseline, applied by `wstack-local-fixes.sh` and `public-routes.sh`):

- the credential verifier at 1.3.17-alpha or later: earlier releases never match a disclosed
  SD-JWT against the DCQL query;
- the SD-JWT service at 1.2.14 or later (1.2.13 always reports the key binding missing). The
  guard checks the key binding itself in any case: its signature by the key the credential binds,
  its `sd_hash`, nonce and audience;
- the SD-JWT service told to trust the CA bundle mounted for it (`NODE_EXTRA_CA_CERTS`);
- routes for the nonce and credential endpoints the issuer advertises, and for reading status
  lists, which the tenant gateway lacks;
- the guard asks status lists for one media type (`loginProvider.statusListAccept`): the W-Stack
  answers several with an empty body, and its token status list (`statuslist+jwt`) carries the
  bits in the W3C order rather than the order that format defines, so its own list type is read.
