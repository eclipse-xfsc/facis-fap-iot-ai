"""Kafka producer for publishing ingested SFTP records to Bronze topics."""

from __future__ import annotations

import json
import logging

from confluent_kafka import KafkaError, Producer

from src.config import KafkaConfig

logger = logging.getLogger(__name__)


class IngestKafkaPublisher:
    """Publishes Bronze envelope records to Kafka."""

    def __init__(self, config: KafkaConfig) -> None:
        producer_config: dict = {
            "bootstrap.servers": config.bootstrap_servers,
            "client.id": config.client_id,
            "security.protocol": config.security_protocol,
            "linger.ms": 100,
            "batch.num.messages": 500,
            "retry.backoff.ms": 500,
            "message.send.max.retries": 5,
        }

        if config.security_protocol == "SSL":
            if config.ssl_ca_location:
                producer_config["ssl.ca.location"] = config.ssl_ca_location
            if config.ssl_certificate_location:
                producer_config["ssl.certificate.location"] = (
                    config.ssl_certificate_location
                )
            if config.ssl_key_location:
                producer_config["ssl.key.location"] = config.ssl_key_location

        self._producer = Producer(producer_config)
        self._delivery_errors: list[str] = []

    def _delivery_callback(self, err: KafkaError | None, msg) -> None:
        if err:
            self._delivery_errors.append(str(err))
            logger.error(f"Kafka delivery failed: {err}")
        else:
            logger.debug(
                f"Delivered to {msg.topic()}[{msg.partition()}] @ {msg.offset()}"
            )

    def publish(self, topic: str, key: str, envelope: dict) -> None:
        """Publish a single Bronze envelope to Kafka."""
        self._producer.produce(
            topic=topic,
            key=key.encode("utf-8"),
            value=json.dumps(envelope, default=str).encode("utf-8"),
            callback=self._delivery_callback,
        )
        self._producer.poll(0)

    def flush(self, timeout: float = 10.0) -> int:
        """Flush pending messages. Returns number of messages still in queue."""
        remaining = self._producer.flush(timeout)
        if remaining > 0:
            logger.warning(f"{remaining} message(s) still in queue after flush")
        return remaining

    def get_and_clear_errors(self) -> list[str]:
        """Return and clear accumulated delivery errors."""
        errors = self._delivery_errors.copy()
        self._delivery_errors.clear()
        return errors
