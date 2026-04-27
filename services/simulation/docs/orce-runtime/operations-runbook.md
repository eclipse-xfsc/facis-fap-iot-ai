# ORCE-native Simulation Runtime — Operations Runbook

Day-to-day ops procedures. For migration steps see
[`migration-guide.md`](./migration-guide.md). For the architecture overview
see [`architecture.md`](./architecture.md).

## Deploy / upgrade

```bash
# 1. Sync the canonical flow JSON into the chart's files/ directory.
cd services/simulation/helm/facis-simulation
./sync-flows.sh

# 2. Ensure the ORCE admin token Secret exists.
#    Key: token; Value: bearer token accepted by ORCE Admin API.
kubectl -n facis create secret generic facis-orce-admin \
  --from-literal=token="$(cat /tmp/orce-admin-token)" \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Helm install / upgrade.
helm upgrade --install facis-simulation . \
  --namespace facis \
  --create-namespace \
  --set compatibilityMode=orce

# 4. Verify the post-install Job deployed flows.
kubectl -n facis logs job/facis-simulation-orce-flow-deploy --tail=30
# Expected last lines:
#   [orce-flow-deploy] POST http://facis-orce.orce.svc.cluster.local:1880/flows ...
#   [orce-flow-deploy] deploy ok
```

## Lifecycle control

```bash
# Port-forward ORCE so you can drive the REST control plane locally.
kubectl -n orce port-forward svc/facis-orce 1880:1880 &

curl -X POST http://localhost:1880/api/v1/simulation/start
curl http://localhost:1880/api/v1/simulation/status
curl -X POST http://localhost:1880/api/v1/simulation/pause
curl -X POST http://localhost:1880/api/v1/simulation/reset \
  -H 'Content-Type: application/json' \
  -d '{"seed": 12345, "start_time": "2024-06-15T08:00:00Z"}'
```

## Read snapshots

```bash
curl http://localhost:1880/api/v1/meters | jq
curl http://localhost:1880/api/v1/pv | jq
curl http://localhost:1880/api/v1/weather | jq
curl http://localhost:1880/api/v1/prices | jq
curl http://localhost:1880/api/v1/loads | jq
curl http://localhost:1880/api/v1/health | jq
```

## Verify Kafka publishing

```bash
KAFKA_BROKERS="217.160.222.177:32413,217.160.219.79:31053,213.165.77.54:31860"
KAFKA_CERTS="-X security.protocol=ssl \
  -X ssl.ca.location=/path/to/ca.crt \
  -X ssl.certificate.location=/path/to/tls.crt \
  -X ssl.key.location=/path/to/tls.key"

kcat -b "${KAFKA_BROKERS}" ${KAFKA_CERTS} \
  -t sim.smart_energy.meter -C -c 5 -e | jq
```

## Verify MQTT publishing

```bash
mosquitto_sub -h facis-mqtt -p 1883 -t 'facis/#' -C 10
```

## Verify Modbus

```bash
python3 - <<'PY'
import asyncio
from pymodbus.client import AsyncModbusTcpClient

async def main():
    c = AsyncModbusTcpClient('localhost', port=502)
    await c.connect()
    rsp = await c.read_holding_registers(address=19000, count=2, slave=1)
    high, low = rsp.registers
    import struct
    val = struct.unpack('>f', struct.pack('>HH', high, low))[0]
    print(f'Active power L1: {val:.1f} W')
    c.close()

asyncio.run(main())
PY
```

(`kubectl -n orce port-forward svc/facis-orce 502:502` first.)

## Observability

```bash
# Prometheus scrape
curl http://localhost:1880/metrics | head -40

# Stdout JSON logs
kubectl -n orce logs deploy/facis-orce -c orce | head -20

# Tail dead-letter topic
kcat -b "${KAFKA_BROKERS}" ${KAFKA_CERTS} -t sim.dead_letter -C -e
```

Counters emitted:

- `facis_sim_ticks_total{runtime="orce-native"}`
- `facis_kafka_messages_sent_total{topic=...}`
- `facis_mqtt_messages_sent_total{topic=...}`
- `facis_modbus_requests_total{register_type=FCx}`

## Switch modes

### Hand off to legacy (Python) runtime

```bash
helm upgrade facis-simulation services/simulation/helm/facis-simulation/ \
  --namespace facis --reuse-values \
  --set compatibilityMode=legacy
```

The Python deployment scales back to 1; the post-install Job is **not** torn
down (idempotent re-import). The flow runtime tabs (`engine`, `tick`, `feeds`,
`modbus`, `rest`) keep running in ORCE but the engine FSM stays
`initialized` because the Python pod now drives the envelope into the
adapters via `POST /api/sim/tick`.

### Hand back to ORCE

```bash
helm upgrade facis-simulation services/simulation/helm/facis-simulation/ \
  --namespace facis --reuse-values \
  --set compatibilityMode=orce
```

## Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| `orce-flow-deploy` Job CrashLoopBackoff | ORCE pod not ready or admin token wrong | `kubectl -n facis logs job/...-orce-flow-deploy`; check ORCE readiness; rotate `facis-orce-admin` Secret |
| `/api/v1/meters` returns `[]` | Engine in `initialized`, no tick has fired | `POST /api/v1/simulation/start`; wait `1 / speed_factor` minutes |
| Modbus client times out | `node-red-contrib-modbus` not loaded in PVC | `kubectl -n orce exec deploy/facis-orce -- ls /data/node_modules/node-red-contrib-modbus` — if missing, re-run entrypoint by deleting the pod |
| Kafka publishing silent | Cert paths invalid | `kubectl -n orce describe pod` → check `kafka-tls-certs` mount |
| Determinism drift between two runs | seed not reset before second run | `POST /api/v1/simulation/reset {"seed": N, "start_time": ...}` first |

## Backup / restore

The only persistent state is `/data/sim-state/{state.json,entities.json}` on
the ORCE PVC. Back up the PVC volume snapshot via the IONOS console; restore
by remounting and Pod-restarting ORCE. The Helm chart is otherwise stateless.
