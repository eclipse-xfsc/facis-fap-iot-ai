"""Tests for policy enforcement behavior."""

import pytest

from src.config import PolicyConfig
from src.security.policy import AccessContext, PolicyDeniedError, PolicyEnforcer


def test_policy_denies_missing_agreement() -> None:
    enforcer = PolicyEnforcer(PolicyConfig())
    context = AccessContext(
        agreement_id="", asset_id="asset-7", roles=("ai_insight_consumer",)
    )
    with pytest.raises(PolicyDeniedError):
        enforcer.enforce(context)


def test_policy_denies_when_required_role_missing() -> None:
    enforcer = PolicyEnforcer(PolicyConfig(required_roles=["ai_insight_consumer"]))
    context = AccessContext(
        agreement_id="agreement-1", asset_id="asset-7", roles=("viewer",)
    )
    with pytest.raises(PolicyDeniedError):
        enforcer.enforce(context)


def test_policy_allows_matching_role() -> None:
    enforcer = PolicyEnforcer(PolicyConfig(required_roles=["ai_insight_consumer"]))
    context = AccessContext(
        agreement_id="agreement-1",
        asset_id="asset-7",
        roles=("viewer", "ai_insight_consumer"),
    )
    enforcer.enforce(context)


# ---------------------------------------------------------------------------
# Table/Column ABAC tests
# ---------------------------------------------------------------------------

_TABLE_ACCESS_CONFIG = PolicyConfig(
    role_table_access={
        "analyst": {
            "net_grid_hourly": ["hour", "avg_consumption_kw", "avg_generation_kw"],
            "weather_hourly": ["hour", "avg_temperature_c"],
        },
        "admin": {
            "net_grid_hourly": [],  # all columns (empty = unrestricted)
            "weather_hourly": [],
            "anomaly_candidates": [],
        },
    }
)


def test_allowed_tables_returns_none_when_unconfigured() -> None:
    enforcer = PolicyEnforcer(PolicyConfig())
    context = AccessContext(agreement_id="a", asset_id="b", roles=("analyst",))
    assert enforcer.allowed_tables(context) is None


def test_allowed_tables_for_analyst() -> None:
    enforcer = PolicyEnforcer(_TABLE_ACCESS_CONFIG)
    context = AccessContext(agreement_id="a", asset_id="b", roles=("analyst",))
    tables = enforcer.allowed_tables(context)
    assert tables == {"net_grid_hourly", "weather_hourly"}


def test_allowed_tables_for_admin() -> None:
    enforcer = PolicyEnforcer(_TABLE_ACCESS_CONFIG)
    context = AccessContext(agreement_id="a", asset_id="b", roles=("admin",))
    tables = enforcer.allowed_tables(context)
    assert "anomaly_candidates" in tables


def test_allowed_tables_union_across_roles() -> None:
    enforcer = PolicyEnforcer(_TABLE_ACCESS_CONFIG)
    context = AccessContext(agreement_id="a", asset_id="b", roles=("analyst", "admin"))
    tables = enforcer.allowed_tables(context)
    assert tables == {"net_grid_hourly", "weather_hourly", "anomaly_candidates"}


def test_enforce_table_access_denies_unauthorized() -> None:
    enforcer = PolicyEnforcer(_TABLE_ACCESS_CONFIG)
    context = AccessContext(agreement_id="a", asset_id="b", roles=("analyst",))
    with pytest.raises(PolicyDeniedError, match="Access denied to table"):
        enforcer.enforce_table_access(context, "anomaly_candidates")


def test_enforce_table_access_allows_authorized() -> None:
    enforcer = PolicyEnforcer(_TABLE_ACCESS_CONFIG)
    context = AccessContext(agreement_id="a", asset_id="b", roles=("analyst",))
    enforcer.enforce_table_access(context, "net_grid_hourly")  # Should not raise


def test_allowed_columns_for_analyst() -> None:
    enforcer = PolicyEnforcer(_TABLE_ACCESS_CONFIG)
    context = AccessContext(agreement_id="a", asset_id="b", roles=("analyst",))
    columns = enforcer.allowed_columns(context, "net_grid_hourly")
    assert set(columns) == {"hour", "avg_consumption_kw", "avg_generation_kw"}


def test_filter_columns_restricts_to_allowed() -> None:
    enforcer = PolicyEnforcer(_TABLE_ACCESS_CONFIG)
    context = AccessContext(agreement_id="a", asset_id="b", roles=("analyst",))
    filtered = enforcer.filter_columns(
        context, "net_grid_hourly",
        ["hour", "avg_consumption_kw", "net_grid_kw", "avg_price_eur_per_kwh"],
    )
    assert filtered == ["hour", "avg_consumption_kw"]


def test_filter_columns_returns_all_when_unconfigured() -> None:
    enforcer = PolicyEnforcer(PolicyConfig())
    context = AccessContext(agreement_id="a", asset_id="b", roles=("analyst",))
    requested = ["hour", "avg_consumption_kw", "net_grid_kw"]
    assert enforcer.filter_columns(context, "any_table", requested) == requested
