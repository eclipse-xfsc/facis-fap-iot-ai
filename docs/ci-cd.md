# CI/CD Pipeline Configuration

## Overview

The FACIS FAP IoT & AI project uses **GitHub Actions** for continuous integration and delivery.
All workflows are defined in `.github/workflows/`.

## Pipelines

### CI Pipeline (`ci.yml`)

Triggered on pushes to `main`/`develop` and pull requests to `main`.

| Job | Service | Steps |
|-----|---------|-------|
| `lint-simulation` | Simulation | ruff, black, mypy |
| `lint-ai-insight` | AI Insight Service | ruff, black, mypy |
| `test-simulation` | Simulation | Unit, integration, BDD tests + Codecov |
| `test-ai-insight` | AI Insight Service | Unit, integration tests + Codecov |
| `build` | All | Docker image build for simulation + AI insight (main branch only) |

### Publish Pipeline (`publish.yml`)

Triggered on GitHub release publication or manual `workflow_dispatch`.

- Builds and pushes Docker images to Harbor registry via the
  [eclipse-xfsc/dev-ops](https://github.com/eclipse-xfsc/dev-ops) reusable workflows
- Publishes Helm charts to the Helm repository

### Dependency & License Checks

| Workflow | Purpose |
|----------|---------|
| `eclipse-dash.yml` | Eclipse dependency license compliance check |
| `sbom.yml` | Software Bill of Materials (SBOM) generation |

### Dependabot

Configured in `.github/dependabot.yml` for weekly updates to:
- GitHub Actions versions
- pip (Python) dependencies

## Deployment

### Development

Local development uses Docker Compose (for dev purposes only):

```bash
cd services/simulation
docker compose up
```

### Production (Kubernetes)

Production deployments use **Helm** on **Kubernetes v1.29+** (IONOS Cloud):

```bash
# Install simulation service
helm install facis-simulation services/simulation/helm/facis-simulation/ \
  --namespace facis --create-namespace \
  -f values-production.yaml

# Install AI insight service
helm install facis-ai-insight services/ai-insight-service/helm/facis-ai-insight/ \
  --namespace facis \
  -f values-production.yaml

# Install AI insight UI (ConfigMaps + Secrets for ORCE)
helm install facis-ai-insight-ui services/ai-insight-ui/helm/facis-ai-insight-ui/ \
  --namespace facis \
  -f values-production.yaml
```

### ORCE-Based Deployment

The XFSC ORCE (Orchestration Engine) handles service orchestration, including:
- Deploy/redeploy/uninstall with zero manual intervention
- Builder Node orchestration for deployment workflows
- Integration with Keycloak for credential management

## Release Artifacts

Each release produces:
- **OCI images** pushed to Harbor registry
- **Helm charts** published to Helm repository
- **BDD test reports** attached to the release
- **SBOM** for supply chain transparency

## Registry Configuration

Harbor registry settings are in `.github/habor.config`:
- Project: `iot`
- User: `iot`

## Security

- All CI runs include security checks
- Dependencies are scanned for license compliance (Eclipse Dash)
- SBOM generation for supply chain security
- Secrets managed via GitHub repository secrets
