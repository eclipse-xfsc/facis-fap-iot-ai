"""
City event data endpoints.

GET /api/v1/events
GET /api/v1/events/{zone_id}/current
GET /api/v1/events/{zone_id}/history
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from src.api.rest.dependencies import SimulationState, get_simulation_state
from src.api.rest.schemas import IntervalParam
from src.core.time_series import IntervalMinutes, TimeRange

router = APIRouter()


class EventZoneInfo(BaseModel):
    """Basic information about an event zone."""

    zone_id: str


class EventListResponse(BaseModel):
    """Response for listing event zones."""

    zones: list[EventZoneInfo]
    count: int


class EventReadingResponse(BaseModel):
    """Single city event reading."""

    timestamp: str
    zone_id: str
    event_type: str
    severity: int
    active: bool


class EventHistoryResponse(BaseModel):
    """Historical city event readings."""

    zone_id: str
    readings: list[EventReadingResponse]
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


def _reading_to_response(reading) -> EventReadingResponse:
    """Convert internal city event reading to API response."""
    return EventReadingResponse(
        timestamp=reading.timestamp.isoformat().replace("+00:00", "Z"),
        zone_id=reading.zone_id,
        event_type=reading.event_type.value,
        severity=reading.severity.value,
        active=reading.active,
    )


@router.get("/events", response_model=EventListResponse)
async def list_event_zones(
    state: SimulationState = Depends(get_simulation_state),
) -> EventListResponse:
    """
    List all registered event zones.

    Returns information about all configured city event zone simulators.
    """
    zones = [EventZoneInfo(zone_id=zone_id) for zone_id in state.list_event_zones()]
    return EventListResponse(zones=zones, count=len(zones))


@router.get("/events/{zone_id}/current", response_model=EventReadingResponse)
async def get_event_current(
    zone_id: str,
    state: SimulationState = Depends(get_simulation_state),
) -> EventReadingResponse:
    """
    Get current city event reading.

    Returns the current simulated event status for the specified zone.
    """
    simulator = state.get_event(zone_id)
    if simulator is None:
        raise HTTPException(status_code=404, detail=f"Event zone '{zone_id}' not found")

    current_time = state.engine.simulation_time
    point = simulator.generate_at(current_time)
    reading = point.value

    return _reading_to_response(reading)


@router.get("/events/{zone_id}/history", response_model=EventHistoryResponse)
async def get_event_history(
    zone_id: str,
    start_time: datetime | None = Query(
        default=None, description="Start time (ISO 8601)"
    ),
    end_time: datetime | None = Query(default=None, description="End time (ISO 8601)"),
    interval: IntervalParam = Query(
        default=IntervalParam.FIFTEEN_MIN, description="Data interval"
    ),
    limit: int = Query(default=100, ge=1, le=1000, description="Maximum results"),
    state: SimulationState = Depends(get_simulation_state),
) -> EventHistoryResponse:
    """
    Get historical city event readings.

    Returns historical event readings for the specified time range.
    If no time range is specified, returns the last 24 hours.
    """
    simulator = state.get_event(zone_id)
    if simulator is None:
        raise HTTPException(status_code=404, detail=f"Event zone '{zone_id}' not found")

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
    from src.simulators.smart_city.event import CityEventSimulator

    temp_simulator = CityEventSimulator(
        entity_id=f"event-{zone_id}",
        rng=state.engine.rng,
        interval=internal_interval,
        city_id=simulator._city_id,
        zone_id=simulator._zone_id,
        mode=simulator._mode,
    )

    # Generate readings
    points = temp_simulator.generate_range(time_range)

    # Apply limit
    has_more = len(points) > limit
    points = points[:limit]

    # Convert to response format
    response_readings = [_reading_to_response(p.value) for p in points]

    return EventHistoryResponse(
        zone_id=zone_id,
        readings=response_readings,
        count=len(response_readings),
        limit=limit,
        has_more=has_more,
        start_time=start_time.isoformat().replace("+00:00", "Z"),
        end_time=end_time.isoformat().replace("+00:00", "Z"),
        interval=interval.value,
    )
