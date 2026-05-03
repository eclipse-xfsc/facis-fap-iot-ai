# Flow-level tests

Unit tests for individual subflows and end-to-end tests for the composed flow tabs, executed with [`node-red-test-helper`](https://github.com/node-red/node-red-test-helper).

Run all flow tests:

```bash
cd services/simulation/orce
npm install --include=dev   # only required once on the developer machine
node --test tests/flows
```

These tests run outside ORCE: they instantiate a Node-RED test runtime in-process and load the subflow under test plus its dependencies.

| Test file | Validates |
|---|---|
| `rng.spec.js` | Same `(base_seed, entity_id, ts_ms)` triple → identical floats across two independent runs (Phase 2). |
| `weather-pv.spec.js` | Weather → PV correlation: increased GHI raises PV output monotonically (Phase 5). |
| `energy-meter.spec.js` | Cumulative energy is monotonic non-decreasing; phase distribution sums to total (Phase 6). |
| `correlation-engine.spec.js` | Simulator dependency order is enforced; envelope shape matches `src/api/orce/envelope.py`. |
| `lifecycle.spec.js` | FSM transitions through INITIALIZED → RUNNING → PAUSED → RUNNING → STOPPED (Phase 3). |

Files are added per phase. BDD-level tests against a live ORCE pod live under `services/simulation/tests/bdd/`.
