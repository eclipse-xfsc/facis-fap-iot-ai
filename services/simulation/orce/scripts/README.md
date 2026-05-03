# `services/simulation/orce/scripts/` — Flow Renderers and Operational Scripts

Deterministic generators for the ORCE flow JSON, plus the watcher script
that the `kafka-broker-watcher` CronJob runs.

## `render-feeds.py`

Reads `services/simulation/config/default.yaml` and the 10 subflow
definitions in `../subflows/` and emits the entity-rendered
`../flows/facis-simulation-feeds.json`. The output is fully wired:

- 1 `link in` (`tick.trigger`, fixed id `linkin-tick-trigger`)
- 1 envelope-build function
- 21 entity branches in dependency order
  (weather → PV; city-events → streetlights; everything else parallel)
- `link out` per topic, references `kafka.json`'s link-in IDs by id

Re-runs are deterministic — every node id is `sha1(stable-string)[:16]`,
so a clean diff means nothing changed semantically.

```bash
python3 services/simulation/orce/scripts/render-feeds.py
# → wrote ... — 92 nodes
#   tabs=1  subflow_instances=21  link_out=22
```

When to re-run:
- Edit `services/simulation/config/default.yaml` (entity counts, configs)
- Edit any `services/simulation/orce/subflows/*.json` (subflow contract)
- Bump the renderer itself

## `render-kafka.py`

Rewrites `../flows/facis-simulation-kafka.json` with:

- `kafka-broker` config node — broker list led by the stable bootstrap
  (`212.132.83.222:9093`), then current Stackable NodePorts. Includes
  `metadataMaxAgeMs=30000` so the rdkafka client refreshes broker
  metadata every 30s and recovers from NodePort drift transparently.
- 9 `link in` nodes (`feeds.kafka.{meter,pv,weather,price,consumer,light,traffic,event,city.weather}`)
  wired one-to-one into the existing `rdkafka out` nodes.

The link-in IDs are derived via `linkin_id_for(name)` — a `sha1(...)[:16]`
hash. **`render-feeds.py` uses the same function** so the link-out's
`links` field in feeds.json points at the right kafka.json link-in.
Keep both files in sync if you ever edit one.

```bash
python3 services/simulation/orce/scripts/render-kafka.py
# → wrote ... — 22 nodes
```

When to re-run:
- After observing NodePort drift (`kcat -L -b 212.132.83.222:9093` to
  re-discover; update `KAFKA_BROKERS` constant in this script).
- When changing `metadata.max.age.ms`.

## `watch-kafka-brokers.sh`

Defence-in-depth NodePort drift watcher. Mounted via
`ConfigMap/facis-watch-kafka-brokers-script` and run by
`infrastructure/orce/kafka-broker-watcher-cronjob.yaml`. Not invoked
directly during normal operations; see the runbook section
`### Kafka NodePort drift` in `../docs/orce-runtime/operations-runbook.md`
for manual-trigger procedure.

## Why deterministic IDs

Node-RED node IDs aren't displayed in the editor, but they appear in the
JSON. If they change every time we render, every render = thousands of
line diffs even when nothing semantically changed. Sha1-of-stable-input
keeps diffs surgical: rendering after editing one entity in
`default.yaml` produces a diff scoped to that entity's branch.

## Pre-PR check

```bash
python3 services/simulation/orce/scripts/render-feeds.py
python3 services/simulation/orce/scripts/render-kafka.py
git diff --stat services/simulation/orce/flows/
# expect: empty (or only the file you intended to change)
```
