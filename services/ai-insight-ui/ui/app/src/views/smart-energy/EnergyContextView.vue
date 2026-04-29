<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

/** Safely format a value that might be null, undefined, or a string */
function fmt(v: unknown, decimals: number): string {
  if (v == null) return '—'
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isNaN(n) ? '—' : n.toFixed(decimals)
}

import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import TimeSeriesChart from '@/components/common/TimeSeriesChart.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import {
  getPriceCurrent,
  getPriceHistory,
  getWeatherStations,
  getWeatherCurrent,
  getWeatherHistory,
  getPVSystems,
  getPVCurrent,
  getPVHistory,
  getLoads,
  getLoadCurrent,
  type SimPrice,
  type SimWeatherHistoryReading,
  type SimPVHistoryReading,
  type SimLoadCurrent
} from '@/services/api'

// ─── Live data refs ────────────────────────────────────────────────────────────
const loading = ref(true)
const error = ref(false)
const apiAvailable = ref(false)

const livePriceHistory = ref<SimPrice[]>([])
const livePriceCurrent = ref<number | null>(null)

const liveWeatherHistory = ref<SimWeatherHistoryReading[]>([])
const liveWeatherCurrent = ref<{ temperature_c: number; ghi_w_m2: number; wind_speed_ms: number; humidity_percent: number; cloud_cover_percent: number } | null>(null)

const livePVHistory = ref<SimPVHistoryReading[]>([])
const livePVCurrent = ref<number | null>(null)

interface LiveDevice {
  deviceId: string
  deviceType: string
  state: string
  powerKw: number
  timestamp: string
}
const liveDevices = ref<LiveDevice[]>([])

async function fetchData(): Promise<void> {
  loading.value = true
  error.value = false
  // Fetch in parallel: price, weather, PV, loads
  const [priceCurrentResp, priceHistResp, weatherStationsResp, pvSystemsResp, loadsResp] = await Promise.all([
    getPriceCurrent(),
    getPriceHistory(),
    getWeatherStations(),
    getPVSystems(),
    getLoads()
  ])

  if (!priceCurrentResp && !weatherStationsResp && !pvSystemsResp && !loadsResp) {
    error.value = true
    loading.value = false
    return
  }

  // Price
  if (priceCurrentResp) {
    livePriceCurrent.value = priceCurrentResp.current.price_eur_per_kwh
    apiAvailable.value = true
  }
  if (priceHistResp?.prices) livePriceHistory.value = priceHistResp.prices

  // Weather
  if (weatherStationsResp?.stations?.length) {
    const stId = weatherStationsResp.stations[0].station_id
    const [wcur, whist] = await Promise.all([
      getWeatherCurrent(stId),
      getWeatherHistory(stId)
    ])
    if (wcur) liveWeatherCurrent.value = wcur.conditions
    if (whist?.readings) liveWeatherHistory.value = whist.readings
  }

  // PV
  if (pvSystemsResp?.systems?.length) {
    const sysId = pvSystemsResp.systems[0].system_id
    const [pvcur, pvhist] = await Promise.all([
      getPVCurrent(sysId),
      getPVHistory(sysId)
    ])
    if (pvcur) livePVCurrent.value = pvcur.readings.power_kw
    if (pvhist?.readings) livePVHistory.value = pvhist.readings
  }

  // Loads
  if (loadsResp?.devices?.length) {
    const deviceCurrents = await Promise.all(
      loadsResp.devices.map(d => getLoadCurrent(d.device_id))
    )
    liveDevices.value = loadsResp.devices
      .map((d, i): LiveDevice | null => {
        const cur: SimLoadCurrent | null = deviceCurrents[i]
        if (!cur) return null
        return {
          deviceId: d.device_id,
          deviceType: d.device_type,
          state: cur.state,
          powerKw: cur.power_kw,
          timestamp: cur.timestamp
        }
      })
      .filter((x): x is LiveDevice => x !== null)
  }

  loading.value = false
}

onMounted(fetchData)

