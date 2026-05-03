"""
FACIS SFTP Ingestion Service — Main Entry Point

Polls an SFTP directory for new data files, wraps them in Bronze
envelope format, and publishes to Kafka for downstream NiFi/Trino
ingestion into the Bronze Iceberg layer.

Run with: python -m src.main
"""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager, suppress

import uvicorn
from fastapi import FastAPI
from prometheus_client import Counter, Histogram, make_asgi_app

from src.config import load_settings
from src.kafka_publisher import IngestKafkaPublisher
from src.sftp_poller import SftpPoller

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("facis-sftp-ingestion")

# ---------------------------------------------------------------------------
# Prometheus metrics
# ---------------------------------------------------------------------------

FILES_INGESTED = Counter(
    "facis_sftp_files_ingested_total",
    "Total files successfully ingested via SFTP",
    ["extension"],
)

RECORDS_PUBLISHED = Counter(
    "facis_sftp_records_published_total",
    "Total records published to Kafka from SFTP files",
)

POLL_ERRORS = Counter(
    "facis_sftp_poll_errors_total",
    "Total SFTP poll cycle errors",
)

POLL_DURATION = Histogram(
    "facis_sftp_poll_duration_seconds",
    "Duration of each SFTP poll cycle",
    buckets=[0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0],
)

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------

_poller: SftpPoller | None = None
_publisher: IngestKafkaPublisher | None = None
_poll_task: asyncio.Task | None = None
_running = False


async def _poll_loop() -> None:
    """Background loop that polls SFTP and publishes to Kafka."""
    global _running
    settings = load_settings()

    while _running:
        try:
            t0 = time.monotonic()
            envelopes = _poller.poll()  # type: ignore[union-attr]
            elapsed = time.monotonic() - t0
            POLL_DURATION.observe(elapsed)

            if envelopes:
                topic = settings.ingest.default_topic
                for env in envelopes:
                    _publisher.publish(topic, env["kafka_key"], env)  # type: ignore[union-attr]
                _publisher.flush()  # type: ignore[union-attr]

                RECORDS_PUBLISHED.inc(len(envelopes))

                # Count files by extension
                seen_files: set[str] = set()
                for env in envelopes:
                    key = env["kafka_key"]
                    if key not in seen_files:
                        seen_files.add(key)
                        ext = key.rsplit(".", 1)[-1] if "." in key else "unknown"
                        FILES_INGESTED.labels(extension=ext).inc()

                logger.info(
                    f"Poll cycle: {len(seen_files)} file(s), "
                    f"{len(envelopes)} record(s) published in {elapsed:.1f}s"
                )

                errors = _publisher.get_and_clear_errors()  # type: ignore[union-attr]
                if errors:
                    logger.warning(f"Delivery errors: {errors}")

        except Exception as e:
            POLL_ERRORS.inc()
            logger.error(f"Poll cycle error: {e}", exc_info=True)

        await asyncio.sleep(settings.sftp.poll_interval_seconds)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global _poller, _publisher, _poll_task, _running

    settings = load_settings()

    _poller = SftpPoller(settings.sftp, settings.ingest)
    _publisher = IngestKafkaPublisher(settings.kafka)
    _running = True
    _poll_task = asyncio.create_task(_poll_loop())

    logger.info(
        f"SFTP ingestion started: polling {settings.sftp.host}:{settings.sftp.port}"
        f"{settings.sftp.remote_path} every {settings.sftp.poll_interval_seconds}s"
    )

    yield

    _running = False
    if _poll_task:
        _poll_task.cancel()
        with suppress(asyncio.CancelledError):
            await _poll_task
    if _publisher:
        _publisher.flush(timeout=5.0)

    logger.info("SFTP ingestion stopped")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="FACIS SFTP Ingestion Service",
        version="1.0.0",
        docs_url="/docs",
        lifespan=lifespan,
    )

    @app.get("/api/v1/health", tags=["health"])
    async def health() -> dict:
        return {
            "status": "ok",
            "service": "sftp-ingestion-service",
            "polling": _running,
        }

    # Prometheus metrics
    app.mount("/metrics", make_asgi_app())

    return app


def main() -> None:
    """Main entry point."""
    settings = load_settings()
    app = create_app()
    uvicorn.run(app, host=settings.http.host, port=settings.http.port, log_config=None)


if __name__ == "__main__":
    main()
