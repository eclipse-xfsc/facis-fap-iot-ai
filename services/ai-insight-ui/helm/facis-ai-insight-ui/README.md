# FACIS AI Insight UI — Helm Chart

Helm chart for deploying the FACIS AI Insight Vue.js dashboard into an
existing ORCE (Node-RED) instance running on Kubernetes.

This chart creates **no Deployment or Service** of its own. The UI runs
entirely inside the ORCE pod via node-red-contrib-uibuilder. The chart
provisions:

- `ConfigMap` — Node-RED flows JSON (`flows.full.json`)
- `ConfigMap` — UIBUILDER static assets (`index.html`, `index.js`, `index.css`)
- `Secret` — LLM API keys (`openai-api-key`, `anthropic-api-key`, `custom-llm-key`)

## Prerequisites

- Kubernetes 1.25+
- Helm 3.x
- An existing ORCE (Node-RED) Deployment in the target namespace
- node-red-contrib-uibuilder installed inside ORCE

## Quick Start

```bash
# From the chart directory
cd facis-fap-iot-ai/services/ai-insight-ui/helm

# Dry-run to preview rendered manifests
helm template facis-ai-insight-ui ./facis-ai-insight-ui \
  --set llmSecret.openaiApiKey=sk-... \
  --set llmSecret.anthropicApiKey=sk-ant-...

# Install into the facis namespace
helm install facis-ai-insight-ui ./facis-ai-insight-ui \
  -n facis --create-namespace \
  --set llmSecret.openaiApiKey=sk-... \
  --set llmSecret.anthropicApiKey=sk-ant-...

# Install with a values file (recommended for production)
helm install facis-ai-insight-ui ./facis-ai-insight-ui \
  -n facis \
  -f values-production.yaml
```

After installation, follow the NOTES printed to the terminal to:

1. Import the Node-RED flows via the admin API.
2. Mount the UI files ConfigMap into the ORCE deployment.
3. Patch the ORCE Deployment with LLM environment variables.

## Bundling UI Files in the Chart

To bundle `flows.full.json` and the UI sources inside the chart package
(so the ConfigMaps are fully populated without manual patching), copy the
files into the chart's `files/` directory before packaging:

```bash
CHART=facis-fap-iot-ai/services/ai-insight-ui/helm/facis-ai-insight-ui

mkdir -p $CHART/files/ui

cp facis-fap-iot-ai/services/ai-insight-ui/flows/flows.full.json \
   $CHART/files/flows.full.json

cp facis-fap-iot-ai/services/ai-insight-ui/ui/src/index.html \
   facis-fap-iot-ai/services/ai-insight-ui/ui/src/index.js \
   facis-fap-iot-ai/services/ai-insight-ui/ui/src/index.css \
   $CHART/files/ui/

helm package $CHART
```

The default `values.yaml` already points `flows.filePath` and
`uiFiles.dirPath` at those paths.

## Uninstall

```bash
helm uninstall facis-ai-insight-ui -n facis
```

The ConfigMaps and Secret carry `helm.sh/resource-policy: keep` so they
survive uninstall and protect ORCE state. Delete them explicitly if needed:

```bash
kubectl delete configmap ai-insight-ui-flows ai-insight-ui-files -n facis
kubectl delete secret orce-llm-secrets -n facis
```

## Configuration

### ORCE Reference

| Parameter               | Description                                  | Default              |
|-------------------------|----------------------------------------------|----------------------|
| `orce.deploymentName`   | Name of the existing ORCE Deployment         | `orce`               |
| `orce.serviceName`      | Name of the ORCE Service                     | `orce`               |
| `orce.port`             | Node-RED admin API port                      | `1880`               |
| `orce.adminUrl`         | Internal admin URL for flow import commands  | `http://orce:1880`   |

### Flows ConfigMap

| Parameter                | Description                                        | Default                     |
|--------------------------|----------------------------------------------------|-----------------------------|
| `flows.configMapName`    | Override ConfigMap name                            | `ai-insight-ui-flows`       |
| `flows.filePath`         | Path to `flows.full.json` inside the chart package | `files/flows.full.json`     |
| `flows.inlineContent`    | Inline JSON (overrides filePath)                   | `""`                        |

### UI Files ConfigMap

| Parameter                  | Description                                   | Default                  |
|----------------------------|-----------------------------------------------|--------------------------|
| `uiFiles.configMapName`    | Override ConfigMap name                       | `ai-insight-ui-files`    |
| `uiFiles.dirPath`          | Path prefix to UI files inside the chart      | `files/ui`               |
| `uiFiles.inline.indexHtml` | Inline override for `index.html`              | `""`                     |
| `uiFiles.inline.indexJs`   | Inline override for `index.js`                | `""`                     |
| `uiFiles.inline.indexCss`  | Inline override for `index.css`               | `""`                     |

