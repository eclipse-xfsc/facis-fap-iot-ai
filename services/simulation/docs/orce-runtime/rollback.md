# Rollback Guide — ORCE-native → Python Simulation

The ORCE-native runtime is shipped behind a `compatibilityMode` flag so that
rollback is a single Helm value flip.

## When to roll back

- Engine FSM transitions are failing or returning malformed responses.
- Kafka topic message rate drops to zero unexpectedly.
- Modbus register reads return stale or zero data and cannot be diagnosed
  inside the rollback window.
- Determinism regressions block a downstream consumer.

If the issue is contained to one adapter (e.g. Modbus), prefer disabling that
adapter only rather than a full rollback.

## Procedure

### A — Switch back to the Python runtime

```bash
helm upgrade facis-simulation services/simulation/helm/facis-simulation/ \
  --namespace facis --reuse-values \
  --set compatibilityMode=legacy
```

This:

1. Sets the Python `Deployment.spec.replicas` back to `replicaCount`
   (default 1).
2. Skips rendering of `orce-flows-configmap.yaml` and `orce-flow-deploy-job.yaml`
   on subsequent upgrades.

The previously deployed flow JSON stays in the ORCE pod's PVC. The runtime
tabs are inert because no envelope arrives via `link in: sim.envelope` while
the Python pod is publishing directly to the legacy `facis-simulation.json` /
`facis-simulation-cluster.json` HTTP entrypoints.

### B — Validate

```bash
# Python pod should scale to 1
kubectl -n facis get deploy facis-simulation -o jsonpath='{.spec.replicas}'

# Python pod should serve the same REST API
kubectl -n facis port-forward svc/facis-simulation 8080:8080 &
curl -X POST http://localhost:8080/api/v1/simulation/start
curl http://localhost:8080/api/v1/simulation/status

# Kafka throughput should resume at the legacy flow.
kcat -b kafka:9092 -t sim.smart_energy.meter -C -c 3 -e
```

### C — Full Helm rollback (last resort)

If the chart itself is degraded:

```bash
helm history facis-simulation -n facis
helm rollback facis-simulation <PREVIOUS_REVISION> -n facis
```

This reverts every chart-managed object to the prior release including the
post-install Job, ConfigMaps, and the deployment template.

## What's safe to leave behind

- `facis-simulation-orce-flows` ConfigMap — idempotent re-import on the next
  ORCE-mode upgrade.
- `/data/sim-state/state.json` and `/data/sim-state/entities.json` on the
  ORCE PVC — read by the engine flow on next start.
- The `facis-orce-admin` Secret — token reuse is fine.

## What you should clean up

- Stale `orce-flow-deploy` Jobs older than 24h: the Helm hook deletes finished
  jobs automatically, but manually-triggered runs may linger.

```bash
kubectl -n facis delete jobs -l app.kubernetes.io/component=orce-flow-deploy \
  --field-selector=status.successful=1
```

## After a roll-forward

When you're ready to retry the migration:

```bash
helm upgrade facis-simulation . --reuse-values --set compatibilityMode=orce
```

The flow re-deploy is idempotent; subsequent ticks pick up cleanly from the
persisted engine state.
