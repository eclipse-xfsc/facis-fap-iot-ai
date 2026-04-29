"""
Kafka consumer for streaming anomaly detection.

Consumes energy meter readings from Bronze Kafka topics, applies
statistical thresholds, and triggers anomaly-report insight requests
when readings exceed configurable bounds.

This implements the "streaming anomaly detection mode" required by
FR-AI-003 (Governed LLM Access to Data Lake).
"""

from __future__ import annotations

import json
import logging
import math
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from confluent_kafka import Consumer, KafkaError, KafkaException

logger = logging.getLogger(__name__)


@dataclass
class AnomalyThresholds:
    """Configurable thresholds for anomaly detection."""

    # Z-score threshold (standard deviations from mean)
    z_score_threshold: float = 2.0
    # Minimum number of readings before anomaly detection activates
    min_window_size: int = 30
    # Maximum window size for rolling statistics
    max_window_size: int = 1000
    # Cooldown period between anomaly triggers (seconds)
    cooldown_seconds: float = 300.0


@dataclass
class AnomalyEvent:
    """Detected anomaly event."""

    metric: str
    value: float
    mean: float
    std_dev: float
    z_score: float
    source_topic: str
    source_key: str
    timestamp: str


class RollingStats:
    """Efficient rolling mean and standard deviation tracker."""

    def __init__(self, max_size: int = 1000) -> None:
        self._values: deque[float] = deque(maxlen=max_size)
        self._sum: float = 0.0
        self._sum_sq: float = 0.0

    def add(self, value: float) -> None:
        if len(self._values) == self._values.maxlen:
            old = self._values[0]
            self._sum -= old
            self._sum_sq -= old * old
        self._values.append(value)
        self._sum += value
        self._sum_sq += value * value

    @property
    def count(self) -> int:
        return len(self._values)

    @property
    def mean(self) -> float:
        if not self._values:
            return 0.0
        return self._sum / len(self._values)

    @property
    def std_dev(self) -> float:
        n = len(self._values)
        if n < 2:
            return 0.0
        variance = (self._sum_sq / n) - (self._sum / n) ** 2
        return math.sqrt(max(0.0, variance))

    def z_score(self, value: float) -> float:
        sd = self.std_dev
        if sd == 0.0:
            return 0.0
        return abs(value - self.mean) / sd


