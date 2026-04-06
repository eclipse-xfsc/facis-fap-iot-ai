# facis-ai-insight

Helm chart for the **FACIS AI Insight Service** — a FastAPI service that
translates natural-language insight requests into Trino queries against the
FACIS gold-layer data, then synthesises analytical responses via an
OpenAI-compatible LLM endpoint.

Part of the **FACIS FAP IoT & AI demonstrator** managed by
[ATLAS IoT Lab GmbH](https://atlas-iot-lab.com).

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Kubernetes | >= 1.25 |
| Helm | >= 3.10 |
| Trino coordinator | reachable from the cluster |
| OpenAI-compatible LLM endpoint | any (Azure OpenAI, OpenAI, vLLM, …) |

---

## Quick Start

```bash
helm install ai-insight ./facis-ai-insight \
  --namespace facis \
  --create-namespace \
  --set llm.chatCompletionsUrl="https://api.openai.com/v1/chat/completions" \
  --set llm.apiKey="sk-..." \
  --set trino.host="trino.facis.svc.cluster.local" \
  --set trino.port="8443" \
  --set "trinoCA.crt=$(cat /path/to/trino-ca.crt)"
```

---

## Configuration

All parameters are documented inline in `values.yaml`. Key sections:

### LLM (`llm.*`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `llm.chatCompletionsUrl` | `""` | **Required.** OpenAI-compatible endpoint URL. Stored in a Kubernetes Secret. |
| `llm.apiKey` | `""` | **Required.** API key. Stored in a Kubernetes Secret. |
| `llm.model` | `gpt-4.1-mini` | Model identifier forwarded to the endpoint. |
| `llm.timeoutSeconds` | `30` | Per-request timeout. |
| `llm.maxRetries` | `3` | Retries on transient errors. |
| `llm.requireHttps` | `true` | Reject non-HTTPS completions URLs. |

### Trino (`trino.*`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `trino.host` | `trino` | Coordinator hostname. |
| `trino.port` | `8443` | Coordinator port. |
| `trino.httpScheme` | `https` | `http` or `https`. |
| `trino.verify` | `/app/certs/trino-ca.crt` | Path to CA cert inside the container. |
| `trino.catalog` | `hive` | Trino catalog. |
| `trino.targetSchema` | `gold` | Schema containing FACIS gold tables. |

### Trino CA (`trinoCA.*`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `trinoCA.create` | `true` | Create the CA Secret from chart values. |
| `trinoCA.crt` | `""` | PEM-encoded CA certificate content. |
| `trinoCA.nameOverride` | `""` | Override the generated Secret name. |

Set `trinoCA.create=false` to manage the Secret externally (e.g. Sealed Secrets, Vault Agent Injector). The Secret must contain the key `ca.crt`.

### LLM Secret (`llmSecret.*`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `llmSecret.create` | `true` | Create the LLM credentials Secret from chart values. |
| `llmSecret.nameOverride` | `""` | Override the generated Secret name. |

Set `llmSecret.create=false` to supply the Secret externally. It must contain `llm_chat_completions_url` and `llm_api_key` (plus `redis_url` when `cache.enabled=true`).

### Rate Limiting (`rateLimit.*`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `rateLimit.enabled` | `true` | Enable per-client rate limiting. |
| `rateLimit.requestsPerMinute` | `10` | Request cap per minute per client. |

### Cache (`cache.*`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `cache.enabled` | `false` | Enable Redis-backed response caching. |
| `cache.redisUrl` | `""` | Redis connection URL (stored in Secret). |
| `cache.ttlSeconds` | `300` | Cache TTL in seconds. |

### Prompt Templates (`promptTemplates.*`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `promptTemplates.enabled` | `true` | Mount templates from ConfigMap. |
| `promptTemplates.path` | `/app/config/prompts` | Mount path inside the container. |
| `promptTemplates.create` | `true` | Create the ConfigMap from `promptTemplates.templates`. |
| `promptTemplates.templates` | see `values.yaml` | Map of filename to template content. |

### Policy (`policy.*`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `policy.enabled` | `true` | Enable header-based ABAC policy enforcement. |
| `policy.agreementHeader` | `x-agreement-id` | Header carrying the agreement identifier. |
| `policy.assetHeader` | `x-asset-id` | Header carrying the asset identifier. |
| `policy.roleHeader` | `x-user-roles` | Header carrying comma-separated user roles. |

---

## Secrets Management

Two secrets are created by this chart by default:

1. `<fullname>-llm-credentials` — holds `llm_chat_completions_url`, `llm_api_key`, and optionally `redis_url`.
2. `<fullname>-trino-ca` — holds `ca.crt` (PEM-encoded Trino CA certificate).

Both carry `helm.sh/resource-policy: keep` so they are not deleted on `helm uninstall`. Remove them manually if desired:

```bash
kubectl delete secret -n facis <fullname>-llm-credentials <fullname>-trino-ca
```

To use externally managed Secrets, set `llmSecret.create=false` and/or `trinoCA.create=false` and ensure the Secrets exist before installing the chart.

---

## Upgrading

```bash
helm upgrade ai-insight ./facis-ai-insight \
  --namespace facis \
  --reuse-values \
  --set llm.model=gpt-4o
```

The Deployment checksum annotations on `configmap.yaml` and `secrets.yaml` trigger automatic rollouts whenever configuration changes.

---

## Uninstalling

```bash
helm uninstall ai-insight --namespace facis
# Secrets are retained by default; remove manually:
kubectl delete secret -n facis ai-insight-facis-ai-insight-llm-credentials \
                               ai-insight-facis-ai-insight-trino-ca
```

---

## Chart Structure

```
facis-ai-insight/
├── Chart.yaml
├── values.yaml
├── .helmignore
├── README.md
└── templates/
    ├── _helpers.tpl
    ├── NOTES.txt
    ├── configmap.yaml          # Trino config + prompt templates
    ├── deployment.yaml
    ├── ingress.yaml
    ├── secrets.yaml            # LLM credentials + Trino CA
    ├── service.yaml
    └── serviceaccount.yaml
```

---

## License

Apache-2.0 — see project root for full license text.
