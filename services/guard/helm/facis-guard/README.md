# facis-guard chart

Installs the guard: Ory Hydra and its PostgreSQL, the login provider (ORCE with the flow of
`services/guard/orce/flows`, copied here by `sync-flows.sh`), the policy engine (OPA), the client
registration Job, the ingress and the network policies. What the guard does, how to deploy it and
how to test it: [`services/guard/README.md`](../../README.md).

| Resource | Purpose |
|---|---|
| `<release>-hydra` (Deployment, ConfigMap) | Authorization server; schema migrations run before each start |
| `<release>-hydra-public` / `-hydra-admin` (Services) | Public OAuth2 endpoints (ingress) / admin API (login provider and Job only) |
| `<release>-postgres` (StatefulSet, Service) | Hydra's database (`postgres.enabled=false` for an external one) |
| `<release>-login` (Deployment, Service, ConfigMaps) | Login provider. The flow file is written from the release at every start; ORCE's editor and admin API are off |
| `<release>-policy` (Deployment, Service) | OPA serving the bundle ConfigMap `policyEngine.bundleConfigMap` |
| `<release>-clients` (Job, hook) | Creates or updates the OAuth2 clients of `clients` |
| `<release>` (Ingress) | `/oauth2/`, `/.well-known/`, `/userinfo`, `/guard/login`, `/guard/login/status`, `/guard/consent`, `/guard/logout`, `/guard/error` |

All values are described in `values.yaml`. Images are pinned by digest.
