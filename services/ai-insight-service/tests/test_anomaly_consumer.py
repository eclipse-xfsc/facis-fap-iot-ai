"""Tests for streaming anomaly detection logic (no Kafka dependency)."""

import json

from src.streaming.anomaly_consumer import (
    AnomalyEvent,
    AnomalyThresholds,
    RollingStats,
    StreamingAnomalyDetector,
)


class TestRollingStats:
    def test_empty_stats(self) -> None:
        stats = RollingStats()
        assert stats.count == 0
        assert stats.mean == 0.0
        assert stats.std_dev == 0.0

    def test_single_value(self) -> None:
        stats = RollingStats()
        stats.add(10.0)
        assert stats.count == 1
        assert stats.mean == 10.0
        assert stats.std_dev == 0.0

    def test_known_statistics(self) -> None:
        stats = RollingStats()
        for v in [2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0]:
            stats.add(v)
        assert stats.count == 8
        assert abs(stats.mean - 5.0) < 0.01
        assert abs(stats.std_dev - 2.0) < 0.1

    def test_z_score(self) -> None:
        stats = RollingStats()
        for v in [10.0, 10.0, 10.0, 10.0, 10.0]:
            stats.add(v)
        # All same values => std_dev = 0 => z_score = 0
        assert stats.z_score(10.0) == 0.0

    def test_window_eviction(self) -> None:
        stats = RollingStats(max_size=3)
        stats.add(1.0)
        stats.add(2.0)
        stats.add(3.0)
        assert stats.count == 3
        stats.add(100.0)
        assert stats.count == 3
        # Window is now [2, 3, 100], mean should be ~35
        assert stats.mean > 30.0


class TestAnomalyDetection:
    def test_process_message_builds_stats(self) -> None:
        detected: list[AnomalyEvent] = []
        detector = StreamingAnomalyDetector(
            bootstrap_servers="localhost:9092",
            thresholds=AnomalyThresholds(min_window_size=5, z_score_threshold=2.0),
            on_anomaly=detected.append,
        )

        # Feed normal readings
        for i in range(10):
            payload = json.dumps(
                {
                    "active_power_kw": 42.0 + (i % 3) * 0.1,
                    "timestamp": f"2026-04-07T12:{i:02d}:00Z",
                }
            ).encode()
            detector._process_message("sim.smart_energy.meter", "meter-001", payload)

        assert detector.stats_count > 0
        assert len(detected) == 0  # No anomalies in normal data

    def test_detects_anomaly(self) -> None:
        detected: list[AnomalyEvent] = []
        detector = StreamingAnomalyDetector(
            bootstrap_servers="localhost:9092",
            thresholds=AnomalyThresholds(
                min_window_size=5,
                z_score_threshold=2.0,
                cooldown_seconds=0,  # No cooldown for testing
            ),
            on_anomaly=detected.append,
        )

        # Build baseline (30 readings around 42 kW)
        for i in range(30):
            payload = json.dumps(
                {
                    "active_power_kw": 42.0,
                    "timestamp": f"2026-04-07T12:{i:02d}:00Z",
                }
            ).encode()
            detector._process_message("sim.smart_energy.meter", "meter-001", payload)

        # Inject spike (200 kW — way above normal)
        spike_payload = json.dumps(
            {
                "active_power_kw": 200.0,
                "timestamp": "2026-04-07T12:30:00Z",
            }
        ).encode()
        detector._process_message("sim.smart_energy.meter", "meter-001", spike_payload)

        assert len(detected) == 1
        assert detected[0].metric == "active_power_kw"
        assert detected[0].value == 200.0
        assert detected[0].z_score > 2.0

    def test_handles_bronze_envelope(self) -> None:
        detected: list[AnomalyEvent] = []
        detector = StreamingAnomalyDetector(
            bootstrap_servers="localhost:9092",
            thresholds=AnomalyThresholds(min_window_size=2, cooldown_seconds=0),
            on_anomaly=detected.append,
        )

        # Bronze envelope format (raw_payload is a JSON string)
        for i in range(5):
            inner = json.dumps({"active_power_kw": 42.0, "timestamp": "t"})
            envelope = json.dumps(
                {
                    "ingest_timestamp": "2026-04-07T12:00:00Z",
                    "source_topic": "sim.smart_energy.meter",
                    "raw_payload": inner,
                }
            ).encode()
            detector._process_message("topic", "key", envelope)

        assert detector.stats_count > 0
