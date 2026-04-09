# =============================================================================
# FACIS FAP IoT & AI — SFTP Ingestion Service
# Multi-stage production Dockerfile
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1 — Builder
# ---------------------------------------------------------------------------
# Pin to digest for supply-chain safety (python:3.11-slim as of 2026-04-09)
FROM python:3.11-slim@sha256:b1b81d67b8df73bf6067191790c233ef9e598b863fc1ccf447956138ca466d99 AS builder

WORKDIR /build

RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc librdkafka-dev && \
    rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./

RUN pip install --no-cache-dir build && \
    pip wheel --no-cache-dir --wheel-dir /wheels .

# ---------------------------------------------------------------------------
# Stage 2 — Runtime
# ---------------------------------------------------------------------------
FROM python:3.11-slim@sha256:b1b81d67b8df73bf6067191790c233ef9e598b863fc1ccf447956138ca466d99 AS runtime

LABEL org.opencontainers.image.title="facis-sftp-ingestion-service" \
      org.opencontainers.image.description="SFTP file ingestion service for the FACIS FAP IoT & AI platform" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.licenses="Apache-2.0"

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends librdkafka1 curl && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /wheels /tmp/wheels
RUN pip install --no-cache-dir --no-deps /tmp/wheels/* && \
    rm -rf /tmp/wheels && \
    pip cache purge 2>/dev/null; true

COPY src/ ./src/

RUN groupadd -g 1000 ingestion && \
    useradd -u 1000 -g 1000 -m -s /bin/false ingestion && \
    chown -R 1000:1000 /app

USER 1000

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HTTP_HOST=0.0.0.0 \
    HTTP_PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/v1/health')"]

CMD ["python", "-m", "src.main"]
