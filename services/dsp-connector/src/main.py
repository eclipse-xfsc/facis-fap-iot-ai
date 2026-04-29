"""
FACIS DSP Connector — Main Entry Point

Implements the Eclipse Dataspace Protocol control plane services:
  - FR-DSP-001: Catalogue Service (SHOULD)
  - FR-DSP-002: Contract Negotiation (out of scope per SRS §3.2 — minimal stub)
  - FR-DSP-003: Transfer Process (MUST)

Run with: python -m src.main
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime
from uuid import uuid4

import uvicorn
from fastapi import FastAPI, HTTPException
from prometheus_client import Counter, make_asgi_app

from src.catalogue_store import query_catalogue
from src.models import (
    CatalogueRequest,
    CatalogueResponse,
    NegotiationProcess,
    NegotiationRequest,
    NegotiationState,
    TransferCreatedResponse,
    TransferProcess,
    TransferRequest,
    TransferState,
)
from src.transfer_store import TransferStore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("facis-dsp-connector")

# ---------------------------------------------------------------------------
# Prometheus metrics
# ---------------------------------------------------------------------------

CATALOGUE_REQUESTS = Counter(
    "facis_dsp_catalogue_requests_total", "Total catalogue requests"
)
TRANSFER_REQUESTS = Counter(
    "facis_dsp_transfer_requests_total", "Total transfer requests", ["format"]
)
TRANSFER_COMPLETIONS = Counter(
    "facis_dsp_transfer_completions_total", "Total completed transfers"
)
TRANSFER_ERRORS = Counter("facis_dsp_transfer_errors_total", "Total transfer errors")

# ---------------------------------------------------------------------------
# Global stores
# ---------------------------------------------------------------------------

_transfer_store: TransferStore | None = None
_negotiations: dict[str, NegotiationProcess] = {}


def _get_store() -> TransferStore:
    global _transfer_store
    if _transfer_store is None:
        _transfer_store = TransferStore(
            hmac_secret=os.getenv("DSP_HMAC_SECRET"),
            data_api_base_url=os.getenv(
                "DSP_DATA_API_BASE_URL", "https://ai-insight.facis.cloud"
            ),
            default_ttl_seconds=int(os.getenv("DSP_DEFAULT_TTL_SECONDS", "3600")),
            kafka_bootstrap=os.getenv("DSP_KAFKA_BOOTSTRAP"),
        )
    return _transfer_store


def create_app() -> FastAPI:
    """Create and configure the DSP Connector FastAPI application."""

    app = FastAPI(
        title="FACIS DSP Connector",
        description="Eclipse Dataspace Protocol connector for FACIS FAP IoT & AI",
        version="1.0.0",
        docs_url="/docs",
    )

    # -----------------------------------------------------------------------
    # Health
    # -----------------------------------------------------------------------

    @app.get("/api/v1/health", tags=["Health"])
    async def health() -> dict:
        store = _get_store()
        return {
            "status": "ok",
            "service": "dsp-connector",
            "transfers_count": len(store.list_all()),
        }

    # -----------------------------------------------------------------------
    # FR-DSP-001: Catalogue Service (SHOULD HAVE)
    # -----------------------------------------------------------------------

    @app.post(
        "/dsp/catalogue/request",
        response_model=CatalogueResponse,
        status_code=200,
        tags=["DSP Catalogue"],
        summary="Query dataset catalogue (FR-DSP-001)",
    )
    async def catalogue_request(body: CatalogueRequest) -> CatalogueResponse:
        """
        Returns available datasets and offers conforming to DSP 1.0.

        Supports filtering by assetType and dataset IDs, with cursor-based pagination.
        """
        CATALOGUE_REQUESTS.inc()

        filter_data = body.filter or {}
        page_data = body.page or {}

        return query_catalogue(
            asset_type=filter_data.get("assetType"),
            dataset_ids=filter_data.get("datasetIds"),
            limit=page_data.get("limit", 50),
            cursor=page_data.get("cursor"),
        )

    # -----------------------------------------------------------------------
    # FR-DSP-002: Contract Negotiation (OUT OF SCOPE per SRS §3.2 — stub)
    # -----------------------------------------------------------------------

    @app.post(
        "/dsp/negotiations",
        status_code=202,
        tags=["DSP Negotiation"],
        summary="Create negotiation (FR-DSP-002 — minimal stub, out of scope per SRS §3.2)",
    )
    async def create_negotiation(body: NegotiationRequest) -> dict:
        """
        Minimal negotiation stub. Per SRS §3.2, contract negotiation is out of scope.
        This endpoint auto-finalizes to provide an agreementId for transfer requests.
        """
        now = datetime.now(UTC).isoformat()
        neg_id = f"neg-{uuid4().hex[:12]}"
        agreement_id = f"agr-{uuid4().hex[:12]}"

        negotiation = NegotiationProcess(
            id=neg_id,
            state=NegotiationState.FINALIZED,
            agreementId=agreement_id,
            offerId=body.offerId,
            counterparty=body.counterparty,
            createdAt=now,
            updatedAt=now,
        )
        _negotiations[neg_id] = negotiation

        logger.info(f"Negotiation {neg_id} auto-finalized → agreement {agreement_id}")
        return {"negotiationId": neg_id}

    @app.get(
        "/dsp/negotiations/{negotiation_id}",
        response_model=NegotiationProcess,
        tags=["DSP Negotiation"],
        summary="Get negotiation state",
    )
    async def get_negotiation(negotiation_id: str) -> NegotiationProcess:
        neg = _negotiations.get(negotiation_id)
        if neg is None:
            raise HTTPException(
                status_code=404, detail=f"Negotiation {negotiation_id} not found"
            )
        return neg

    @app.post(
        "/dsp/negotiations/{negotiation_id}/terminate",
        tags=["DSP Negotiation"],
        summary="Terminate negotiation",
    )
    async def terminate_negotiation(negotiation_id: str) -> NegotiationProcess:
        neg = _negotiations.get(negotiation_id)
        if neg is None:
            raise HTTPException(
                status_code=404, detail=f"Negotiation {negotiation_id} not found"
            )
        now = datetime.now(UTC).isoformat()
        terminated = NegotiationProcess(
            id=neg.id,
            state=NegotiationState.TERMINATED,
            agreementId=neg.agreementId,
            offerId=neg.offerId,
            counterparty=neg.counterparty,
            createdAt=neg.createdAt,
            updatedAt=now,
        )
        _negotiations[negotiation_id] = terminated
        return terminated

    # -----------------------------------------------------------------------
    # FR-DSP-003: Transfer Process (MUST HAVE)
    # -----------------------------------------------------------------------

    @app.post(
        "/dsp/transfers",
        response_model=TransferCreatedResponse,
        status_code=202,
        tags=["DSP Transfer"],
        summary="Create transfer process (FR-DSP-003)",
    )
    async def create_transfer(body: TransferRequest) -> TransferCreatedResponse:
        """
        Create a new transfer process. Returns 202 with transferId.

        The transfer starts in REQUESTED state. The connector automatically
        provisions data plane access and transitions through
        REQUESTED → STARTED → COMPLETED.
        """
        store = _get_store()
        TRANSFER_REQUESTS.labels(format=body.format.value).inc()

        transfer = store.create(body)

        # Auto-complete the transfer (provision access parameters)
        try:
            store.start_and_complete(transfer.id)
            TRANSFER_COMPLETIONS.inc()
        except Exception as e:
            TRANSFER_ERRORS.inc()
            store.transition(transfer.id, TransferState.ERROR, reason=str(e))
            logger.error(f"Transfer {transfer.id} failed: {e}")

        return TransferCreatedResponse(transferId=transfer.id)

    @app.get(
        "/dsp/transfers/{transfer_id}",
        response_model=TransferProcess,
        tags=["DSP Transfer"],
        summary="Get transfer state and access object (FR-DSP-003)",
    )
    async def get_transfer(transfer_id: str) -> TransferProcess:
        """
        Returns current transfer state. When state is COMPLETED, the response
        includes the access object with data plane parameters (URL or Kafka connection).
        """
        store = _get_store()
        transfer = store.get(transfer_id)
        if transfer is None:
            raise HTTPException(
                status_code=404, detail=f"Transfer {transfer_id} not found"
            )
        return transfer

    @app.get(
        "/dsp/transfers",
        response_model=list[TransferProcess],
        tags=["DSP Transfer"],
        summary="List all transfers",
    )
    async def list_transfers() -> list[TransferProcess]:
        store = _get_store()
        return store.list_all()

    @app.post(
        "/dsp/transfers/{transfer_id}/suspend",
        response_model=TransferProcess,
        tags=["DSP Transfer"],
        summary="Suspend a transfer",
    )
    async def suspend_transfer(transfer_id: str) -> TransferProcess:
        store = _get_store()
        try:
            return store.transition(
                transfer_id, TransferState.SUSPENDED, reason="Suspended by consumer"
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    @app.post(
        "/dsp/transfers/{transfer_id}/terminate",
        response_model=TransferProcess,
        tags=["DSP Transfer"],
        summary="Terminate a transfer",
    )
    async def terminate_transfer(transfer_id: str) -> TransferProcess:
        store = _get_store()
        try:
            return store.transition(
                transfer_id, TransferState.TERMINATED, reason="Terminated by consumer"
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    # Prometheus metrics
    app.mount("/metrics", make_asgi_app())

    return app


def main() -> None:
    host = os.getenv("HTTP_HOST", "0.0.0.0")
    port = int(os.getenv("HTTP_PORT", "8090"))
    app = create_app()
    uvicorn.run(app, host=host, port=port, log_config=None)


if __name__ == "__main__":
    main()
