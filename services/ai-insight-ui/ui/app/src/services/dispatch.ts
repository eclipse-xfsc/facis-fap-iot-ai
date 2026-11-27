/**
 * FACIS dispatch surface — typed wrappers around `submit()` for every
 * UI action the platform exposes. Replaces the legacy services/api.ts.
 *
 * Transport rules:
 *   - All platform/data domain actions (alerts, data-sources, provenance,
 *     integrations, schemas, admin, smart-city, analytics, AI Insight) go
 *     through `submit()` (FAP §9, dispatcher-routed).
 *   - Sim runtime endpoints under `/api/sim` remain HTTP (those flows are a
 *     separate ORCE deliverable; see api.ts header history).
 *
 * Failure model: every helper wraps errors in try/catch and returns null so
 * callers can fall back gracefully — same contract as the legacy api.ts so
 * the migration is a pure import-path swap.
 *
 * Types live in services/types.ts. Re-exported here for backward compat with
 * views that imported `type Foo` from this module.
 */

import { submit } from './transport'
import type {
  SimMeter,
  SimMetersResponse,
  SimMeterCurrent,
  SimMeterHistory,
  SimMeterHistoryReading,
  SimMeterReadings,
  SimWeatherStation,
  SimWeatherStationsResponse,
  SimWeatherCurrent,
  SimWeatherConditions,
  SimWeatherHistory,
  SimWeatherHistoryReading,
  SimPrice,
  SimPriceCurrent,
  SimPriceHistory,
  SimPVSystem,
  SimPVSystemsResponse,
  SimPVCurrent,
  SimPVReadings,
  SimPVHistory,
  SimPVHistoryReading,
  SimDevice,
  SimLoadsResponse,
  SimLoadCurrent,
  SimLoadHistory,
  SimLoadHistoryReading,
  SimSimulationStatus,
  SimHealth,
  SimConfig,
  SimPriceForecast,
  SimStreetlight,
  SimStreetlightList,
  SimStreetlightCurrent,
  SimStreetlightHistory,
  SimStreetlightHistoryReading,
  SimTrafficZone,
  SimTrafficZoneList,
  SimTrafficCurrent,
  SimTrafficHistory,
  SimTrafficHistoryReading,
  SimEventZone,
  SimEventZoneList,
  SimEventCurrent,
  SimEventHistory,
  SimEventHistoryReading,
  SimCityWeatherCurrent,
  SimCityWeatherHistory,
  SimCityWeatherHistoryReading,
  AiInsightLatest,
  AiHealth,
  PlatformAlert,
  DataSourceRow,
  ProvenanceTransfer,
  ProvenanceInsight,
  IntegrationServiceHealth,
  IntegrationsHealth,
  SchemaTable,
  SchemaColumn,
  AdminUser,
  AdminRole,
  AdminAccessEvent,
} from './types'

// Re-export for backward compatibility — views can still import types
// from '@/services/dispatch' or migrate to '@/services/types' at leisure.
export type {
  SimMeter,
  SimMetersResponse,
  SimMeterCurrent,
  SimMeterHistory,
  SimMeterHistoryReading,
  SimMeterReadings,
  SimWeatherStation,
  SimWeatherStationsResponse,
  SimWeatherCurrent,
  SimWeatherConditions,
  SimWeatherHistory,
  SimWeatherHistoryReading,
  SimPrice,
  SimPriceCurrent,
  SimPriceHistory,
  SimPVSystem,
  SimPVSystemsResponse,
  SimPVCurrent,
  SimPVReadings,
  SimPVHistory,
  SimPVHistoryReading,
  SimDevice,
  SimLoadsResponse,
  SimLoadCurrent,
  SimLoadHistory,
  SimLoadHistoryReading,
  SimSimulationStatus,
  SimHealth,
  SimConfig,
  SimPriceForecast,
  SimStreetlight,
  SimStreetlightList,
  SimStreetlightCurrent,
  SimStreetlightHistory,
  SimStreetlightHistoryReading,
  SimTrafficZone,
  SimTrafficZoneList,
  SimTrafficCurrent,
  SimTrafficHistory,
  SimTrafficHistoryReading,
  SimEventZone,
  SimEventZoneList,
  SimEventCurrent,
  SimEventHistory,
  SimEventHistoryReading,
  SimCityWeatherCurrent,
  SimCityWeatherHistory,
  SimCityWeatherHistoryReading,
  AiInsightLatest,
  AiHealth,
  PlatformAlert,
  DataSourceRow,
  ProvenanceTransfer,
  ProvenanceInsight,
  IntegrationServiceHealth,
  IntegrationsHealth,
  SchemaTable,
  SchemaColumn,
  AdminUser,
  AdminRole,
  AdminAccessEvent,
}

