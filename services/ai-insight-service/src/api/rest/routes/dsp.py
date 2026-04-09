"""DSP HTTP Pull Profile endpoints — signed URL generation and data pull."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from src.security.hmac_middleware import HmacTokenValidator
from src.security.hmac_signing import HmacSigner, SignedUrlResponse

logger = logging.getLogger(__name__)

dsp_router = APIRouter(prefix="/api/v1/dsp", tags=["DSP HTTP Pull Profile"])

# ---------------------------------------------------------------------------
# Module-level signer (initialized via configure_dsp_router)
# ---------------------------------------------------------------------------

_signer: HmacSigner | None = None
_validator: HmacTokenValidator | None = None
_base_url: str = "https://ai-insight.facis.cloud"


def configure_dsp_router(
    secret: str | None = None,
    base_url: str = "https://ai-insight.facis.cloud",
    enabled: bool = True,
) -> None:
    """Initialize the DSP router's HMAC signer and validator."""
    global _signer, _validator, _base_url
    _signer = HmacSigner(secret=secret)
    _validator = HmacTokenValidator(_signer, enabled=enabled)
    _base_url = base_url


# ---------------------------------------------------------------------------
# Request/Response models
# ---------------------------------------------------------------------------


class CreatePullUrlRequest(BaseModel):
    """Request body for creating a signed pull URL."""

    path: str = Field(
        ...,
        description="Resource path (e.g., /api/v1/insights/anomaly-report)",
        examples=["/api/v1/insights/anomaly-report"],
    )
    method: str = Field(default="GET", description="HTTP method")
    from_ts: str = Field(
        ...,
        alias="from",
        description="Data window start (ISO 8601)",
        examples=["2026-04-07T00:00:00Z"],
    )
    to_ts: str = Field(
        ...,
        alias="to",
        description="Data window end (ISO 8601)",
        examples=["2026-04-07T23:59:59Z"],
    )
    ttl_seconds: int = Field(
        default=3600,
        ge=60,
        le=86400,
        description="URL validity period in seconds",
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@dsp_router.post(
    "/create-pull-url",
    response_model=SignedUrlResponse,
    summary="Generate a time-windowed HMAC-signed pull URL",
)
async def create_pull_url(
    request: Request,
    body: CreatePullUrlRequest,
) -> SignedUrlResponse:
    """
    Generate an HMAC-SHA256 signed URL for data access.

    The returned URL contains a time-windowed token that grants
    temporary access to the specified resource. The token encodes
    the HTTP method, path, data time window (from/to), and expiry.

    Requires a valid agreement and asset via policy headers.
    """
    if _signer is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="DSP signing not configured",
        )

    # Enforce policy — caller must present valid agreement/asset/role headers
    if _validator is not None and _validator._enabled:
        from src.config import load_config
        from src.security.policy import PolicyEnforcer

        config = load_config()
        enforcer = PolicyEnforcer(config.policy)
        ctx = enforcer.build_context(dict(request.headers))
        try:
            enforcer.enforce(ctx)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=str(e),
            ) from e

    return _signer.generate_signed_url(
        base_url=_base_url,
        path=body.path,
        method=body.method,
        from_ts=body.from_ts,
        to_ts=body.to_ts,
        ttl_seconds=body.ttl_seconds,
    )


@dsp_router.get(
    "/pull",
    summary="Validate HMAC token and return data access confirmation",
)
async def pull(
    request: Request,
    verified: dict[str, str] = Depends(_get_validator),
) -> dict[str, Any]:
    """
    Validate an HMAC-signed pull URL.

    This endpoint verifies the token and, if valid, confirms the
    data access parameters. In production, this would delegate to
    the appropriate insight endpoint for actual data retrieval.
    """
    return {
        "status": "authorized",
        "data_window": {
            "from": verified.get("from"),
            "to": verified.get("to"),
        },
        "expires_at": verified.get("expiresAt"),
    }


def _get_validator() -> HmacTokenValidator:
    """Get the configured validator or raise 503."""
    if _validator is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="DSP validation not configured",
        )
    return _validator