### LLM Secret

| Parameter                    | Description                                    | Default              |
|------------------------------|------------------------------------------------|----------------------|
| `llmSecret.create`           | Create the LLM API keys Secret                 | `true`               |
| `llmSecret.name`             | Secret name                                    | `orce-llm-secrets`   |
| `llmSecret.openaiApiKey`     | OpenAI API key                                 | `""`                 |
| `llmSecret.anthropicApiKey`  | Anthropic API key                              | `""`                 |
| `llmSecret.customLlmKey`     | Custom / self-hosted LLM key                   | `""`                 |
| `llmSecret.annotations`      | Extra annotations (e.g. reloader.stakater.com) | `{}`                 |

### LLM Model Selection

| Parameter               | Description                      | Default                       |
|-------------------------|----------------------------------|-------------------------------|
| `llm.openaiModel`       | OpenAI model identifier          | `gpt-4.1-mini`                |
| `llm.anthropicModel`    | Anthropic model identifier       | `claude-sonnet-4-20250514`    |
| `llm.customLlmUrl`      | Custom LLM endpoint URL          | `""`                          |
| `llm.customLlmModel`    | Custom LLM model identifier      | `custom`                      |

### Trino

| Parameter       | Description                  | Default                              |
|-----------------|------------------------------|--------------------------------------|
| `trino.host`    | Trino coordinator hostname   | `trino.stackable.svc.cluster.local`  |
| `trino.port`    | Trino HTTP port              | `8080`                               |
| `trino.catalog` | Trino catalog                | `iceberg`                            |
| `trino.schema`  | Trino schema                 | `facis`                              |

### Keycloak / OIDC (optional)

| Parameter              | Description                  | Default              |
|------------------------|------------------------------|----------------------|
| `keycloak.enabled`     | Enable OIDC integration      | `false`              |
| `keycloak.realmUrl`    | Keycloak realm URL           | `""`                 |
| `keycloak.clientId`    | OIDC client ID               | `facis-ai-insight`   |
| `keycloak.clientSecret`| OIDC client secret           | `""`                 |

## Architecture

```
Kubernetes Cluster (namespace: facis)
┌───────────────────────────────────────────────────────────────────┐
│                                                                   │
│  Helm release: facis-ai-insight-ui                                │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  ConfigMap: ai-insight-ui-flows                             │  │
│  │    flows.json  ──────────────────────────────────────────┐  │  │
│  └─────────────────────────────────────────────────────────┐│  │  │
│                                                            ││  │  │
│  ┌─────────────────────────────────────────────────────────┐│  │  │
│  │  ConfigMap: ai-insight-ui-files                         ││  │  │
│  │    index.html / index.js / index.css                    ││  │  │
│  └─────────────────────────────────────────────────────────┘│  │  │
│                                                             │  │  │
│  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  Secret: orce-llm-secrets                                │  │  │
│  │    openai-api-key / anthropic-api-key / custom-llm-key   │  │  │
│  └──────────────────────────────────────────────────────────┘  │  │
│                                               ▲                 │  │
│  Existing ORCE Deployment (not managed here)  │ POST /flows     │  │
│  ┌─────────────────────────────────────────────────────────┐│  │  │
│  │  Pod: orce                                              ││  │  │
│  │  ┌───────────────────────────────────────────────────┐  ││  │  │
│  │  │  Node-RED + uibuilder                             │  ││  │  │
│  │  │  Serves: /ai-insight/ (Vue.js SPA)               │  │└──┘  │
│  │  │  Env: FACIS_OPENAI_API_KEY (from Secret)         │  │      │
│  │  │  Mount: /data/uibuilder/ai-insight/src (CM)      │  │      │
│  │  └───────────────────────────────────────────────────┘  │      │
│  └─────────────────────────────────────────────────────────┘      │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Development

```bash
# Lint the chart
helm lint ./facis-ai-insight-ui

# Render templates locally
helm template facis-ai-insight-ui ./facis-ai-insight-ui \
  --set llmSecret.openaiApiKey=test-key

# Debug template rendering
helm template facis-ai-insight-ui ./facis-ai-insight-ui --debug

# Package the chart (after copying files/ as described above)
helm package ./facis-ai-insight-ui
```

## License

Apache License 2.0 — see [LICENSE](../../LICENSE) in the service root.

ATLAS IoT Lab GmbH — Eclipse Foundation FACIS project.