const SIM_BASE: string = (import.meta.env?.VITE_SIM_API_URL as string) || '/api/sim'

/* ─── Internal helpers ───────────────────────────────────────────────────── */

// FAP §9 command via UIBUILDER. Returns result.data on ok=true, otherwise null.
async function uib<T>(action: string, payload: unknown = {}): Promise<T | null> {
  try {
    const r = await submit<unknown, T>(action, payload)
    return r.ok ? (r.data as T) : null
  } catch (err) {
    console.warn(`[dispatch] UIB ${action} failed:`, err)
    return null
  }
}

// FAP §9 with the user's access token attached to the payload —
// the way to carry credentials over a UIBUILDER WebSocket frame.
async function uibAuthed<T>(action: string, payload: Record<string, unknown> = {}): Promise<T | null> {
  try {
    const { getAccessToken } = await import('@/auth')
    const token = getAccessToken()
    if (!token) {
      console.warn(`[dispatch] UIB-AUTHED ${action} skipped: no access token`)
      return null
    }
    return uib<T>(action, { ...payload, authToken: token })
  } catch (err) {
    console.warn(`[dispatch] UIB-AUTHED ${action} failed:`, err)
    return null
  }
}

// Sim runtime REST passthrough. Kept for the documented sim-runtime exception
// (sim REST endpoints are not owned by the AI Insight UI's ORCE topology).
async function simGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SIM_BASE}${path}`)
    if (!res.ok) {
      console.warn(`[dispatch] SIM ${path} → HTTP ${res.status}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn(`[dispatch] SIM ${path} failed:`, err)
    return null
  }
}

async function simPost<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SIM_BASE}${path}`, { method: 'POST' })
    if (!res.ok) {
      console.warn(`[dispatch] SIM POST ${path} → HTTP ${res.status}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn(`[dispatch] SIM POST ${path} failed:`, err)
    return null
  }
}

// AI Insight bridge — every AI Insight endpoint maps to one of the actions
// the dispatcher proxies through 1-AI-Insight-Proxy.json. Eliminates the
// previous direct HTTP path against VITE_AI_API_URL.
async function aiInsight<T>(insightAction: string, params: Record<string, unknown> = {}): Promise<T | null> {
  return uib<T>('insight.request', { action: insightAction, params })
}

/* ─── Simulation runtime — typed wrappers (HTTP per file header) ─────────── */

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
  return uib<SimMeterHistory>('analytics.meters.history', { meter_id: meterId })
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
  const raw = await simGet<RawWeatherSnapshot>('/weather')
  if (!raw || raw.site_id !== stationId) return null
  return { timestamp: raw.timestamp, conditions: raw.conditions }
}

export function getWeatherHistory(stationId: string): Promise<SimWeatherHistory | null> {
  return uib<SimWeatherHistory>('analytics.weather.history', { station_id: stationId })
}

export async function getPriceCurrent(): Promise<SimPriceCurrent | null> {
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
  return Promise.resolve(null)
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
  const raw = await getRawPVList()
  const match = raw.find((r) => r.system_id === systemId)
  if (!match) return null
  return {
    timestamp: match.timestamp,
    system_id: match.system_id,
    readings: match.readings,
  }
}

