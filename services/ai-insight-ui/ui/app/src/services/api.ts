/**
 * FACIS Simulation & AI Insight API service
 *
 * Base URLs are configurable via Vite env vars at build time:
 *   VITE_SIM_API_URL  — defaults to /api/sim  (ingress routes to facis-simulation)
 *   VITE_AI_API_URL   — defaults to /api/ai   (ingress routes to facis-ai-insight)
 *
 * Every function wraps its fetch in try/catch and returns null on failure so
 * callers can fall back to mock data without crashing the UI.
 */

const SIM_BASE: string = (import.meta.env?.VITE_SIM_API_URL as string) || '/api/sim'
const AI_BASE: string = (import.meta.env?.VITE_AI_API_URL as string) || '/api/ai'

// ─── Low-level helpers ────────────────────────────────────────────────────────

async function simGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SIM_BASE}${path}`)
    if (!res.ok) {
      console.warn(`[api] SIM ${path} → HTTP ${res.status}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn(`[api] SIM ${path} failed:`, err)
    return null
  }
}

async function aiGet<T>(path: string, headers?: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(`${AI_BASE}${path}`, {
      headers: {
        'x-agreement-id': 'facis-ui',
        'x-asset-id': 'facis-platform',
        'x-user-roles': 'ai_insight_consumer',
        ...headers
      }
    })
    if (!res.ok) {
      console.warn(`[api] AI ${path} → HTTP ${res.status}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn(`[api] AI ${path} failed:`, err)
    return null
  }
}

async function aiPost<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${AI_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agreement-id': 'facis-ui',
        'x-asset-id': 'facis-platform',
        'x-user-roles': 'ai_insight_consumer'
      },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      console.warn(`[api] AI POST ${path} → HTTP ${res.status}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn(`[api] AI POST ${path} failed:`, err)
    return null
  }
}

// ─── Simulation API types ─────────────────────────────────────────────────────

export interface SimMeter {
  meter_id: string
  type: string
  base_power_kw: number
  peak_power_kw: number
}

export interface SimMetersResponse {
  meters: SimMeter[]
  count: number
}

export interface SimMeterReadings {
  active_power_l1_w: number
  active_power_l2_w: number
  active_power_l3_w: number
  voltage_l1_v: number
  voltage_l2_v: number
  voltage_l3_v: number
  current_l1_a: number
  current_l2_a: number
  current_l3_a: number
  power_factor: number
  frequency_hz: number
  total_energy_kwh: number
}

export interface SimMeterCurrent {
  timestamp: string
  meter_id: string
  readings: SimMeterReadings
}

export interface SimMeterHistoryReading extends SimMeterReadings {
  timestamp: string
}

export interface SimMeterHistory {
  meter_id: string
  readings: SimMeterHistoryReading[]
}

export interface SimWeatherStation {
  station_id: string
  latitude: number
  longitude: number
}

export interface SimWeatherStationsResponse {
  stations: SimWeatherStation[]
  count: number
}

export interface SimWeatherConditions {
  temperature_c: number
  humidity_percent: number
  wind_speed_ms: number
  cloud_cover_percent: number
  ghi_w_m2: number
}

export interface SimWeatherCurrent {
  timestamp: string
  conditions: SimWeatherConditions
}

export interface SimWeatherHistoryReading extends SimWeatherConditions {
  timestamp: string
}

export interface SimWeatherHistory {
  station_id: string
  readings: SimWeatherHistoryReading[]
}

export interface SimPrice {
  timestamp: string
  price_eur_per_kwh: number
  tariff_type: string
}

export interface SimPriceCurrent {
  feed_id: string
  current: SimPrice
}

export interface SimPriceHistory {
  feed_id: string
  prices: SimPrice[]
}

export interface SimPVSystem {
  system_id: string
  nominal_capacity_kwp: number
}

export interface SimPVSystemsResponse {
  systems: SimPVSystem[]
  count: number
}

export interface SimPVReadings {
  power_kw: number
  irradiance_w_m2: number
  panel_temp_c: number
  efficiency: number
}

export interface SimPVCurrent {
  timestamp: string
  system_id: string
  readings: SimPVReadings
}

export interface SimPVHistoryReading extends SimPVReadings {
  timestamp: string
}

export interface SimPVHistory {
  system_id: string
  readings: SimPVHistoryReading[]
}

export interface SimDevice {
  device_id: string
  device_type: string
  rated_power_kw: number
  duty_cycle_pct: number
  operating_windows: unknown[]
}

export interface SimLoadsResponse {
  devices: SimDevice[]
  count: number
}

export interface SimLoadCurrent {
  timestamp: string
  device_id: string
  state: 'on' | 'off' | 'standby'
  power_kw: number
}

export interface SimLoadHistoryReading {
  timestamp: string
  state: 'on' | 'off' | 'standby'
  power_kw: number
}

export interface SimLoadHistory {
  device_id: string
  readings: SimLoadHistoryReading[]
}

export interface SimSimulationStatus {
  state: string
  simulation_time: string
  seed: number
  acceleration: number
}

export interface SimHealth {
  status: string
  service: string
  version: string
  timestamp: string
}

// ─── AI Insight API types ─────────────────────────────────────────────────────

export interface AiInsightLatest {
  latest: {
    'energy-summary'?: unknown
    'anomaly-report'?: unknown
    'city-status'?: unknown
  }
}

export interface AiHealth {
  status: string
  service: string
}

// ─── Simulation API functions ─────────────────────────────────────────────────

export function getMeters(): Promise<SimMetersResponse | null> {
  return simGet<SimMetersResponse>('/meters')
}

export function getMeterCurrent(meterId: string): Promise<SimMeterCurrent | null> {
  return simGet<SimMeterCurrent>(`/meters/${encodeURIComponent(meterId)}/current`)
}

export function getMeterHistory(meterId: string): Promise<SimMeterHistory | null> {
  return simGet<SimMeterHistory>(`/meters/${encodeURIComponent(meterId)}/history`)
}

export function getWeatherStations(): Promise<SimWeatherStationsResponse | null> {
  return simGet<SimWeatherStationsResponse>('/weather')
}

export function getWeatherCurrent(stationId: string): Promise<SimWeatherCurrent | null> {
  return simGet<SimWeatherCurrent>(`/weather/${encodeURIComponent(stationId)}/current`)
}

export function getWeatherHistory(stationId: string): Promise<SimWeatherHistory | null> {
  return simGet<SimWeatherHistory>(`/weather/${encodeURIComponent(stationId)}/history`)
}

export function getPriceCurrent(): Promise<SimPriceCurrent | null> {
  return simGet<SimPriceCurrent>('/prices/current')
}

export function getPriceHistory(): Promise<SimPriceHistory | null> {
  return simGet<SimPriceHistory>('/prices/history')
}

export function getPVSystems(): Promise<SimPVSystemsResponse | null> {
  return simGet<SimPVSystemsResponse>('/pv')
}

export function getPVCurrent(systemId: string): Promise<SimPVCurrent | null> {
  return simGet<SimPVCurrent>(`/pv/${encodeURIComponent(systemId)}/current`)
}

export function getPVHistory(systemId: string): Promise<SimPVHistory | null> {
  return simGet<SimPVHistory>(`/pv/${encodeURIComponent(systemId)}/history`)
}

export function getLoads(): Promise<SimLoadsResponse | null> {
  return simGet<SimLoadsResponse>('/loads')
}

export function getLoadCurrent(deviceId: string): Promise<SimLoadCurrent | null> {
  return simGet<SimLoadCurrent>(`/loads/${encodeURIComponent(deviceId)}/current`)
}

export function getLoadHistory(deviceId: string): Promise<SimLoadHistory | null> {
  return simGet<SimLoadHistory>(`/loads/${encodeURIComponent(deviceId)}/history`)
}

export function getSimulationStatus(): Promise<SimSimulationStatus | null> {
  return simGet<SimSimulationStatus>('/simulation/status')
}

export function getSimulationConfig(): Promise<unknown> {
  return simGet('/config')
}

export function getSimHealth(): Promise<SimHealth | null> {
  return simGet<SimHealth>('/health')
}

// ─── Smart City — Streetlights types ─────────────────────────────────────────

export interface SimStreetlight {
  light_id: string
  zone_id: string
  rated_power_w: number
}

export interface SimStreetlightList {
  streetlights: SimStreetlight[]
  count: number
}

export interface SimStreetlightCurrent {
  timestamp: string
  light_id: string
  zone_id: string
  dimming_level_pct: number
  power_w: number
}

export interface SimStreetlightHistoryReading {
  timestamp: string
  dimming_level_pct: number
  power_w: number
  zone_id: string
}

export interface SimStreetlightHistory {
  light_id: string
  readings: SimStreetlightHistoryReading[]
}

// ─── Smart City — Traffic types ───────────────────────────────────────────────

export interface SimTrafficZone {
  zone_id: string
}

export interface SimTrafficZoneList {
  zones: SimTrafficZone[]
  count: number
}

export interface SimTrafficCurrent {
  timestamp: string
  zone_id: string
  traffic_index: number
}

export interface SimTrafficHistoryReading {
  timestamp: string
  traffic_index: number
}

export interface SimTrafficHistory {
  zone_id: string
  readings: SimTrafficHistoryReading[]
}

// ─── Smart City — Events types ────────────────────────────────────────────────

export interface SimEventZone {
  zone_id: string
}

export interface SimEventZoneList {
  zones: SimEventZone[]
  count: number
}

export interface SimEventCurrent {
  timestamp: string
  zone_id: string
  event_type: string
  severity: string
  active: boolean
}

export interface SimEventHistoryReading {
  timestamp: string
  event_type: string
  severity: string
  active: boolean
}

export interface SimEventHistory {
  zone_id: string
  readings: SimEventHistoryReading[]
}

// ─── Smart City — Weather/Visibility types ────────────────────────────────────

export interface SimCityWeatherCurrent {
  timestamp: string
  fog_index: number
  visibility: number
  sunrise_time: string
  sunset_time: string
}

export interface SimCityWeatherHistoryReading {
  timestamp: string
  fog_index: number
  visibility: number
  sunrise_time: string
  sunset_time: string
}

export interface SimCityWeatherHistory {
  readings: SimCityWeatherHistoryReading[]
}

// ─── Smart City — Streetlights functions ──────────────────────────────────────

export function getStreetlights(): Promise<SimStreetlightList | null> {
  return simGet<SimStreetlightList>('/streetlights')
}

export function getStreetlightCurrent(lightId: string): Promise<SimStreetlightCurrent | null> {
  return simGet<SimStreetlightCurrent>(`/streetlights/${encodeURIComponent(lightId)}/current`)
}

export function getStreetlightHistory(lightId: string): Promise<SimStreetlightHistory | null> {
  return simGet<SimStreetlightHistory>(`/streetlights/${encodeURIComponent(lightId)}/history`)
}

// ─── Smart City — Traffic functions ──────────────────────────────────────────

export function getTrafficZones(): Promise<SimTrafficZoneList | null> {
  return simGet<SimTrafficZoneList>('/traffic')
}

export function getTrafficCurrent(zoneId: string): Promise<SimTrafficCurrent | null> {
  return simGet<SimTrafficCurrent>(`/traffic/${encodeURIComponent(zoneId)}/current`)
}

export function getTrafficHistory(zoneId: string): Promise<SimTrafficHistory | null> {
  return simGet<SimTrafficHistory>(`/traffic/${encodeURIComponent(zoneId)}/history`)
}

// ─── Smart City — Events functions ───────────────────────────────────────────

export function getCityEvents(): Promise<SimEventZoneList | null> {
  return simGet<SimEventZoneList>('/events')
}

export function getCityEventCurrent(zoneId: string): Promise<SimEventCurrent | null> {
  return simGet<SimEventCurrent>(`/events/${encodeURIComponent(zoneId)}/current`)
}

export function getCityEventHistory(zoneId: string): Promise<SimEventHistory | null> {
  return simGet<SimEventHistory>(`/events/${encodeURIComponent(zoneId)}/history`)
}

// ─── Smart City — Weather/Visibility functions ────────────────────────────────

export function getCityWeatherCurrent(): Promise<SimCityWeatherCurrent | null> {
  return simGet<SimCityWeatherCurrent>('/city-weather/current')
}

export function getCityWeatherHistory(): Promise<SimCityWeatherHistory | null> {
  return simGet<SimCityWeatherHistory>('/city-weather/history')
}

// ─── AI Insight API functions ─────────────────────────────────────────────────

export function getInsightLatest(): Promise<AiInsightLatest | null> {
  return aiGet<AiInsightLatest>('/insights/latest')
}

export function postInsightEnergySummary(startTs: string, endTs: string): Promise<any> {
  return aiPost('/insights/energy-summary', { start_ts: startTs, end_ts: endTs, timezone: 'UTC' })
}

export function postInsightAnomalyReport(startTs: string, endTs: string): Promise<any> {
  return aiPost('/insights/anomaly-report', { start_ts: startTs, end_ts: endTs, timezone: 'UTC' })
}

export function postInsightCityStatus(startTs: string, endTs: string): Promise<any> {
  return aiPost('/insights/city-status', { start_ts: startTs, end_ts: endTs, timezone: 'UTC' })
}

export function getAiHealth(): Promise<AiHealth | null> {
  return aiGet<AiHealth>('/health')
}

// ─── Simulation control ───────────────────────────────────────────────────────

export interface SimConfig {
  seed: number
  time_acceleration: number
  start_time: string
  simulation_state: string
  registered_meters: number
  registered_price_feeds: number
}

export interface SimPriceForecast {
  feed_id: string
  forecast: SimPrice[]
}

export function getSimConfig(): Promise<SimConfig | null> {
  return simGet<SimConfig>('/config')
}

export function getPriceForecast(): Promise<SimPriceForecast | null> {
  return simGet<SimPriceForecast>('/prices/forecast')
}

async function simPost<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SIM_BASE}${path}`, { method: 'POST' })
    if (!res.ok) {
      console.warn(`[api] SIM POST ${path} → HTTP ${res.status}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn(`[api] SIM POST ${path} failed:`, err)
    return null
  }
}

export function startSimulation(): Promise<unknown> {
  return simPost('/simulation/start')
}

export function pauseSimulation(): Promise<unknown> {
  return simPost('/simulation/pause')
}

export function resetSimulation(): Promise<unknown> {
  return simPost('/simulation/reset')
}
