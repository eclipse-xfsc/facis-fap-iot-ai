#!/usr/bin/env python3
"""
Rewrites services/simulation/orce/flows/facis-simulation-kafka.json:

1. Updates the kafka-broker config node to use the 3 external Stackable
   NodePort addresses (the Stackable internal DNS doesn't resolve from IONOS).
2. Replaces the legacy `link in (sim.envelope) → Validate → Split → Route`
   chain with 9 dedicated `link in` nodes (one per topic) that wire directly
   into the matching `rdkafka out` node.

Idempotent: the shared `linkin_id_for(...)` function keeps the same ids across
runs, and `render-feeds.py` uses the same function for the link-out targets.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_OUT = REPO_ROOT / "services/simulation/orce/flows/facis-simulation-kafka.json"

# Kafka broker list for the rdkafka client.
#
# Strategy: lead with the *stable bootstrap* address (212.132.83.222:9093),
# then list the current Stackable NodePorts as fall-throughs. The patched
# rdkafka also sets `metadata.max.age.ms` so the client refreshes its broker
# metadata every 30s; if NodePorts drift, the client picks up the new ones
# from the bootstrap-served metadata without a redeploy.
#
# Re-discover NodePorts when needed:
#   kcat -L -b 212.132.83.222:9093 \
#     -X security.protocol=ssl \
#     -X ssl.ca.location=ca.crt -X ssl.certificate.location=tls.crt \
#     -X ssl.key.location=tls.key -X ssl.endpoint.identification.algorithm=none
# Last NodePort refresh: 2026-04-29
KAFKA_BROKERS = (
    "212.132.83.222:9093,"           # stable bootstrap
    "85.215.37.238:32121,"           # broker 1243966389
    "217.160.216.54:32067,"          # broker 1243966388 (controller)
    "85.215.39.90:30604"             # broker 1243966390
)
# librdkafka metadata refresh interval (ms). 30s is aggressive but cheap —
# 9 producers × 2 RPCs/min ≈ 18 RPCs/min total, negligible for an idle Kafka.
KAFKA_METADATA_MAX_AGE_MS = 30000

# Topic tail (after `feeds.kafka.`) → Kafka topic produced by the rdkafka-out.
# `feeds.kafka.city.weather` is published into the `sim.smart_city.weather`
# topic — both Weather (smart-energy domain) and Visibility (smart-city
# domain) write here in the Python service.
LINK_TO_TOPIC = {
    "feeds.kafka.meter":         "sim.smart_energy.meter",
    "feeds.kafka.pv":            "sim.smart_energy.pv",
    "feeds.kafka.weather":       "sim.smart_energy.weather",
    "feeds.kafka.price":         "sim.smart_energy.price",
    "feeds.kafka.consumer":      "sim.smart_energy.consumer",
    "feeds.kafka.light":         "sim.smart_city.light",
    "feeds.kafka.traffic":       "sim.smart_city.traffic",
    "feeds.kafka.event":         "sim.smart_city.event",
    "feeds.kafka.city.weather":  "sim.smart_city.weather",
}


def linkin_id_for(link_name: str) -> str:
    return hashlib.sha1(f"kafka-linkin:{link_name}".encode()).hexdigest()[:16]


def find_node(nodes: list[dict], **filters) -> dict | None:
    for n in nodes:
        if all(n.get(k) == v for k, v in filters.items()):
            return n
    return None


def transform(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    tab = next((n for n in nodes if n.get("type") == "tab"), None)
    if not tab:
        raise SystemExit("no tab in kafka.json — refusing to render")
    out.append(tab)

    # Keep the comment + kafka-broker config (with broker URL update)
    for n in nodes:
        if n.get("type") == "comment":
            out.append(n)
        elif n.get("type") == "kafka-broker":
            n2 = dict(n)
            n2["broker"] = KAFKA_BROKERS
            n2["metadataMaxAgeMs"] = KAFKA_METADATA_MAX_AGE_MS
            out.append(n2)

    # Map each rdkafka-out by topic so we can wire link-ins to them by id.
    rdkafka_by_topic: dict[str, dict[str, Any]] = {}
    for n in nodes:
        if n.get("type") == "rdkafka out":
            topic = n.get("topic", "")
            rdkafka_by_topic[topic] = n
            # Drop any stale incoming wires; link-ins handle that now.
            out.append(dict(n))

    # Keep the debug node if present
    debug = next((n for n in nodes if n.get("type") == "debug"), None)
    if debug:
        out.append(debug)

    # Generate one link-in per topic-tail mapping
    y = 80
    missing_topics = []
    for link_name, topic in LINK_TO_TOPIC.items():
        rdkafka = rdkafka_by_topic.get(topic)
        if not rdkafka:
            missing_topics.append(topic)
            continue
        out.append({
            "id": linkin_id_for(link_name),
            "type": "link in",
            "z": tab["id"],
            "name": f"← {link_name}",
            "links": [],   # Node-RED resolves from link-out side
            "x": 120,
            "y": y,
            "wires": [[rdkafka["id"]]],
        })
        y += 60

    if missing_topics:
        raise SystemExit(
            f"missing rdkafka-out node(s) for topic(s): {missing_topics}. "
            f"available: {sorted(rdkafka_by_topic)}"
        )

    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    nodes = json.loads(args.out.read_text())
    new_nodes = transform(nodes)
    args.out.write_text(json.dumps(new_nodes, indent=4) + "\n")

    types: dict[str, int] = {}
    for n in new_nodes:
        types[n["type"]] = types.get(n["type"], 0) + 1
    print(f"wrote {args.out} — {len(new_nodes)} nodes")
    for t, c in sorted(types.items()):
        print(f"  {t}: {c}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
