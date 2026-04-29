# Changelog — `services/simulation`

This changelog tracks user-visible behaviour changes in the FACIS
simulation service. Format loosely based on [Keep a Changelog](https://keepachangelog.com/);
versions correspond to chart `appVersion` bumps.

## Unreleased

### Added
- **Entity-rendered `feeds.json`.** New generator
  `services/simulation/orce/scripts/render-feeds.py` reads `default.yaml`
  and emits 21 fully-wired entity instances (2 meters, 2 PV, 4 consumers,
  1 weather, 1 price, 6 streetlights, 2 traffic, 2 city-events,
  1 visibility) into `facis-simulation-feeds.json`. Replaces the previous
  4-node stub.
- **Kafka NodePort watcher CronJob** (`infrastructure/orce/kafka-broker-watcher-cronjob.yaml`).
  Runs every 15 min, re-deploys `kafka.json` when Stackable broker
  NodePorts drift across 2 stable cycles.
- **Kafka cert expiry CronJob** (`infrastructure/orce/kafka-cert-expiry-cronjob.yaml`).
  Daily check pushes `facis_kafka_cert_days_until_expiry` to the
  pushgateway; alerts at 14d (warning) and 7d (critical).
- **Init container for ORCE npm deps + librdkafka rebuild**. Installs
  `node-red-contrib-{modbus,rdkafka}`, `ssh2-sftp-client`, `csv-parse`,
  `seedrandom`. Detects librdkafka built without OpenSSL (or linking
  `libsasl2` which isn't in the runtime container) and force-rebuilds
  with OpenSSL via `apk add openssl-dev build-base linux-headers
  zlib-dev`. Idempotent across pod restarts.
- **Documentation**: `entity-rendering-migration.md`, `infrastructure/README.md`,
  `services/simulation/orce/scripts/README.md`, plus runbook sections for
  cert rotation and NodePort drift.

### Changed
- **Cross-tab state moved from `flow.*` to `global.*`** in
  `engine.json`, `tick.json`, `rest.json`, `feeds.json`. Required because
  Node-RED's `flow` context is scoped per tab; the previous code silently
  failed any read across tab boundaries (the tick scheduler in particular
  was never seeing the engine state).
- **`tick.json`'s `link-out-tick`** now wires to fixed id
  `linkin-tick-trigger` (the new feeds tab's link-in). Previously
  `links: []`, so tick payloads went nowhere.
- **`kafka.json` broker list** now leads with the stable bootstrap
  `212.132.83.222:9093` followed by the current NodePorts. Combined with
  the new `metadata.max.age.ms=30000` setting in `rdkafka-patch.js`, the
  client recovers from NodePort drift transparently within ~30s.
- **`engine.json` startup chain made idempotent.** Both
  `engine-state-restore` and `engine-state-default` skip if `global.engine`
  is already set with a recent transition, eliminating the race where a
  `/start` call immediately after deploy was clobbered when the bootstrap
  inject fired. `inject.onceDelay` raised from 0.5s to 1.5s as additional
  defence-in-depth.

### Fixed
- `registered_entities: 0` after deploy — caused by the missing entity
  instances in `feeds.json`; fixed by the renderer.
- Producer "not connected" + "OpenSSL not available at build time" —
  caused by `librdkafka.so.1` shipping without OpenSSL; fixed by the
  init-deps rebuild step.
- Producer crashing with `Cannot read properties of undefined (reading
  'produce')` after a librdkafka rebuild that linked `libsasl2` —
  caused by `cyrus-sasl-dev` being installed at build time; fixed by
  removing it from the apk install list (we use mTLS, not SASL).

### Operational notes
- **Bootstrap address `212.132.83.222:9093`** is now load-bearing for
  drift recovery. If it ever moves, every chart that consumes Kafka
  breaks. Alerted via the existing `FACISServiceDown` rule.
- **TLS client cert at `/etc/kafka-certs/tls.crt`** expires periodically
  (next: 2026-05-17). Manual rotation procedure is in
  `services/simulation/docs/orce-runtime/operations-runbook.md` under
  `### mTLS cert rotation`. Auto-rotation is a tracked follow-up.
