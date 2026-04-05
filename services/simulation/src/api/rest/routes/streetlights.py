"""
Streetlight data endpoints.

GET /api/v1/streetlights
GET /api/v1/streetlights/{light_id}/current
GET /api/v1/streetlights/{light_id}/history
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from src.api.rest.dependencies import SimulationState, get_simulation_state
from src.api.rest.schemas import IntervalParam
from src.core.time_series import IntervalMinutes, TimeRange

router = APIRouter()


class StreetlightInfo(BaseModel):
    """Basic information about a streetlight."""

    light_id: str
    zone_id: str
    rated_power_w: float


class StreetlightListResponse(BaseModel):
    """Response for listing streetlights."""

    streetlights: list[StreetlightInfo]
    count: int


class StreetlightReadingResponse(BaseModel):
    """Single streetlight reading."""

    timestamp: str
    light_id: str
    zone_id: str
    dimming_level_pct: float
    power_w: float


class StreetlightHistoryResponse(BaseModel):
    """Historical streetlight readings."""

    light_id: str
    readings: list[StreetlightReadingResponse]
    count: int
    limit: int
    has_more: bool
    start_time: str
    end_time: str
    interval: str


def _convert_interval(interval: IntervalParam) -> IntervalMinutes:
    """Convert API interval parameter to internal IntervalMinutes."""
    if interval == IntervalParam.ONE_HOUR:
        return IntervalMinutes.ONE_HOUR
    return IntervalMinutes.FIFTEEN_MINUTES


def _reading_to_response(reading) -> StreetlightReadingResponse:
    """Convert internal streetlight reading to API response."""
    return StreetlightReadingResponse(
        timestamp=reading.timestamp.isoformat().replace("+00:00", "Z"),
        light_id=reading.light_id,
        zone_id=reading.zone_id,
        dimming_level_pct=round(reading.dimming_level_pct, 1),
        power_w=round(reading.power_w, 1),
    )


@router.get("/streetlights", response_model=StreetlightListResponse)
async def list_streetlights(
    state: SimulationState = Depends(get_simulation_state),
) -> StreetlightListResponse:
    """
    List all registered streetlights.

    Returns information about all configured streetlight simulators.
    """
    streetlights = []
    for light_id in state.list_streetlights():
        simulator = state.get_streetlight(light_id)
        if simulator:
            streetlights.append(
                StreetlightInfo(
                    light_id=light_id,
                    zone_id=simulator._config.zone_id,
                    rated_power_w=simulator._config.rated_power_w,
                )
            )

    return StreetlightListResponse(streetlights=streetlights, count=len(streetlights))


@router.get(
    "/streetlights/{light_id}/current", response_model=StreetlightReadingResponse
)
async def get_streetlight_current(
    light_id: str,
    state: SimulationState = Depends(get_simulation_state),
) -> StreetlightReadingResponse:
    """
    Get current streetlight reading.

    Returns the current simulated reading for the specified streetlight.
    """
    simulator = state.get_streetlight(light_id)
    if simulator is None:
        raise HTTPException(
            status_code=404, detail=f"Streetlight '{light_id}' not found"
        )

    current_time = state.engine.simulation_time
    point = simulator.generate_at(current_time)
    reading = point.value

    return _reading_to_response(reading)


@router.get(
    "/streetlights/{light_id}/history", response_model=StreetlightHistoryResponse
)
async def get_streetlight_history(
    light_id: str,
    start_time: datetime | None = Query(
        default=None, description="Start time (ISO 8601)"
    ),
    end_time: datetime | None = Query(default=None, description="End time (ISO 8601)"),
    interval: IntervalParam = Query(
        default=IntervalParam.FIFTEEN_MIN, description="Data interval"
    ),
    limit: int = Query(default=100, ge=1, le=1000, description="Maximum results"),
    state: SimulationState = Depends(get_simulation_state),
) -> StreetlightHistoryResponse:
    """
    Get historical streetlight readings.

    Returns historical readings for the specified time range.
    If no time range is specified, returns the last 24 hours.
    """
    simulator = state.get_streetlight(light_id)
    if simulator is None:
        raise HTTPException(
            status_code=404, detail=f"Streetlight '{light_id}' not found"
        )

    # Default time range: last 24 hours from current simulation time
    current_time = state.engine.simulation_time
    if end_time is None:
        end_time = current_time
    if start_time is None:
        start_time = end_time - timedelta(hours=24)

    # Ensure timezone awareness
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=UTC)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=UTC)

    # Create time range
    time_range = TimeRange(start=start_time, end=end_time)

    # Convert interval
    internal_interval = _convert_interval(interval)

    # Create a temporary simulator with the requested interval
    from src.simulators.smart_city.streetlight import StreetlightSimulator

    temp_simulator = StreetlightSimulator(
        entity_id=light_id,
        rng=state.engine.rng,
        interval=internal_interval,
        config=simulator._config,
        city_id=simulator._city_id,
        site_id=simulator._site_id,
        latitude=simulator._latitude,
        longitude=simulator._longitude,
    )

    # Generate readings
    points = temp_simulator.generate_range(time_range)

    # Apply limit
    has_more = len(points) > limit
    points = points[:limit]

    # Convert to response format
    response_readings = [_reading_to_response(p.value) for p in points]

    return StreetlightHistoryResponse(
        light_id=light_id,
        readings=response_readings,
        count=len(response_readings),
        limit=limit,
        has_more=has_more,
        start_time=start_time.isoformat().replace("+00:00", "Z"),
        end_time=end_time.isoformat().replace("+00:00", "Z"),
        interval=interval.value,
    )
