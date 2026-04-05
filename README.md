# FACIS FAP IoT & AI Monorepo

This repository is organized as a multi-service workspace.

## Services

- `services/simulation`: deterministic simulation service for the FACIS IoT & AI demonstrator

## Quick Start (Simulation Service)

```bash
cd services/simulation
pip install -e ".[dev]"
python -m src.main
```

## Docker (Simulation Service)

```bash
docker build -t facis-simulation -f services/simulation/Dockerfile services/simulation
docker compose -f services/simulation/docker-compose.yml up
```
