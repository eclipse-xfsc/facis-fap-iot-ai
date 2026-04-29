# Deployment Guide

## Prerequisites

- Kubernetes v1.29+ cluster on IONOS Cloud
- Helm v3 CLI
- `kubectl` configured with cluster access
- XFSC ORCE deployed in the cluster
- Keycloak instance for OIDC authentication

### IONOS Cloud Services Used

| Service | Purpose |
|---------|---------|
| Managed Kubernetes | Container orchestration |
| S3 Object Storage | Data lake storage |
| PostgreSQL DBaaS | Keycloak backend |
| Virtual Datacenter | Network segmentation |

### Data Lakehouse Services (Stackable Cluster)

| Service | Purpose |
|---------|---------|
| Apache Kafka | Real-time data streaming |
| Apache NiFi | Data flow orchestration |
| Trino | Distributed SQL queries |
| Apache Spark | Batch/stream processing |

## Namespace Setup

```bash
kubectl create namespace facis
```

## 1. Simulation Service

```bash
# Install with Helm
helm install facis-simulation services/simulation/helm/facis-simulation/ \
  --namespace facis \
  --set mqtt.host=facis-mqtt \
  --set kafka.bootstrapServers=kafka-0:9094,kafka-1:9094,kafka-2:9094 \
  --set kafka.securityProtocol=SSL \
  --set orce.enabled=true \
  --set orce.url=http://facis-orce:1880

# Verify deployment
kubectl get pods -n facis -l app.kubernetes.io/name=facis-simulation
kubectl logs -n facis -l app.kubernetes.io/name=facis-simulation
```

### Configuration

Key values to override for production:

```yaml
simulation:
  speedFactor: 60.0        # 60x acceleration for demos
  mode: normal

kafka:
  enabled: true
  securityProtocol: SSL
  ssl:
    caLocation: /app/certs/ca.crt
    certificateLocation: /app/certs/client.crt
    keyLocation: /app/certs/client.key

orce:
  enabled: true
  url: http://facis-orce:1880
```

## 2. AI Insight Service

```bash
# Create secrets first
kubectl create secret generic ai-insight-secrets \
  --from-literal=llm_api_key=<your-api-key> \
  --from-literal=llm_chat_completions_url=<your-llm-url> \
  -n facis

kubectl create secret generic ai-insight-trino-ca \
  --from-file=trino-ca.crt=<path-to-ca-cert> \
  -n facis

# Install with Helm
helm install facis-ai-insight services/ai-insight-service/helm/facis-ai-insight/ \
  --namespace facis \
  --set trino.host=trino-coordinator \
  --set trino.port=8443

# Verify
kubectl get pods -n facis -l app.kubernetes.io/name=facis-ai-insight
```

## 3. AI Insight UI

The UI runs inside ORCE as Node-RED flows and UIBUILDER pages:

```bash
# Install ConfigMaps and Secrets
helm install facis-ai-insight-ui services/ai-insight-ui/helm/facis-ai-insight-ui/ \
  --namespace facis \
  --set aiInsightService.url=http://ai-insight-service:8080 \
  --set llm.openai.apiKey=<your-key>

# Import flows into ORCE
kubectl get configmap ai-insight-ui-flows -n facis -o jsonpath='{.data.flows\.json}' | \
  curl -X POST http://orce:1880/flows -H 'Content-Type: application/json' -d @-
```

## Upgrade

```bash
helm upgrade facis-simulation services/simulation/helm/facis-simulation/ \
  --namespace facis -f values-production.yaml

helm upgrade facis-ai-insight services/ai-insight-service/helm/facis-ai-insight/ \
  --namespace facis -f values-production.yaml
```

## Uninstall

```bash
helm uninstall facis-ai-insight-ui -n facis
helm uninstall facis-ai-insight -n facis
helm uninstall facis-simulation -n facis
```

## Health Checks

All services expose health endpoints:

```bash
# Via kubectl port-forward
kubectl port-forward svc/facis-simulation 8080:8080 -n facis
curl http://localhost:8080/api/v1/health

kubectl port-forward svc/facis-ai-insight 8081:8080 -n facis
curl http://localhost:8081/api/v1/health
```

## TLS Configuration

TLS 1.3 is enforced via Kubernetes Ingress:

```yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    nginx.ingress.kubernetes.io/ssl-protocols: "TLSv1.3"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
  hosts:
    - host: simulation.facis.cloud
      paths:
        - path: /
          pathType: Prefix
  tls:
    - hosts:
        - simulation.facis.cloud
      secretName: facis-tls
```

## Troubleshooting

See: `services/simulation/docs/deployment/ops-runbook.md`
