# Chart-bundled ORCE flows

This directory is the source for the `facis-simulation-orce-flows` ConfigMap
rendered by `templates/orce-flows-configmap.yaml`. It holds copies of the
flow JSON files under `services/simulation/orce/{flows,subflows}/`.

The directory is intentionally checked-in empty (`.gitkeep`). Populate it
before `helm install/upgrade` by running:

```bash
cd services/simulation/helm/facis-simulation
./sync-flows.sh
```

`sync-flows.sh` copies the canonical flow files into this directory so the
chart can `Files.Glob` them at render time. Re-run the script whenever flow
JSON changes; commit the synced files only if you want them tracked.
