"""Dataset catalogue derived from the FACIS Gold layer tables."""

from __future__ import annotations

from src.models import CatalogueResponse, DatasetOffer

# ---------------------------------------------------------------------------
# Static catalogue of FACIS Gold layer datasets
# In production, this would query Trino's information_schema to discover
# available tables and build the catalogue dynamically.
# ---------------------------------------------------------------------------

FACIS_DATASETS: list[DatasetOffer] = [
    DatasetOffer(
        id="dataset:facis:net-grid-hourly",
        metadata={
            "title": "Net Grid Hourly KPIs",
            "description": "Hourly consumption, generation, net grid, and cost metrics",
            "assetType": "iot.timeseries",
            "format": "iceberg/parquet",
            "temporalResolution": "PT1H",
            "schema": "gold",
            "table": "net_grid_hourly",
        },
        offers=[
            {
                "id": "offer:facis:net-grid-hourly:read",
                "policySummary": {
                    "purpose": "analytics",
                    "rate_limit": "10 req/min",
                    "ttl": "PT1H",
                },
            }
        ],
    ),
    DatasetOffer(
        id="dataset:facis:energy-balance-hourly",
        metadata={
            "title": "Energy Balance Hourly",
            "description": "Hourly energy consumption and PV generation balance",
            "assetType": "iot.timeseries",
            "format": "iceberg/parquet",
            "temporalResolution": "PT1H",
            "schema": "gold",
            "table": "energy_balance_hourly",
        },
        offers=[
            {
                "id": "offer:facis:energy-balance-hourly:read",
                "policySummary": {
                    "purpose": "analytics",
                    "rate_limit": "10 req/min",
                    "ttl": "PT1H",
                },
            }
        ],
    ),
    DatasetOffer(
        id="dataset:facis:anomaly-candidates",
        metadata={
            "title": "Anomaly Candidates",
            "description": "Statistical outlier detection (z-score > 2σ) from energy meter readings",
            "assetType": "iot.analytics",
            "format": "iceberg/parquet",
            "schema": "gold",
            "table": "anomaly_candidates",
        },
        offers=[
            {
                "id": "offer:facis:anomaly-candidates:read",
                "policySummary": {
                    "purpose": "analytics",
                    "rate_limit": "10 req/min",
                    "ttl": "PT1H",
                },
            }
        ],
    ),
    DatasetOffer(
        id="dataset:facis:event-impact-daily",
        metadata={
            "title": "Event Impact Daily",
            "description": "Daily city event impact with severity and zone correlation",
            "assetType": "iot.timeseries",
            "format": "iceberg/parquet",
            "temporalResolution": "P1D",
            "schema": "gold",
            "table": "event_impact_daily",
        },
        offers=[
            {
                "id": "offer:facis:event-impact-daily:read",
                "policySummary": {
                    "purpose": "analytics",
                    "rate_limit": "10 req/min",
                    "ttl": "PT1H",
                },
            }
        ],
    ),
    DatasetOffer(
        id="dataset:facis:weather-hourly",
        metadata={
            "title": "Weather Hourly",
            "description": "Hourly weather conditions (temperature, irradiance, humidity, wind, cloud cover)",
            "assetType": "iot.timeseries",
            "format": "iceberg/parquet",
            "temporalResolution": "PT1H",
            "schema": "gold",
            "table": "weather_hourly",
        },
        offers=[
            {
                "id": "offer:facis:weather-hourly:read",
                "policySummary": {
                    "purpose": "analytics",
                    "rate_limit": "10 req/min",
                    "ttl": "PT1H",
                },
            }
        ],
    ),
    DatasetOffer(
        id="dataset:facis:streetlight-zone-hourly",
        metadata={
            "title": "Streetlight Zone Hourly",
            "description": "Hourly streetlight dimming and power metrics per zone",
            "assetType": "iot.timeseries",
            "format": "iceberg/parquet",
            "temporalResolution": "PT1H",
            "schema": "gold",
            "table": "streetlight_zone_hourly",
        },
        offers=[
            {
                "id": "offer:facis:streetlight-zone-hourly:read",
                "policySummary": {
                    "purpose": "analytics",
                    "rate_limit": "10 req/min",
                    "ttl": "PT1H",
                },
            }
        ],
    ),
]


def query_catalogue(
    asset_type: str | None = None,
    dataset_ids: list[str] | None = None,
    limit: int = 50,
    cursor: str | None = None,
) -> CatalogueResponse:
    """Query the FACIS dataset catalogue with optional filtering and pagination."""
    filtered = FACIS_DATASETS

    if asset_type:
        filtered = [d for d in filtered if d.metadata.get("assetType") == asset_type]

    if dataset_ids:
        id_set = set(dataset_ids)
        filtered = [d for d in filtered if d.id in id_set]

    # Simple cursor-based pagination (cursor = index)
    start = 0
    if cursor:
        try:
            start = int(cursor)
        except ValueError:
            start = 0

    page = filtered[start : start + limit]
    next_cursor = str(start + limit) if start + limit < len(filtered) else None

    return CatalogueResponse(datasets=page, nextCursor=next_cursor)