class StreamingAnomalyDetector:
    """
    Kafka consumer that detects anomalies in real-time energy readings.

    On anomaly detection, invokes the provided callback (typically
    triggers an anomaly-report insight request).
    """

    # Metrics to monitor from energy meter readings
    MONITORED_METRICS = [
        "active_power_kw",
        "reactive_power_kvar",
        "voltage_v",
        "current_a",
    ]

    def __init__(
        self,
        *,
        bootstrap_servers: str,
        group_id: str = "facis-anomaly-detector",
        topics: list[str] | None = None,
        thresholds: AnomalyThresholds | None = None,
        on_anomaly: Callable[[AnomalyEvent], None] | None = None,
        security_protocol: str = "PLAINTEXT",
        ssl_ca_location: str | None = None,
        ssl_certificate_location: str | None = None,
        ssl_key_location: str | None = None,
    ) -> None:
        self._topics = topics or ["sim.smart_energy.meter"]
        self._thresholds = thresholds or AnomalyThresholds()
        self._on_anomaly = on_anomaly or self._default_anomaly_handler
        self._running = False
        self._thread: threading.Thread | None = None

        # Per-metric rolling statistics (keyed by "topic:key:metric")
        self._stats: dict[str, RollingStats] = {}

        # Cooldown tracking (keyed by "topic:key:metric")
        self._last_trigger: dict[str, float] = {}

        consumer_config: dict[str, Any] = {
            "bootstrap.servers": bootstrap_servers,
            "group.id": group_id,
            "auto.offset.reset": "latest",
            "enable.auto.commit": True,
            "security.protocol": security_protocol,
        }
        if ssl_ca_location:
            consumer_config["ssl.ca.location"] = ssl_ca_location
        if ssl_certificate_location:
            consumer_config["ssl.certificate.location"] = ssl_certificate_location
        if ssl_key_location:
            consumer_config["ssl.key.location"] = ssl_key_location

        self._consumer = Consumer(consumer_config)

    def start(self) -> None:
        """Start the anomaly detection consumer in a background thread."""
        if self._running:
            return
        self._running = True
        self._consumer.subscribe(self._topics)
        self._thread = threading.Thread(target=self._consume_loop, daemon=True)
        self._thread.start()
        logger.info(f"Streaming anomaly detector started on topics: {self._topics}")

    def stop(self) -> None:
        """Stop the consumer."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=10)
        try:
            self._consumer.close()
        except Exception:
            pass
        logger.info("Streaming anomaly detector stopped")

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def stats_count(self) -> int:
        """Number of active metric trackers."""
        return len(self._stats)

    def _consume_loop(self) -> None:
        """Main consumer loop."""
        while self._running:
            try:
                msg = self._consumer.poll(timeout=1.0)
                if msg is None:
                    continue
                err = msg.error()
                if err is not None:
                    if err.code() == KafkaError._PARTITION_EOF:
                        continue
                    logger.error(f"Kafka consumer error: {err}")
                    continue

                topic = msg.topic()
                if topic is None:
                    continue
                raw_key = msg.key()
                key = raw_key.decode("utf-8") if raw_key is not None else "unknown"

                self._process_message(
                    topic=topic,
                    key=key,
                    value=msg.value(),
                )

            except KafkaException as e:
                logger.error(f"Kafka exception: {e}")
                time.sleep(1)
            except Exception as e:
                logger.error(f"Unexpected error in consumer loop: {e}", exc_info=True)
                time.sleep(1)

    def _process_message(self, topic: str, key: str, value: bytes | None) -> None:
        """Process a single Kafka message and check for anomalies."""
        if not value:
            return

        try:
            payload = json.loads(value.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return

        # Extract the raw_payload if this is a Bronze envelope
        if "raw_payload" in payload and isinstance(payload["raw_payload"], str):
            try:
                payload = json.loads(payload["raw_payload"])
            except json.JSONDecodeError:
                return

        timestamp = payload.get("timestamp", "")

        for metric in self.MONITORED_METRICS:
            raw_value = payload.get(metric)
            if raw_value is None:
                continue
            try:
                value_f = float(raw_value)
            except (ValueError, TypeError):
                continue

            stat_key = f"{topic}:{key}:{metric}"

            # Get or create rolling stats tracker
            if stat_key not in self._stats:
                self._stats[stat_key] = RollingStats(
                    max_size=self._thresholds.max_window_size
                )

            stats = self._stats[stat_key]
            stats.add(value_f)

            # Check for anomaly only after minimum window
            if stats.count < self._thresholds.min_window_size:
                continue

            z = stats.z_score(value_f)
            if z <= self._thresholds.z_score_threshold:
                continue

            # Check cooldown
            now = time.monotonic()
            last = self._last_trigger.get(stat_key, 0.0)
            if now - last < self._thresholds.cooldown_seconds:
                continue

            # Fire anomaly
            self._last_trigger[stat_key] = now
            event = AnomalyEvent(
                metric=metric,
                value=value_f,
                mean=stats.mean,
                std_dev=stats.std_dev,
                z_score=z,
                source_topic=topic,
                source_key=key,
                timestamp=timestamp,
            )
            try:
                self._on_anomaly(event)
            except Exception as e:
                logger.error(f"Anomaly callback failed: {e}")

    @staticmethod
    def _default_anomaly_handler(event: AnomalyEvent) -> None:
        logger.warning(
            f"ANOMALY DETECTED: {event.metric}={event.value:.2f} "
            f"(mean={event.mean:.2f}, std={event.std_dev:.2f}, z={event.z_score:.2f}) "
            f"from {event.source_topic}:{event.source_key} at {event.timestamp}"
        )
