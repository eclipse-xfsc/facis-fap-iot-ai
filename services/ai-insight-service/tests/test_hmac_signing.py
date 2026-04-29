"""Tests for HMAC-SHA256 signed URL generation and verification."""

from datetime import UTC, datetime, timedelta

import pytest

from src.security.hmac_signing import HmacSigner


@pytest.fixture
def signer() -> HmacSigner:
    return HmacSigner(secret="test-secret-key-for-hmac-signing")


class TestGenerateSignedUrl:
    def test_returns_signed_url_response(self, signer: HmacSigner) -> None:
        result = signer.generate_signed_url(
            base_url="https://example.com",
            path="/api/v1/insights/anomaly-report",
            from_ts="2026-04-07T00:00:00Z",
            to_ts="2026-04-07T23:59:59Z",
        )
        assert result.url.startswith(
            "https://example.com/api/v1/insights/anomaly-report"
        )
        assert "token=" in result.url
        assert "expiresAt=" in result.url
        assert "from=" in result.url
        assert "to=" in result.url
        assert len(result.token) == 64  # SHA256 hex digest

    def test_custom_ttl(self, signer: HmacSigner) -> None:
        result = signer.generate_signed_url(
            base_url="https://example.com",
            path="/test",
            from_ts="2026-01-01T00:00:00Z",
            to_ts="2026-01-02T00:00:00Z",
            ttl_seconds=60,
        )
        expires = datetime.fromisoformat(result.expiresAt)
        assert expires > datetime.now(UTC)
        assert expires < datetime.now(UTC) + timedelta(seconds=120)


class TestVerifyToken:
    def test_valid_token(self, signer: HmacSigner) -> None:
        result = signer.generate_signed_url(
            base_url="https://example.com",
            path="/api/v1/data",
            from_ts="2026-04-07T00:00:00Z",
            to_ts="2026-04-07T23:59:59Z",
            ttl_seconds=3600,
        )
        assert signer.verify_token(
            method="GET",
            path="/api/v1/data",
            from_ts="2026-04-07T00:00:00Z",
            to_ts="2026-04-07T23:59:59Z",
            expires_at=result.expiresAt,
            token=result.token,
        )

    def test_tampered_token(self, signer: HmacSigner) -> None:
        result = signer.generate_signed_url(
            base_url="https://example.com",
            path="/api/v1/data",
            from_ts="2026-04-07T00:00:00Z",
            to_ts="2026-04-07T23:59:59Z",
        )
        assert not signer.verify_token(
            method="GET",
            path="/api/v1/data",
            from_ts="2026-04-07T00:00:00Z",
            to_ts="2026-04-07T23:59:59Z",
            expires_at=result.expiresAt,
            token="tampered" + result.token[8:],
        )

    def test_expired_token(self, signer: HmacSigner) -> None:
        expired_at = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
        token = signer._compute_hmac(
            "GET", "/test", "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z", expired_at
        )
        assert not signer.verify_token(
            method="GET",
            path="/test",
            from_ts="2026-01-01T00:00:00Z",
            to_ts="2026-01-02T00:00:00Z",
            expires_at=expired_at,
            token=token,
        )

    def test_wrong_path(self, signer: HmacSigner) -> None:
        result = signer.generate_signed_url(
            base_url="https://example.com",
            path="/api/v1/data",
            from_ts="2026-04-07T00:00:00Z",
            to_ts="2026-04-07T23:59:59Z",
        )
        assert not signer.verify_token(
            method="GET",
            path="/api/v1/OTHER",
            from_ts="2026-04-07T00:00:00Z",
            to_ts="2026-04-07T23:59:59Z",
            expires_at=result.expiresAt,
            token=result.token,
        )

    def test_different_secret_rejects(self) -> None:
        signer1 = HmacSigner(secret="secret-A")
        signer2 = HmacSigner(secret="secret-B")
        result = signer1.generate_signed_url(
            base_url="https://example.com",
            path="/test",
            from_ts="2026-01-01T00:00:00Z",
            to_ts="2026-01-02T00:00:00Z",
        )
        assert not signer2.verify_token(
            method="GET",
            path="/test",
            from_ts="2026-01-01T00:00:00Z",
            to_ts="2026-01-02T00:00:00Z",
            expires_at=result.expiresAt,
            token=result.token,
        )