export function getPVHistory(systemId: string): Promise<SimPVHistory | null> {
  return uib<SimPVHistory>('analytics.pv.history', { system_id: systemId })
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

/**
 * Returns "now" as the simulator sees it — the only sensible end-of-window
 * for any query that hits gold/silver tables, since their `hour` column is
 * derived from sim-clock event timestamps. Wall-clock NOW would miss every
 * row whenever the simulator runs at acceleration > 1 (its emitted
 * timestamps drift past wall time within minutes).
 *
 * Falls back to wall-clock NOW only when the sim status endpoint is
 * unreachable — preserves the previous behaviour for offline/dev runs.
 */
export async function getSimNow(): Promise<string> {
  const status = await getSimulationStatus()
  return status?.simulation_time ?? new Date().toISOString()
}

export function getSimulationConfig(): Promise<unknown> {
  return simGet('/config')
}

export function getSimHealth(): Promise<SimHealth | null> {
  return simGet<SimHealth>('/health')
}

export function getSimConfig(): Promise<SimConfig | null> {
  return simGet<SimConfig>('/config')
}

export function getPriceForecast(): Promise<SimPriceForecast | null> {
  return simGet<SimPriceForecast>('/prices/forecast')
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

/* ─── Smart City — UIB-routed ────────────────────────────────────────────── */

export function getStreetlights(): Promise<SimStreetlightList | null> {
  return uib<SimStreetlightList>('smart-city.streetlights.list')
}

export function getStreetlightCurrent(lightId: string): Promise<SimStreetlightCurrent | null> {
  return uib<SimStreetlightCurrent>('smart-city.streetlights.current', { light_id: lightId })
}

export function getStreetlightHistory(lightId: string): Promise<SimStreetlightHistory | null> {
  return uib<SimStreetlightHistory>('smart-city.streetlights.history', { light_id: lightId })
}

export function getTrafficZones(): Promise<SimTrafficZoneList | null> {
  return uib<SimTrafficZoneList>('smart-city.traffic.zones')
}

export function getTrafficCurrent(zoneId: string): Promise<SimTrafficCurrent | null> {
  return uib<SimTrafficCurrent>('smart-city.traffic.current', { zone_id: zoneId })
}

export function getTrafficHistory(zoneId: string): Promise<SimTrafficHistory | null> {
  return uib<SimTrafficHistory>('smart-city.traffic.history', { zone_id: zoneId })
}

export function getCityEvents(): Promise<SimEventZoneList | null> {
  return uib<SimEventZoneList>('smart-city.events.zones')
}

export function getCityEventCurrent(zoneId: string): Promise<SimEventCurrent | null> {
  return uib<SimEventCurrent>('smart-city.events.current', { zone_id: zoneId })
}

export function getCityEventHistory(zoneId: string): Promise<SimEventHistory | null> {
  return uib<SimEventHistory>('smart-city.events.history', { zone_id: zoneId })
}

export function getCityWeatherCurrent(): Promise<SimCityWeatherCurrent | null> {
  return uib<SimCityWeatherCurrent>('smart-city.weather.current')
}

export function getCityWeatherHistory(): Promise<SimCityWeatherHistory | null> {
  return uib<SimCityWeatherHistory>('smart-city.weather.history')
}

/* ─── AI Insight — UIB-routed (was HTTP) ─────────────────────────────────── */

export function getInsightLatest(): Promise<AiInsightLatest | null> {
  return aiInsight<AiInsightLatest>('load-latest')
}

export function postInsightEnergySummary(startTs: string, endTs: string): Promise<unknown> {
  return aiInsight<unknown>('energy-summary', { start_ts: startTs, end_ts: endTs, timezone: 'UTC' })
}

export function postInsightAnomalyReport(startTs: string, endTs: string): Promise<unknown> {
  return aiInsight<unknown>('anomaly-report', { start_ts: startTs, end_ts: endTs, timezone: 'UTC' })
}

export function postInsightCityStatus(startTs: string, endTs: string): Promise<unknown> {
  return aiInsight<unknown>('city-status', { start_ts: startTs, end_ts: endTs, timezone: 'UTC' })
}

export async function getAiHealth(): Promise<AiHealth | null> {
  // The dispatcher only routes the rollup action `integrations.health`; there
  // is no dedicated `integrations.health.ai-insight`. Pluck the AI Insight
  // service entry from the rollup and shape it into the AiHealth contract
  // the views expect (`status: 'ok'` for healthy, raw status string otherwise).
  const rollup = await uib<IntegrationsHealth>('integrations.health')
  if (!rollup || !Array.isArray(rollup.services)) return null
  const ai = rollup.services.find(
    (s) => s.service === 'ai-insight' || s.service === 'ai-insight-service'
  )
  if (!ai) return null
  return {
    status: ai.status === 'healthy' ? 'ok' : ai.status,
    service: ai.service,
  }
}

/* ─── Platform endpoints — UIB-routed ────────────────────────────────────── */

export function getAlerts(): Promise<{ alerts: PlatformAlert[]; count: number } | null> {
  return uib('alerts.list')
}

export function getDataSources(): Promise<{ sources: DataSourceRow[]; count: number; engine_state: string } | null> {
  return uib('data-sources.list')
}

export function getProvenanceTransfers(): Promise<{ transfers: ProvenanceTransfer[]; count: number } | null> {
  return uib('provenance.transfers')
}

export function getProvenanceInsights(): Promise<{ insights: ProvenanceInsight[]; count: number } | null> {
  return uib('provenance.insights')
}

export function getIntegrationsHealth(): Promise<IntegrationsHealth | null> {
  return uib('integrations.health')
}

export function getSchemas(): Promise<{ tables: SchemaTable[]; count: number } | null> {
  return uib('schemas.list')
}

export function describeSchemaTable(catalog: string, schema: string, table: string): Promise<{ columns: SchemaColumn[]; count: number } | null> {
  return uib('schemas.describe', { catalog, schema, table })
}

export function getAdminUsers(): Promise<{ users: AdminUser[]; count: number } | null> {
  return uibAuthed('admin.users')
}

export function getAdminRoles(): Promise<{ roles: AdminRole[]; count: number } | null> {
  return uibAuthed('admin.roles')
}

export function getAdminAccess(): Promise<{ events: AdminAccessEvent[]; count: number } | null> {
  return uibAuthed('admin.access')
}
