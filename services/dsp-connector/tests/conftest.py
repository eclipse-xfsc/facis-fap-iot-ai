"""Shared fixtures for the DSP connector test suite."""

from __future__ import annotations

from collections.abc import Iterator

import pytest


@pytest.fixture(autouse=True)
def _dsp_test_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Provide deterministic DSP env vars for every test.

    `TransferStore` requires `DSP_HMAC_SECRET` to be set (auto-generation
    is deliberately rejected — see `transfer_store.py` for the rationale).
    The test value is a fixed 64-hex-character string so cross-test signed
    URLs and Kafka access tokens are reproducible.
    """
    monkeypatch.setenv(
        "DSP_HMAC_SECRET",
        "0" * 64,  # 32 bytes hex; deterministic, never used in production
    )
    monkeypatch.setenv("DSP_DATA_API_BASE_URL", "https://ai-insight.test")
    monkeypatch.setenv("DSP_DEFAULT_TTL_SECONDS", "3600")
    monkeypatch.setenv("DSP_KAFKA_BOOTSTRAP", "kafka.test:9092")

    # Reset the lazy global store so each test sees a fresh TransferStore
    # constructed against the env above.
    import src.main as main_mod

    main_mod._transfer_store = None
    main_mod._negotiations.clear()
    yield
    main_mod._transfer_store = None
    main_mod._negotiations.clear()
