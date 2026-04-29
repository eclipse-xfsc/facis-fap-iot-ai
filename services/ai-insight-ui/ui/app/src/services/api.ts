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

// Routes whose ORCE flows enforce caller authorization via Keycloak userinfo
// (admin proxy, schemas, etc.). Forwards the user's current access token.
async function authedGet<T>(path: string): Promise<T | null> {
  try {
    const { getAccessToken } = await import('@/auth')
    const token = getAccessToken()
    const res = await fetch(`${SIM_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (!res.ok) {
      console.warn(`[api] AUTHED ${path} → HTTP ${res.status}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn(`[api] AUTHED ${path} failed:`, err)
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
//
// The deployed simulation REST flow returns shapes the colleague's UI types
// don't quite match: the list endpoints (`/meters`, `/pv`, `/loads`) return
// flat arrays of CURRENT readings, `/weather` and `/prices` return single
// snapshots, and there are no `/:id/current`, `/:id/history`, `/prices/*`
// sub-endpoints (all 404). The functions below wrap those raw shapes into the
// `{meters, count}` / `{stations, count}` / etc. catalogs the views expect, so
// existing view code (`if (resp?.meters?.length) …`) keeps working.

interface RawMeterCurrent { meter_id: string; site_id?: string; timestamp: string; readings: SimMeterReadings }
interface RawPVCurrent { system_id: string; site_id?: string; timestamp: string; readings: SimPVReadings }
interface RawLoadCurrent { device_id: string; device_type: string; device_state?: string; device_power_kw?: number; timestamp: string }
interface RawWeatherSnapshot { site_id: string; timestamp: string; location?: { latitude: number; longitude: number }; conditions: SimWeatherConditions & { wind_direction_deg?: number; dni_w_m2?: number } }
interface RawPriceSnapshot { feed_id: string; timestamp: string; price_eur_per_kwh: number; tariff_type: string }

async function getRawMeterList(): Promise<RawMeterCurrent[]> {
  const resp = await simGet<unknown>('/meters')
  return Array.isArray(resp) ? (resp as RawMeterCurrent[]) : []
}
async function getRawPVList(): Promise<RawPVCurrent[]> {
  const resp = await simGet<unknown>('/pv')
  return Array.isArray(resp) ? (resp as RawPVCurrent[]) : []
}
async function getRawLoadList(): Promise<RawLoadCurrent[]> {
  const resp = await simGet<unknown>('/loads')
  return Array.isArray(resp) ? (resp as RawLoadCurrent[]) : []
}

export async function getMeters(): Promise<SimMetersResponse | null> {
  const raw = await getRawMeterList()
  if (raw.length === 0) return null
  return {
    meters: raw.map((r) => ({
      meter_id: r.meter_id,
      type: 'janitza-umg96rm',
      base_power_kw: 0,
      peak_power_kw: 0,
    })),
    count: raw.length,
  }
}

export function getMeterCurrent(meterId: string): Promise<SimMeterCurrent | null> {
  return simGet<SimMeterCurrent>(`/meters/${encodeURIComponent(meterId)}/current`)
}

export function getMeterHistory(meterId: string): Promise<SimMeterHistory | null> {
  // No /history endpoint in the simulation REST flow; this 404s and returns null.
  return simGet<SimMeterHistory>(`/meters/${encodeURIComponent(meterId)}/history`)
}

export async function getWeatherStations(): Promise<SimWeatherStationsResponse | null> {
  const raw = await simGet<RawWeatherSnapshot>('/weather')
  if (!raw || !raw.site_id) return null
  return {
    stations: [{
      station_id: raw.site_id,
      latitude: raw.location?.latitude ?? 0,
      longitude: raw.location?.longitude ?? 0,
    }],
    count: 1,
  }
}

export async function getWeatherCurrent(stationId: string): Promise<SimWeatherCurrent | null> {
  // /weather/:id/current does not exist; pull the single-station snapshot.
  const raw = await simGet<RawWeatherSnapshot>('/weather')
  if (!raw || raw.site_id !== stationId) return null
  return { timestamp: raw.timestamp, conditions: raw.conditions }
}

export function getWeatherHistory(_stationId: string): Promise<SimWeatherHistory | null> {
  return Promise.resolve(null)  // no /history endpoint
}

export async function getPriceCurrent(): Promise<SimPriceCurrent | null> {
  // The deployed flow exposes /prices (single snapshot), not /prices/current.
  const raw = await simGet<RawPriceSnapshot>('/prices')
  if (!raw || !raw.feed_id) return null
  return {
    feed_id: raw.feed_id,
    current: {
      timestamp: raw.timestamp,
      price_eur_per_kwh: raw.price_eur_per_kwh,
      tariff_type: raw.tariff_type,
    },
  }
}

export function getPriceHistory(): Promise<SimPriceHistory | null> {
  return Promise.resolve(null)  // no /prices/history endpoint
}

export async function getPVSystems(): Promise<SimPVSystemsResponse | null> {
  const raw = await getRawPVList()
  if (raw.length === 0) return null
  return {
    systems: raw.map((r) => ({
      system_id: r.system_id,
      nominal_capacity_kwp: 0,
    })),
    count: raw.length,
  }
}

export async function getPVCurrent(systemId: string): Promise<SimPVCurrent | null> {
  // /pv/:id/current 404s; find the matching item in the raw list.
  const raw = await getRawPVList()
  const match = raw.find((r) => r.system_id === systemId)
  if (!match) return null
  return {
    timestamp: match.timestamp,
    system_id: match.system_id,
    readings: match.readings,
  }
}

export function getPVHistory(_systemId: string): Promise<SimPVHistory | null> {
  return Promise.resolve(null)
}

export async function getLoads(): Promise<SimLoadsResponse | null> {
  const raw = await getRawLoadList()
  if (raw.length === 0) return null
  return {
    devices: raw.map((r) => ({
      device_id: r.device_id,
      device_type: r.device_type,
      rated_power_kw: r.device_power_kw ?? 0,
      duty_cycle_pct: 0,
      operating_windows: [],
    })),
    count: raw.length,
  }
}

export async function getLoadCurrent(deviceId: string): Promise<SimLoadCurrent | null> {
  // /loads/:id/current 404s; find in raw list.
  const raw = await getRawLoadList()
  const match = raw.find((r) => r.device_id === deviceId)
  if (!match) return null
  const stateRaw = (match.device_state ?? 'off').toLowerCase()
  const state: SimLoadCurrent['state'] = stateRaw === 'on' || stateRaw === 'standby' ? stateRaw as SimLoadCurrent['state'] : 'off'
  return {
    timestamp: match.timestamp,
    device_id: match.device_id,
    state,
    power_kw: match.device_power_kw ?? 0,
  }
}

export function getLoadHistory(_deviceId: string): Promise<SimLoadHistory | null> {
  return Promise.resolve(null)
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

// ─── Phase-5 platform endpoints (alerts/data-sources/provenance/integrations/schemas/admin) ──

export interface PlatformAlert {
  id?: string
  useCase?: string
  source?: string
  category?: string
  severity?: 'info' | 'warning' | 'critical'
  timestamp?: string
  status?: 'open' | 'ack' | 'resolved'
  message?: string
}
export function getAlerts(): Promise<{ alerts: PlatformAlert[]; count: number } | null> {
  return simGet('/alerts')
}

export interface DataSourceRow {
  id: string
  name: string
  type: string
  protocol: string
  topic: string | null
  entity_count: number
  last_event_ts: string | null
  last_event_age_seconds: number | null
  status: string
}
export function getDataSources(): Promise<{ sources: DataSourceRow[]; count: number; engine_state: string } | null> {
  return simGet('/data-sources')
}

export interface ProvenanceTransfer {
  id?: string
  contract_id?: string
  asset_id?: string
  status?: string
  created_at?: string
  updated_at?: string
}
export function getProvenanceTransfers(): Promise<{ transfers: ProvenanceTransfer[]; count: number } | null> {
  return simGet('/provenance/transfers')
}

export interface ProvenanceInsight {
  output_id: string
  insight_type: string | null
  created_at: string | null
  user_roles: string | null
  asset_id: string | null
  agreement_id: string | null
  hmac: string | null
  bytes: number | null
}
export function getProvenanceInsights(): Promise<{ insights: ProvenanceInsight[]; count: number } | null> {
  return simGet('/provenance/insights')
}

export interface IntegrationServiceHealth {
  service: string
  url: string | null
  status: 'healthy' | 'degraded' | 'unreachable' | 'configured' | 'unconfigured'
  http_status?: number
  latency_ms?: number | null
  error?: string
  brokers?: string[]
  broker_count?: number
}
export interface IntegrationsHealth {
  generated_at: string
  summary: {
    healthy: number
    degraded: number
    unreachable: number
    configured: number
    total: number
  }
  services: IntegrationServiceHealth[]
}
export function getIntegrationsHealth(): Promise<IntegrationsHealth | null> {
  return simGet('/integrations/health')
}

export interface SchemaTable {
  catalog: string
  schema: string
  table: string
}
export function getSchemas(): Promise<{ tables: SchemaTable[]; count: number } | null> {
  return simGet('/schemas')
}

export interface SchemaColumn {
  name: string
  type: string
  nullable: boolean
  position: number
}
export function describeSchemaTable(catalog: string, schema: string, table: string): Promise<{ columns: SchemaColumn[]; count: number } | null> {
  return simGet(`/schemas/${encodeURIComponent(catalog)}/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`)
}

export interface AdminUser {
  id: string
  username: string
  firstName: string
  lastName: string
  email: string
  enabled: boolean
  emailVerified: boolean
  createdTimestamp: number | null
  federationLink: string | null
}
export function getAdminUsers(): Promise<{ users: AdminUser[]; count: number } | null> {
  return authedGet('/admin/users')
}

export interface AdminRole {
  name: string
  description: string
  composite: boolean
  member_count: number | null
}
export function getAdminRoles(): Promise<{ roles: AdminRole[]; count: number } | null> {
  return authedGet('/admin/roles')
}

export interface AdminAccessEvent {
  id: string
  type: string
  timestamp: string
  user_id: string | null
  ip: string | null
  result: 'success' | 'failed'
  details: Record<string, unknown> | null
}
export function getAdminAccess(): Promise<{ events: AdminAccessEvent[]; count: number } | null> {
  return authedGet('/admin/access')
}
