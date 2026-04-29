"""DSP Protocol data models per Eclipse Dataspace Protocol 1.0."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Transfer Process (FR-DSP-003)
# ---------------------------------------------------------------------------


class TransferState(str, Enum):
    """Transfer process state machine per DSP 1.0."""

    REQUESTED = "REQUESTED"
    STARTED = "STARTED"
    COMPLETED = "COMPLETED"
    SUSPENDED = "SUSPENDED"
    TERMINATED = "TERMINATED"
    ERROR = "ERROR"


class TransferFormat(str, Enum):
    """Supported data plane transfer formats."""

    HTTP_PULL = "http-pull"
    KAFKA_STREAMING = "kafka-streaming"


class TransferRequest(BaseModel):
    """POST /dsp/transfers request body per SRS §7.1.3."""

    agreementId: str = Field(..., description="Agreement ID authorizing this transfer")
    assetId: str = Field(..., description="Dataset/asset identifier to transfer")
    format: TransferFormat = Field(default=TransferFormat.HTTP_PULL, description="Data plane format")
    parameters: dict[str, Any] = Field(
        default_factory=dict,
        description="Transfer parameters (e.g., windowFrom, windowTo for time-windowed pulls)",
    )


class AccessObject(BaseModel):
    """Data plane access parameters provisioned on transfer completion."""

    url: str | None = Field(default=None, description="HMAC-signed pull URL (http-pull format)")
    token: str | None = Field(default=None, description="Access token")
    expiresAt: str | None = Field(default=None, description="Token/URL expiry (ISO 8601)")  # noqa: N815
    # Kafka streaming fields
    bootstrap: str | None = Field(default=None, description="Kafka bootstrap servers (kafka-streaming format)")
    topic: str | None = Field(default=None, description="Kafka topic name")
    sasl: dict[str, str] | None = Field(default=None, description="SASL credentials")


class TransferProcess(BaseModel):
    """Transfer process state representation per SRS §7.1.3."""

    id: str
    agreementId: str  # noqa: N815
    assetId: str  # noqa: N815
    format: TransferFormat
    state: TransferState
    access: AccessObject | None = None
    reason: str | None = Field(default=None, description="Reason for error/termination")
    parameters: dict[str, Any] = Field(default_factory=dict)
    createdAt: str  # noqa: N815
    updatedAt: str  # noqa: N815


class TransferCreatedResponse(BaseModel):
    """POST /dsp/transfers 202 response."""

    transferId: str  # noqa: N815


# ---------------------------------------------------------------------------
# Catalogue (FR-DSP-001)
# ---------------------------------------------------------------------------


class CatalogueRequest(BaseModel):
    """POST /dsp/catalogue/request body per SRS §7.1.1."""

    providerId: str | None = Field(default=None, description="Provider DID or identifier")
    filter: dict[str, Any] | None = Field(default=None, description="Filter criteria (assetType, dataset IDs)")
    page: dict[str, Any] | None = Field(
        default_factory=lambda: {"limit": 50, "cursor": None},
        description="Pagination parameters",
    )


class DatasetOffer(BaseModel):
    """A dataset offer in the catalogue."""

    id: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    offers: list[dict[str, Any]] = Field(default_factory=list)


class CatalogueResponse(BaseModel):
    """POST /dsp/catalogue/request response per SRS §7.1.1."""

    datasets: list[DatasetOffer]
    nextCursor: str | None = None  # noqa: N815


# ---------------------------------------------------------------------------
# Negotiation (FR-DSP-002 — out of scope per SRS §3.2, minimal stub)
# ---------------------------------------------------------------------------


class NegotiationState(str, Enum):
    """Negotiation state machine per DSP 1.0."""

    REQUESTED = "REQUESTED"
    FINALIZED = "FINALIZED"
    TERMINATED = "TERMINATED"


class NegotiationRequest(BaseModel):
    """POST /dsp/negotiations request body."""

    counterparty: str = Field(..., description="Consumer DID or identifier")
    offerId: str = Field(..., description="Offer ID from catalogue")  # noqa: N815
    callbackAddress: str | None = Field(default=None, description="Callback URL for async updates")  # noqa: N815
    proposedTerms: dict[str, Any] = Field(default_factory=dict, description="Proposed usage terms")  # noqa: N815


class NegotiationProcess(BaseModel):
    """Negotiation state representation."""

    id: str
    state: NegotiationState
    agreementId: str | None = None  # noqa: N815
    offerId: str  # noqa: N815
    counterparty: str
    createdAt: str  # noqa: N815
    updatedAt: str  # noqa: N815