// ─── Chart labels from real timestamps only ────────────────────────────────────
const chartLabels = computed((): string[] => {
  return livePriceHistory.value.map(p =>
    new Date(p.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
})

// ─── Price Section ────────────────────────────────────────────────────────────
const currentPrice = computed((): number | null => livePriceCurrent.value)

const avgPrice = computed((): number | null => {
  if (livePriceHistory.value.length === 0) return null
  return livePriceHistory.value.reduce((s, r) => s + r.price_eur_per_kwh, 0) / livePriceHistory.value.length
})

const peakPrice = computed((): number | null => {
  if (livePriceHistory.value.length === 0) return null
  return Math.max(...livePriceHistory.value.map(r => r.price_eur_per_kwh))
})

const priceKpis = computed(() => [
  { label: 'Current Price', value: fmt(currentPrice.value, 4), unit: currentPrice.value != null ? '€/kWh' : '', trend: 'stable' as const, icon: 'pi-euro', color: '#8b5cf6' },
  { label: 'Avg Price (24h)', value: fmt(avgPrice.value, 4), unit: avgPrice.value != null ? '€/kWh' : '', trend: 'stable' as const, icon: 'pi-chart-line', color: '#3b82f6' },
  { label: 'Peak Price', value: fmt(peakPrice.value, 4), unit: peakPrice.value != null ? '€/kWh' : '', trend: 'stable' as const, icon: 'pi-arrow-up', color: '#ef4444' }
])

const priceDatasets = computed(() => [
  {
    label: 'Spot Price (€/kWh)',
    data: livePriceHistory.value.map(p => p.price_eur_per_kwh),
    borderColor: '#8b5cf6',
    backgroundColor: 'rgba(139,92,246,0.08)',
    fill: true,
    tension: 0.4
  }
])

// Price table rows from real API
const displayPriceRecords = computed(() =>
  livePriceHistory.value.slice(-8).reverse().map(p => ({
    timestamp: p.timestamp,
    priceEurPerKwh: p.price_eur_per_kwh,
    tariffType: p.tariff_type
  }))
)

// ─── Weather Section ──────────────────────────────────────────────────────────
const latestWeatherTemp = computed((): number | null =>
  liveWeatherCurrent.value?.temperature_c ?? null
)
const latestWeatherGHI = computed((): number | null =>
  liveWeatherCurrent.value?.ghi_w_m2 ?? null
)
const avgWind = computed((): string => {
  if (liveWeatherHistory.value.length > 0) {
    const avg = liveWeatherHistory.value.reduce((s, r) => s + (r.wind_speed_ms ?? 0), 0) / liveWeatherHistory.value.length
    return avg.toFixed(1)
  }
  return '—'
})

const weatherKpis = computed(() => [
  { label: 'Temperature', value: fmt(latestWeatherTemp.value, 1), unit: latestWeatherTemp.value != null ? '°C' : '', trend: 'stable' as const, icon: 'pi-sun', color: '#f59e0b' },
  { label: 'Irradiance (GHI)', value: latestWeatherGHI.value !== null ? Math.round(latestWeatherGHI.value) : '—', unit: latestWeatherGHI.value !== null ? 'W/m²' : '', trend: 'stable' as const, icon: 'pi-bolt', color: '#f59e0b' },
  { label: 'Wind Speed', value: avgWind.value, unit: avgWind.value !== '—' ? 'm/s' : '', trend: 'stable' as const, icon: 'pi-send', color: '#3b82f6' }
])

const weatherLabels = computed((): string[] => {
  return liveWeatherHistory.value.map(r =>
    new Date(r.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
})

const weatherDatasets = computed(() => [
  {
    label: 'Temperature (°C)',
    data: liveWeatherHistory.value.map(r => r.temperature_c),
    borderColor: '#ef4444',
    fill: false,
    tension: 0.4,
    yAxisID: 'y'
  },
  {
    label: 'Irradiance (W/m²)',
    data: liveWeatherHistory.value.map(r => r.ghi_w_m2),
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245,158,11,0.06)',
    fill: true,
    tension: 0.4,
    yAxisID: 'y2'
  }
])

const displayWeatherRecords = computed(() =>
  liveWeatherHistory.value.slice(-6).reverse().map(r => ({
    timestamp: r.timestamp,
    temperature_c: r.temperature_c,
    solarIrradiance_w_m2: r.ghi_w_m2,
    windSpeed_ms: r.wind_speed_ms,
    cloudCover_pct: r.cloud_cover_percent
  }))
)

// ─── PV Section ───────────────────────────────────────────────────────────────
const latestPVPower = computed((): number | null => livePVCurrent.value)
const peakPV = computed((): number | null => {
  if (livePVHistory.value.length > 0) return Math.max(...livePVHistory.value.map(r => r.power_kw))
  return null
})
const totalPV_kWh = computed((): string => {
  if (livePVHistory.value.length > 0) return livePVHistory.value.reduce((s, r) => s + (r.power_kw ?? 0), 0).toFixed(0)
  return '—'
})

const pvKpis = computed(() => [
  { label: 'Current PV Power', value: fmt(latestPVPower.value, 1), unit: latestPVPower.value != null ? 'kW' : '', trend: 'stable' as const, icon: 'pi-sun', color: '#22c55e' },
  { label: 'History Sum', value: totalPV_kWh.value, unit: totalPV_kWh.value !== '—' ? 'kWh' : '', trend: 'stable' as const, icon: 'pi-chart-bar', color: '#22c55e' },
  { label: 'Peak Output', value: fmt(peakPV.value, 1), unit: peakPV.value != null ? 'kW' : '', trend: 'stable' as const, icon: 'pi-arrow-up', color: '#22c55e' }
])

const pvLabels = computed((): string[] => {
  return livePVHistory.value.map(r =>
    new Date(r.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
})

const pvDatasets = computed(() => [
  {
    label: 'PV Output (kW)',
    data: livePVHistory.value.map(r => r.power_kw),
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34,197,94,0.08)',
    fill: true,
    tension: 0.4,
    yAxisID: 'y'
  }
])

const displayPVRecords = computed(() =>
  livePVHistory.value.slice(-6).reverse().map(r => ({
    timestamp: r.timestamp,
    pvPower_kW: r.power_kw,
    irradiance_w_m2: r.irradiance_w_m2,
    temperature_c: r.panel_temp_c
  }))
)

// ─── Consumer Section — real API data only ────────────────────────────────────
const latestConsumers = computed(() => liveDevices.value)

const activeDevices = computed(() => latestConsumers.value.filter(r => r.state === 'on').length)
const totalLoad = computed(() => latestConsumers.value.reduce((s, r) => s + (r.powerKw ?? 0), 0).toFixed(1))

const consumerKpis = computed(() => [
  { label: 'Active Devices', value: activeDevices.value, unit: '', trend: 'stable' as const, icon: 'pi-desktop', color: '#3b82f6' },
  { label: 'Total Load', value: totalLoad.value, unit: 'kW', trend: 'stable' as const, icon: 'pi-bolt', color: '#f59e0b' }
])

const STATE_COLOR: Record<string, string> = {
  on: '#22c55e',
  off: '#94a3b8',
  standby: '#f59e0b'
}

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Context Data"
      subtitle="Dynamic price feed, weather telemetry, PV data and consumer simulation — last 24 hours"
      :breadcrumbs="[{ label: 'Use Cases' }, { label: 'Smart Energy' }, { label: 'Context' }]"
    >
      <template #actions>
        <button class="refresh-btn" :disabled="loading" @click="fetchData()">
          <i :class="['pi', loading ? 'pi-spin pi-spinner' : 'pi-refresh']"></i>
          Refresh
        </button>
      </template>
    </PageHeader>

    <!-- API error state -->
    <div v-if="error && !loading" class="api-error-banner">
      <i class="pi pi-exclamation-circle"></i>
      <span>Could not load data from simulation API</span>
      <button class="refresh-btn" @click="fetchData()">Retry</button>
    </div>
    <div v-else-if="apiAvailable && !loading" class="live-banner">
      <i class="pi pi-circle-fill live-banner__dot"></i>
      Live context data from simulation API
    </div>

    <div class="view-body">

      <!-- ── Dynamic Price Feed ─────────────────────────────────────────── -->
      <section class="ctx-section">
        <div class="ctx-section__header">
          <div class="ctx-section__badge ctx-section__badge--purple">
            <i class="pi pi-euro"></i>
          </div>
          <div>
            <div class="ctx-section__title">Dynamic Electricity Price Feed</div>
            <div class="ctx-section__sub">ENTSOE Day-Ahead Spot Prices — PT/ES Bidding Zone</div>
          </div>
          <StatusBadge status="healthy" size="sm" />
        </div>

        <div class="kpi-row-3">
          <KpiCard
            v-for="kpi in priceKpis"
            :key="kpi.label"
            :label="kpi.label"
            :value="kpi.value"
            :unit="kpi.unit"
            :trend="kpi.trend"
            :icon="kpi.icon"
            :color="kpi.color"
          />
        </div>

        <div class="card card-body">
          <div class="section-title" style="margin-bottom:1rem">Spot Price — Last 24h</div>
          <TimeSeriesChart
            :datasets="priceDatasets"
            :labels="chartLabels"
            y-axis-label="€/kWh"
            :height="220"
          />
        </div>

        <div class="data-table">
          <div class="data-table__header">
            <span>Timestamp</span>
            <span>Price (€/kWh)</span>
            <span>Tariff Type</span>
          </div>
          <div
            v-for="rec in displayPriceRecords"
            :key="rec.timestamp"
            class="data-table__row"
          >
            <span class="text-muted">{{ fmtTs(rec.timestamp) }}</span>
            <span class="font-semibold" style="color: #8b5cf6">{{ rec.priceEurPerKwh?.toFixed(4) ?? '—' }}</span>
            <StatusBadge :status="rec.tariffType === 'peak' ? 'warning' : 'info'" size="sm" :show-dot="false" />
          </div>
        </div>
      </section>

      <!-- ── Weather Feed ───────────────────────────────────────────────── -->
      <section class="ctx-section">
        <div class="ctx-section__header">
          <div class="ctx-section__badge ctx-section__badge--orange">
            <i class="pi pi-sun"></i>
          </div>
          <div>
            <div class="ctx-section__title">Weather Telemetry Feed</div>
            <div class="ctx-section__sub">Weather Station HQ — Ambient sensors</div>
          </div>
          <StatusBadge status="healthy" size="sm" />
        </div>

        <div class="kpi-row-3">
          <KpiCard
            v-for="kpi in weatherKpis"
            :key="kpi.label"
            :label="kpi.label"
            :value="kpi.value"
            :unit="kpi.unit"
            :trend="kpi.trend"
            :icon="kpi.icon"
            :color="kpi.color"
          />
        </div>

        <div class="card card-body">
          <div class="section-title" style="margin-bottom:1rem">Temperature & Irradiance — Last 24h</div>
          <TimeSeriesChart
            :datasets="weatherDatasets"
            :labels="weatherLabels"
            y-axis-label="Temperature (°C)"
            y2-axis-label="Irradiance (W/m²)"
            :height="220"
          />
        </div>

        <div class="data-table">
          <div class="data-table__header">
            <span>Timestamp</span>
            <span>Temp (°C)</span>
            <span>Irradiance (W/m²)</span>
            <span>Wind (m/s)</span>
            <span>Cloud Cover (%)</span>
          </div>
          <div
            v-for="rec in displayWeatherRecords"
            :key="rec.timestamp"
            class="data-table__row data-table__row--5"
          >
            <span class="text-muted">{{ fmtTs(rec.timestamp) }}</span>
            <span>{{ rec.temperature_c?.toFixed(1) ?? '—' }}</span>
            <span>{{ rec.solarIrradiance_w_m2 != null ? Math.round(rec.solarIrradiance_w_m2) : '—' }}</span>
            <span>{{ rec.windSpeed_ms?.toFixed(1) ?? '—' }}</span>
            <span>{{ rec.cloudCover_pct != null ? Math.round(rec.cloudCover_pct) + '%' : '—' }}</span>
          </div>
        </div>
      </section>

      <!-- ── PV Feed ────────────────────────────────────────────────────── -->
      <section class="ctx-section">
        <div class="ctx-section__header">
          <div class="ctx-section__badge ctx-section__badge--green">
            <i class="pi pi-bolt"></i>
          </div>
          <div>
            <div class="ctx-section__title">PV Generation Feed</div>
            <div class="ctx-section__sub">PV-System-02 — SunSpec/Modbus inverter telemetry</div>
          </div>
          <StatusBadge status="healthy" size="sm" />
        </div>

        <div class="kpi-row-3">
          <KpiCard
            v-for="kpi in pvKpis"
            :key="kpi.label"
            :label="kpi.label"
            :value="kpi.value"
            :unit="kpi.unit"
            :trend="kpi.trend"
            :trend-value="kpi.trendValue"
            :icon="kpi.icon"
            :color="kpi.color"
          />
        </div>

        <div class="card card-body">
          <div class="section-title" style="margin-bottom:1rem">PV Output — Last 24h</div>
          <TimeSeriesChart
            :datasets="pvDatasets"
            :labels="pvLabels"
            y-axis-label="PV Power (kW)"
            :height="220"
          />
        </div>

        <div class="data-table">
          <div class="data-table__header">
            <span>Timestamp</span>
            <span>PV Power (kW)</span>
            <span>Irradiance (W/m²)</span>
            <span>Module Temp (°C)</span>
          </div>
          <div
            v-for="rec in displayPVRecords"
            :key="rec.timestamp"
            class="data-table__row data-table__row--4"
          >
            <span class="text-muted">{{ fmtTs(rec.timestamp) }}</span>
            <span class="font-semibold" style="color: #22c55e">{{ rec.pvPower_kW?.toFixed(2) ?? '—' }}</span>
            <span>{{ rec.irradiance_w_m2 != null ? Math.round(rec.irradiance_w_m2) : '—' }}</span>
            <span>{{ rec.temperature_c?.toFixed(1) ?? '—' }}</span>
          </div>
        </div>
      </section>

      <!-- ── Consumer Simulation ────────────────────────────────────────── -->
      <section class="ctx-section">
        <div class="ctx-section__header">
          <div class="ctx-section__badge ctx-section__badge--blue">
            <i class="pi pi-desktop"></i>
          </div>
          <div>
            <div class="ctx-section__title">Consumer Device Simulation</div>
            <div class="ctx-section__sub">Simulated flexible load devices — industrial site</div>
          </div>
          <StatusBadge status="active" size="sm" />
        </div>

        <div class="kpi-row-2">
          <KpiCard
            v-for="kpi in consumerKpis"
            :key="kpi.label"
            :label="kpi.label"
            :value="kpi.value"
            :unit="kpi.unit"
            :trend="kpi.trend"
            :icon="kpi.icon"
            :color="kpi.color"
          />
        </div>

        <div class="data-table">
          <div class="data-table__header">
            <span>Device ID</span>
            <span>Device Type</span>
            <span>State</span>
            <span>Power (kW)</span>
            <span>Timestamp</span>
          </div>
          <div
            v-for="rec in latestConsumers"
            :key="rec.deviceId"
            class="data-table__row data-table__row--5"
          >
            <code class="code-pill">{{ rec.deviceId }}</code>
            <span>{{ rec.deviceType }}</span>
            <span>
              <span
                class="state-badge"
                :style="{
                  color: STATE_COLOR[rec.state] ?? '#94a3b8',
                  background: `${STATE_COLOR[rec.state] ?? '#94a3b8'}18`
                }"
              >
                <span class="state-dot" :style="{ background: STATE_COLOR[rec.state] ?? '#94a3b8' }"></span>
                {{ (rec.state ?? 'unknown').toUpperCase() }}
              </span>
            </span>
            <span class="font-semibold">{{ rec.powerKw?.toFixed(2) ?? '—' }}</span>
            <span class="text-muted">{{ fmtTs(rec.timestamp) }}</span>
          </div>
        </div>
      </section>

    </div>
  </div>
</template>

<style scoped>
.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 2.5rem; }

.api-error-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1.5rem;
  background: #fff5f5;
  border-bottom: 1px solid #fee2e2;
  color: #991b1b;
  font-size: 0.875rem;
}
.live-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 1.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #15803d;
  background: rgba(34, 197, 94, 0.08);
  border-bottom: 1px solid rgba(34, 197, 94, 0.2);
}
.live-banner__dot { font-size: 0.5rem; color: #22c55e; }

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.786rem;
  font-weight: 500;
  padding: 0.35rem 0.875rem;
  border-radius: var(--facis-radius-sm);
  border: 1px solid var(--facis-border);
  background: var(--facis-surface);
  color: var(--facis-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.refresh-btn:hover:not(:disabled) {
  border-color: var(--facis-primary);
  color: var(--facis-primary);
}
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Section wrapper */
.ctx-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.ctx-section__header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-bottom: 0.875rem;
  border-bottom: 2px solid var(--facis-border);
}

.ctx-section__badge {
  width: 40px;
  height: 40px;
  border-radius: var(--facis-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.ctx-section__badge--purple { background: rgba(139,92,246,0.12); color: #8b5cf6; }
.ctx-section__badge--orange { background: rgba(245,158,11,0.12); color: #f59e0b; }
.ctx-section__badge--green  { background: rgba(34,197,94,0.12);  color: #22c55e; }
.ctx-section__badge--blue   { background: rgba(59,130,246,0.12); color: #3b82f6; }

.ctx-section__title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--facis-text);
}

.ctx-section__sub {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
  margin-top: 0.1rem;
}

/* KPI rows */
.kpi-row-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.kpi-row-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  max-width: 600px;
}

/* Data table */
.data-table {
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  overflow: hidden;
}

.data-table__header {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 0.5rem 1rem;
  background: var(--facis-surface-2);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--facis-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  gap: 0.75rem;
}

.data-table__row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--facis-border);
  font-size: 0.857rem;
  gap: 0.75rem;
  align-items: center;
}

.data-table__row:hover { background: var(--facis-surface-2); }

.data-table__row--4,
.data-table__header:has(+ .data-table__row--4) {
  grid-template-columns: repeat(4, 1fr);
}

.data-table__row--5,
.data-table__header:has(+ .data-table__row--5) {
  grid-template-columns: repeat(5, 1fr);
}

.data-table__header + .data-table__row--4,
.data-table__row--4 + .data-table__row--4 {
  grid-template-columns: repeat(4, 1fr);
}

.data-table__header + .data-table__row--5,
.data-table__row--5 + .data-table__row--5 {
  grid-template-columns: repeat(5, 1fr);
}

/* Override grid for 4-col tables */
.data-table:has(.data-table__row--4) .data-table__header {
  grid-template-columns: repeat(4, 1fr);
}

.data-table:has(.data-table__row--5) .data-table__header {
  grid-template-columns: repeat(5, 1fr);
}

.data-table:has(.data-table__row--4) .data-table__row {
  grid-template-columns: repeat(4, 1fr);
}

.data-table:has(.data-table__row--5) .data-table__row {
  grid-template-columns: repeat(5, 1fr);
}

.code-pill {
  font-family: var(--facis-font-mono);
  font-size: 0.75rem;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  background: var(--facis-primary-light);
  color: var(--facis-primary);
}

/* State badge */
.state-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.5rem;
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.state-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

@media (max-width: 900px) {
  .kpi-row-3 { grid-template-columns: 1fr 1fr; }
}
</style>
