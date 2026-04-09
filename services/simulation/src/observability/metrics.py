"""Prometheus metrics for the FACIS Simulation Service."""

from __future__ import annotations

from prometheus_client import Counter, Histogram, make_asgi_app

# ---------------------------------------------------------------------------
# Simulation tick metrics
# ---------------------------------------------------------------------------

SIM_TICKS = Counter(
    "facis_sim_ticks_total",
    "Total simulation ticks generated",
    ["feed_type"],
)

SIM_PUBLISH_LATENCY = Histogram(
    "facis_sim_publish_latency_seconds",
    "Latency of publishing simulation data to downstream systems",
    ["protocol"],
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0],
)

# ---------------------------------------------------------------------------
# Kafka metrics
# ---------------------------------------------------------------------------

KAFKA_MESSAGES_SENT = Counter(
    "facis_kafka_messages_sent_total",
    "Total messages sent to Kafka",
    ["topic", "status"],
)

KAFKA_SEND_LATENCY = Histogram(
    "facis_kafka_send_latency_seconds",
    "Kafka message send latency",
    ["topic"],
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0],
)

# ---------------------------------------------------------------------------
# MQTT metrics
# ---------------------------------------------------------------------------

MQTT_MESSAGES_SENT = Counter(
    "facis_mqtt_messages_sent_total",
    "Total messages sent via MQTT",
    ["topic", "status"],
)

# ---------------------------------------------------------------------------
# Modbus metrics
# ---------------------------------------------------------------------------

MODBUS_REQUESTS = Counter(
    "facis_modbus_requests_total",
    "Total Modbus TCP requests handled",
    ["register_type"],
)


def create_metrics_app():
    """Create an ASGI app that serves /metrics for Prometheus scraping."""
    return make_asgi_app()
