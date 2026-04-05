"""
City weather/visibility data endpoints.

GET /api/v1/city-weather/current
GET /api/v1/city-weather/history
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from src.api.rest.dependencies import SimulationState, get_simulation_state
from src.api.rest.schemas import IntervalParam
from src.core.time_series import IntervalMinutes, TimeRange

router = APIRouter()


class CityWeatherReadingResponse(BaseModel):
    """Single city weather/visibility reading."""

    timestamp: str
    fog_index: float
    visibility: str
    sunrise_time: str
    sunset_time: str


class CityWeatherHistoryResponse(BaseModel):
    """Historical city weather/visibility readings."""

    readings: list[CityWeatherReadingResponse]
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


def _reading_to_response(reading) -> CityWeatherReadingResponse:
    """Convert internal visibility reading to API response."""
    return CityWeatherReadingResponse(
        timestamp=reading.timestamp.isoformat().replace("+00:00", "Z"),
        fog_index=round(reading.fog_index, 1),
        visibility=reading.visibility.value,
        sunrise_time=reading.sunrise_time,
        sunset_time=reading.sunset_time,
    )


@router.get("/city-weather/current", response_model=CityWeatherReadingResponse)
async def get_city_weather_current(
    state: SimulationState = Depends(get_simulation_state),
) -> CityWeatherReadingResponse:
    """
    Get current city weather/visibility reading.

    Returns the current simulated visibility conditions including fog index,
    visibility classification, and today's sunrise/sunset times.
    """
    simulator = state.get_visibility()
    if simulator is None:
        raise HTTPException(
            status_code=404, detail="City weather simulator not available"
        )

    current_time = state.engine.simulation_time
    point = simulator.generate_at(current_time)
    reading = point.value

    return _reading_to_response(reading)


@router.get("/city-weather/history", response_model=CityWeatherHistoryResponse)
async def get_city_weather_history(
    start_time: datetime | None = Query(
        default=None, description="Start time (ISO 8601)"
    ),
    end_time: datetime | None = Query(default=None, description="End time (ISO 8601)"),
    interval: IntervalParam = Query(
        default=IntervalParam.FIFTEEN_MIN, description="Data interval"
    ),
    limit: int = Query(default=100, ge=1, le=1000, description="Maximum results"),
    state: SimulationState = Depends(get_simulation_state),
) -> CityWeatherHistoryResponse:
    """
    Get historical city weather/visibility data.

    Returns historical visibility readings for the specified time range.
    If no time range is specified, returns the last 24 hours.
    """
    simulator = state.get_visibility()
    if simulator is None:
        raise HTTPException(
            status_code=404, detail="City weather simulator not available"
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
    from src.simulators.smart_city.visibility import VisibilitySimulator

    temp_simulator = VisibilitySimulator(
        entity_id=simulator._entity_id,
        rng=state.engine.rng,
        interval=internal_interval,
        city_id=simulator._city_id,
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

    return CityWeatherHistoryResponse(
        readings=response_readings,
        count=len(response_readings),
        limit=limit,
        has_more=has_more,
        start_time=start_time.isoformat().replace("+00:00", "Z"),
        end_time=end_time.isoformat().replace("+00:00", "Z"),
        interval=interval.value,
    )
