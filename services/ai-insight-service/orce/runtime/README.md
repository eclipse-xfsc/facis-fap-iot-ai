# Runtime bundle for image-ready execution

This directory allows you to bake runtime configuration into the ORCE image so you can start it with a plain `docker run`.

## Files expected

- `.env`: runtime environment variables consumed by Node-RED flows.
- `certs/`: certificate files required by integrations (for example Trino/OIDC).

## Recommended certificate naming

- `certs/ca.crt` for CA trust chain (auto-wired to `NODE_EXTRA_CA_CERTS` if not already set).

## Security note

Do not commit secrets or private certificates. `.gitignore` already excludes:

- `runtime/.env`
- `runtime/certs/*` (except `runtime/certs/.gitkeep`)
