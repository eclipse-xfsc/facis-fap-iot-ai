# ORCE-native Simulation Runtime — Architecture

## Why

The FACIS technical specification mandates ORCE as the orchestration layer.
Historically the simulation logic ran in a Python (FastAPI + asyncio) container
and ORCE was a thin Kafka/MQTT integration adapter. We have collapsed both
into ORCE-native flows running on the existing ORCE pod, removing one container
image, one Helm chart's worth of runtime surface, and the seam where
schema-validation lived twice.

## Runtime layout

```
ORCE pod (single deployment, single PVC)
├── flows/
│   ├── facis-simulation-engine.json          ── lifecycle FSM + REST control
│   ├── facis-simulation-tick.json            ── self-adjusting tick scheduler
│   ├── facis-simulation-feeds.json           ── correlation + envelope assembly
│   ├── facis-simulation-kafka.json           ── 9× rdkafka producers (mTLS)
│   ├── facis-simulation-mqtt.json            ── facis/* MQTT topics
│   ├── facis-simulation-modbus.json          ── Janitza UMG 96RM holding regs
│   ├── facis-simulation-rest.json            ── GET /api/v1/{meters,pv,…}
│   ├── facis-simulation-observability.json   ── /metrics + DLQ + structured logs
│   ├── facis-simulation-controls.json        ── operator buttons (legacy)
│   └── facis-simulation{,-cluster}.json      ── legacy passthrough (compat)
└── subflows/
    ├── rng.subflow.json                      ── seedrandom + SHA-256 RNG
    ├── weather-simulator.subflow.json
    ├── pv-simulator.subflow.json
    ├── energy-meter-simulator.subflow.json
    ├── energy-price-simulator.subflow.json
    ├── consumer-load-simulator.subflow.json
    ├── streetlights-simulator.subflow.json
    ├── traffic-simulator.subflow.json
    ├── city-events-simulator.subflow.json
    └── visibility-simulator.subflow.json
```

## Tab responsibilities

| Tab | Inputs | Outputs |
|---|---|---|
| Engine | `POST /api/v1/simulation/{start,pause,reset}`, `GET /status` | flow context `engine` (FSM) + persisted `state.json` |
| Tick Loop | recursive `setTimeout` honouring `speed_factor` | `link out: tick.trigger` (one per tick when `state == running`) |
| Feeds | `link in: tick.trigger`, flow context `engine` + `entity_registry` | `link out: sim.envelope` + flow context `latest_*` snapshots |
| Kafka Adapter | `link in: sim.envelope` | 9 Stackable Kafka topics with mTLS |
| MQTT Adapter | `link in: sim.envelope` | `facis/...` topic tree |
| Modbus Adapter | `link in: sim.envelope` + 1s fallback inject | TCP/502 holding registers (Janitza UMG 96RM layout) |
| REST API | `GET /api/v1/{meters,pv,weather,prices,loads,…}` | flow context `latest_*` snapshots |
| Observability | `link in: metric.inc`, `catch all`, `GET /metrics` | Prometheus text, JSON logs to stderr, DLQ via Kafka |

## State management

- **FSM + run-level state** lives in flow context under `engine` (state,
  `simulation_time`, `seed`, `acceleration`, `tick_index`) and is persisted to
  `/data/sim-state/state.json` on every transition.
- **Cumulative entity state** (PV daily kWh, etc.) lives in flow context keyed
  by entity ID, flushed lazily.
- **Latest tick snapshot** lives in flow context (`latest_meters`, `latest_pv`,
  `latest_weather`, `latest_price`, `latest_consumers`) and is overwritten each
  tick. The REST snapshot tab and Modbus adapter both read from these.

## Determinism contract

Same seed → same envelope sequence within the new engine, byte-stable across
pod restarts and flow re-imports. The PRNG is `seedrandom('alea')` seeded with
the first 8 bytes (16 hex chars) of `sha256(base_seed:entity_id:tag:ts_ms)`.

This is **not** byte-identical to the legacy Python (numpy PCG64) sequences
— a controlled break documented in
[`migration-guide.md`](./migration-guide.md). Internal correlations
(weather → PV, events → streetlight dimming) are preserved; numeric ranges and
qualitative shapes match the Python reference within the same envelopes.

## Determinism is enforced where?

- Subflow function-node inline math is the canonical implementation.
- The feeds-orchestrator function node duplicates the math for runtime
  efficiency (one node per envelope rather than 20 subflow invocations).
- Tests under `services/simulation/orce/tests/flows/*.spec.js` mirror the same
  algorithms and assert ranges, correlations and reproducibility. **If you
  change a constant in a subflow, update the spec and the orchestrator.**

## Data plane

The data plane (Kafka, NiFi, S3/Iceberg, Trino) is unchanged. Topic names,
JSON payload field names and types, MQTT topic conventions, and Modbus
register addresses are all preserved from the Python service.

## Where the legacy path still exists

- `compatibilityMode: legacy` keeps the Python deployment alive (`replicaCount`
  honoured) and the legacy ORCE flows (`facis-simulation.json`,
  `facis-simulation-cluster.json`) keep accepting `POST /api/sim/tick` from the
  Python pod.
- `compatibilityMode: orce` (default) scales the Python deployment to 0 and
  installs the new flows via the post-install Helm hook.

The two modes share the same Stackable Kafka cluster, the same Trino, and the
same MQTT broker — switching modes is invisible to downstream consumers.
