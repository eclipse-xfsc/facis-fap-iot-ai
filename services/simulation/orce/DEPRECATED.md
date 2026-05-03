# Deprecated artefacts — scheduled for removal

The files below were superseded by the ORCE-native runtime introduced on
`feature/orce-native-simulation-runtime`. They are intentionally retained
until production has run cleanly under `compatibilityMode=orce` for one
full week including a Bronze → Silver → Gold materialisation cycle. See
[`docs/orce-runtime/migration-guide.md`](../docs/orce-runtime/migration-guide.md)
for the cutover checklist.

## Flows

| File | Replaced by | Notes |
|---|---|---|
| `flows/facis-simulation.json` | `flows/facis-simulation-engine.json` + `flows/facis-simulation-feeds.json` | Legacy validator/passthrough; only used under `compatibilityMode=legacy`. |
| `flows/facis-simulation-cluster.json` | `flows/facis-simulation-kafka.json` | Legacy HTTP-driven Kafka producer chain; replaced by the link-in driven adapter. |

## Python service

The Python deployment (`services/simulation/Dockerfile`, `pyproject.toml`,
`src/`) is **not** a legacy artefact in the same sense — it remains the
documented rollback path under `compatibilityMode=legacy`. Decommission only
after:

1. ORCE-native runtime has run two consecutive weeks in production without a
   rollback event.
2. All BDD scenarios under `tests/bdd/features/orce_*.feature` are green.
3. Observability dashboards confirm parity on tick rate, Kafka throughput,
   and Trino row counts.

## How to remove

A finalisation script is provided once the above gates are met:

```bash
./services/simulation/orce/scripts/finalize-orce-migration.sh
```

The script:

1. Deletes `facis-simulation.json` and `facis-simulation-cluster.json`.
2. Removes the `legacy` branch of the `compatibilityMode` flag from the chart
   and all references in templates.
3. Archives the Python service source under `archive/python-simulation/` for
   one release cycle before final removal.

Do **not** run the script from a feature branch; cut a dedicated
`chore/decommission-python-sim` branch and PR it independently.
