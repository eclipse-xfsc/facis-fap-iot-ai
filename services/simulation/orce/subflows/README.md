# Reusable Subflows

Each subflow encapsulates one piece of the ORCE-native simulation runtime so the main flow tabs can compose them. See `docs/orce-runtime/architecture.md` for the full design (added in Phase 15).

| File | Purpose | Source mapping |
|---|---|---|
| `rng.subflow.json` | Deterministic seeded RNG (JS-native, `seedrandom('alea')`). Per-entity and per-tick seeds derived via SHA-256 truncation. | `services/simulation/src/core/random_generator.py:74-101` |
| `weather-simulator.subflow.json` | Generates current weather snapshot (temperature, GHI, wind, cloud cover, visibility). | `services/simulation/src/simulators/weather/` |
| `pv-simulator.subflow.json` | Generates PV system output for the current tick. Consumes weather output. | `services/simulation/src/simulators/pv_generation/` |
| `energy-meter-simulator.subflow.json` | Generates Janitza UMG 96RM-shaped meter readings; maintains cumulative energy state per meter. | `services/simulation/src/simulators/energy_meter/` |
| `energy-price-simulator.subflow.json` | Generates EPEX-shaped day-ahead spot price. | `services/simulation/src/simulators/energy_price/` |
| `consumer-load-simulator.subflow.json` | Generates per-device consumer load with duty cycles and operating windows. | `services/simulation/src/simulators/consumer_load/` |
| `streetlights-simulator.subflow.json` | Smart-city street light dimming snapshot. | `services/simulation/src/simulators/smart_city/streetlight.py` |
| `traffic-simulator.subflow.json` | Smart-city traffic flow/congestion snapshot. | `services/simulation/src/simulators/smart_city/traffic.py` |
| `city-events-simulator.subflow.json` | Smart-city event injection. | `services/simulation/src/simulators/smart_city/event.py` |
| `visibility-simulator.subflow.json` | Smart-city visibility conditions. | `services/simulation/src/simulators/smart_city/visibility.py` |
| `correlation-engine.subflow.json` | Sequences simulators in dependency order; computes cross-feed metrics. | `services/simulation/src/simulators/correlation/engine.py:30-160` |
| `json-schema-validator.subflow.json` | Validates the unified tick envelope before downstream fan-out. | Lifted from existing `flows/facis-simulation.json` validator function. |

Subflows are populated by Phases 2–8 of the migration (see `tasks/`).
