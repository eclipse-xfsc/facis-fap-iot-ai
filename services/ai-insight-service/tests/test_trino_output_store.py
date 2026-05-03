"""Tests for TrinoOutputStore — verifies interface compatibility with InMemoryOutputStore."""

from src.storage.trino_output_store import TrinoOutputStore


class _FakeTrinoConfig:
    """Minimal config that prevents real Trino connections."""

    host = "localhost"
    port = 8080
    user = "test"
    http_scheme = "http"
    oidc_token_url = None
    oidc_client_id = None
    oidc_client_secret = None
    oidc_username = None
    oidc_password = None
    oidc_scope = None


def test_save_and_get() -> None:
    store = TrinoOutputStore(trino_config=_FakeTrinoConfig())
    record = store.save(
        insight_type="anomaly-report",
        agreement_id="agreement-1",
        asset_id="asset-7",
        input_data={"rows": 100},
        llm_model="gpt-4.1-mini",
        output_text="Summary text",
        structured_output={
            "summary": "test",
            "key_findings": [],
            "recommendations": [],
        },
    )
    assert record.id
    assert record.insight_type == "anomaly-report"
    assert record.llm_model == "gpt-4.1-mini"

    retrieved = store.get(record.id)
    assert retrieved is not None
    assert retrieved.id == record.id
    assert retrieved.output_text == "Summary text"


def test_latest_for_types() -> None:
    store = TrinoOutputStore(trino_config=_FakeTrinoConfig())
    store.save(
        insight_type="anomaly-report",
        agreement_id="a1",
        asset_id="b1",
        input_data={},
        llm_model="m1",
        output_text="first",
        structured_output={},
    )
    store.save(
        insight_type="anomaly-report",
        agreement_id="a1",
        asset_id="b1",
        input_data={},
        llm_model="m1",
        output_text="second",
        structured_output={},
    )
    store.save(
        insight_type="city-status",
        agreement_id="a1",
        asset_id="b1",
        input_data={},
        llm_model="m1",
        output_text="city",
        structured_output={},
    )

    latest = store.latest_for_types(("anomaly-report", "city-status", "missing"))
    assert latest["anomaly-report"] is not None
    assert latest["anomaly-report"].output_text == "second"
    assert latest["city-status"] is not None
    assert latest["city-status"].output_text == "city"
    assert latest["missing"] is None


def test_get_nonexistent_returns_none() -> None:
    store = TrinoOutputStore(trino_config=_FakeTrinoConfig())
    assert store.get("nonexistent-id") is None
