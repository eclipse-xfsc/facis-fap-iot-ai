<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import DataTablePage from '@/components/common/DataTablePage.vue'
import TimeSeriesChart from '@/components/common/TimeSeriesChart.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import {
  getTrafficZones,
  getTrafficCurrent,
  getTrafficHistory,
  getCityEvents,
  getCityEventCurrent,
  getCityEventHistory,
  getCityWeatherCurrent,
  getCityWeatherHistory,
  type SimTrafficCurrent,
  type SimTrafficHistoryReading,
  type SimEventCurrent,
  type SimEventHistoryReading,
  type SimCityWeatherCurrent,
  type SimCityWeatherHistoryReading
} from '@/services/api'

// ─── Live data state ──────────────────────────────────────────────────────────
const isLive = ref(false)
const loading = ref(false)
const error = ref(false)

// Traffic per zone
const liveTrafficCurrentMap = ref<Record<string, SimTrafficCurrent>>({})
const liveTrafficHistoryMap = ref<Record<string, SimTrafficHistoryReading[]>>({})
// Events per zone
const liveEventCurrentMap = ref<Record<string, SimEventCurrent>>({})
const liveEventHistoryMap = ref<Record<string, SimEventHistoryReading[]>>({})
// Weather
const liveWeatherCurrent = ref<SimCityWeatherCurrent | null>(null)
const liveWeatherHistory = ref<SimCityWeatherHistoryReading[]>([])

async function fetchData(): Promise<void> {
  loading.value = true
  error.value = false
  const [trafficZonesRes, eventZonesRes, weatherCurrentRes, weatherHistRes] = await Promise.all([
    getTrafficZones(),
    getCityEvents(),
    getCityWeatherCurrent(),
    getCityWeatherHistory()
  ])

  if (!trafficZonesRes && !eventZonesRes && !weatherCurrentRes && !weatherHistRes) {
    error.value = true
    loading.value = false
    return
  }

  if (weatherCurrentRes) liveWeatherCurrent.value = weatherCurrentRes
  if (weatherHistRes) liveWeatherHistory.value = weatherHistRes.readings

  const allZoneIds = new Set<string>()
  if (trafficZonesRes) trafficZonesRes.zones.forEach(z => allZoneIds.add(z.zone_id))
  if (eventZonesRes) eventZonesRes.zones.forEach(z => allZoneIds.add(z.zone_id))

  if (allZoneIds.size > 0) {
    const zoneIdList = Array.from(allZoneIds)
    const [trafficCurrents, trafficHistories, eventCurrents, eventHistories] = await Promise.all([
      Promise.all(zoneIdList.map(id => getTrafficCurrent(id))),
      Promise.all(zoneIdList.map(id => getTrafficHistory(id))),
      Promise.all(zoneIdList.map(id => getCityEventCurrent(id))),
      Promise.all(zoneIdList.map(id => getCityEventHistory(id)))
    ])
    for (let i = 0; i < zoneIdList.length; i++) {
      const id = zoneIdList[i]
      if (trafficCurrents[i]) liveTrafficCurrentMap.value[id] = trafficCurrents[i]!
      if (trafficHistories[i]) liveTrafficHistoryMap.value[id] = trafficHistories[i]!.readings
      if (eventCurrents[i]) liveEventCurrentMap.value[id] = eventCurrents[i]!
      if (eventHistories[i]) liveEventHistoryMap.value[id] = eventHistories[i]!.readings
    }
  }

  if (weatherCurrentRes || trafficZonesRes || eventZonesRes) {
    isLive.value = true
  }
  loading.value = false
}

onMounted(fetchData)

// ─── Traffic — live rows ──────────────────────────────────────────────────────

const liveTrafficRows = computed(() =>
  Object.entries(liveTrafficCurrentMap.value).map(([zoneId, cur]) => ({
    id: zoneId,
    zoneId,
    flowLevel: cur.traffic_index > 0.7 ? 'congested' : cur.traffic_index > 0.4 ? 'moderate' : 'light',
    vehicleCount: Math.round(cur.traffic_index * 200),
    timestamp: cur.timestamp
  }))
)

const trafficRows = computed(() => liveTrafficRows.value)

// Traffic chart — pick first zone's history
const liveTrafficChartData = computed(() => {
  const firstZoneReadings = Object.values(liveTrafficHistoryMap.value)[0] ?? []
  return firstZoneReadings.map(r => r.traffic_index * 100)
})
const liveTrafficChartLabels = computed(() => {
  const firstZoneReadings = Object.values(liveTrafficHistoryMap.value)[0] ?? []
  return firstZoneReadings.map(r => new Date(r.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
})

const trafficChartDatasets = computed(() => [{
  label: 'Traffic Index (×100)',
  data: liveTrafficChartData.value,
  borderColor: '#f59e0b',
  backgroundColor: 'rgba(245,158,11,0.08)',
  fill: true
}])

const trafficChartLabels = computed(() => liveTrafficChartLabels.value)

// Active incidents KPI
const activeIncidentsCount = computed(() =>
  Object.values(liveEventCurrentMap.value).filter(e => e.active).length
)

const congestedZones = computed(() =>
  Object.values(liveTrafficCurrentMap.value).filter(c => c.traffic_index > 0.7).length
)

const avgTrafficIndex = computed(() => {
  const values = Object.values(liveTrafficCurrentMap.value)
  if (!values.length) return 0
  return Math.round((values.reduce((s, c) => s + c.traffic_index, 0) / values.length) * 100)
})

const trafficColumns = [
  { field: 'id', header: 'Zone / Signal ID', sortable: true },
  { field: 'zoneId', header: 'Zone', sortable: true },
  { field: 'flowLevel', header: 'Flow Level', type: 'status' as const, sortable: true },
  { field: 'vehicleCount', header: 'Vehicle Count', type: 'number' as const, sortable: true },
  { field: 'timestamp', header: 'Timestamp', type: 'date' as const, sortable: true }
]

// ─── Events — live rows ───────────────────────────────────────────────────────
const cityEventRows = computed(() => {
  const rows: Array<{ id: string; type: string; zoneId: string; severity: string; status: string; timestamp: string }> = []
  for (const [zoneId, cur] of Object.entries(liveEventCurrentMap.value)) {
    rows.push({ id: `${zoneId}-cur`, type: cur.event_type, zoneId, severity: cur.severity, status: cur.active ? 'active' : 'resolved', timestamp: cur.timestamp })
  }
  for (const [zoneId, readings] of Object.entries(liveEventHistoryMap.value)) {
    for (const r of readings.slice(0, 3)) {
      rows.push({ id: `${zoneId}-h-${r.timestamp}`, type: r.event_type, zoneId, severity: r.severity, status: r.active ? 'active' : 'resolved', timestamp: r.timestamp })
    }
  }
  return rows
})

const incidentColumns = [
  { field: 'id', header: 'Event ID', sortable: true },
  { field: 'type', header: 'Type', sortable: true },
  { field: 'zoneId', header: 'Zone', sortable: true },
  { field: 'severity', header: 'Severity', type: 'status' as const, sortable: true },
  { field: 'status', header: 'Status', type: 'status' as const, sortable: true },
  { field: 'timestamp', header: 'Timestamp', type: 'date' as const, sortable: true }
]

// ─── Weather / Visibility — live ──────────────────────────────────────────────
const liveWeatherChartLabels = computed(() =>
  liveWeatherHistory.value.map(r => new Date(r.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
)

const visibilityChartDatasets = computed(() => [
  {
    label: 'Visibility (km)',
    data: liveWeatherHistory.value.map(r => r.visibility),
    borderColor: '#0ea5e9',
    backgroundColor: 'rgba(14,165,233,0.08)',
    fill: true
  },
  {
    label: 'Fog Index (%)',
    data: liveWeatherHistory.value.map(r => r.fog_index * 100),
    borderColor: '#94a3b8',
    backgroundColor: 'transparent'
  }
])

const weatherChartLabels = computed(() => liveWeatherChartLabels.value)

// Live weather table rows
const liveWeatherRows = computed(() =>
  liveWeatherHistory.value.slice(0, 10).map((r, i) => ({
    id: `WX-${i + 1}`,
    timestamp: r.timestamp,
    visibility: r.visibility.toFixed(1),
    fogIndex: (r.fog_index * 100).toFixed(1),
    sunrise: r.sunrise_time,
    sunset: r.sunset_time
  }))
)

const weatherTableRows = computed(() => liveWeatherRows.value)

const weatherColumns = [
  { field: 'id', header: 'Record ID', sortable: true },
  { field: 'timestamp', header: 'Timestamp', type: 'date' as const, sortable: true },
  { field: 'visibility', header: 'Visibility (km)', sortable: true },
  { field: 'fogIndex', header: 'Fog Index (%)', sortable: true },
  { field: 'sunrise', header: 'Sunrise', sortable: true },
  { field: 'sunset', header: 'Sunset', sortable: true }
]

// ─── Sunrise / Sunset — from live weather only ────────────────────────────────
const todaySunrise = computed(() => liveWeatherCurrent.value?.sunrise_time ?? '—')
const todaySunset = computed(() => liveWeatherCurrent.value?.sunset_time ?? '—')
const currentVisibility = computed(() => liveWeatherCurrent.value ? `${liveWeatherCurrent.value.visibility.toFixed(1)} km` : '—')
const currentFogIndex = computed(() => liveWeatherCurrent.value ? `${(liveWeatherCurrent.value.fog_index * 100).toFixed(0)}%` : '—')

function eventSeverityBadge(s: string): string {
  return s === 'high' ? 'error' : s === 'medium' ? 'warning' : 'info'
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Context Data"
      subtitle="Motion events, traffic signals, weather conditions, and urban context feeds"
      :breadcrumbs="[{ label: 'Use Cases' }, { label: 'Smart City' }, { label: 'Context' }]"
    />

    <div class="view-body">
      <!-- Data source banner -->
      <div v-if="loading" class="data-banner data-banner--loading">
        <i class="pi pi-spin pi-spinner"></i> Loading live data from simulation API...
      </div>
      <div v-else-if="isLive" class="data-banner data-banner--live">
        <i class="pi pi-wifi"></i> Live data from simulation API
        <span v-if="liveWeatherCurrent" class="banner-extra">
          &nbsp;· Visibility {{ currentVisibility }} · Fog {{ currentFogIndex }} · Sunrise {{ todaySunrise }} / Sunset {{ todaySunset }}
        </span>
      </div>
      <div v-else-if="error" class="api-error">
        <i class="pi pi-exclamation-circle"></i>
        <p>Could not load data from simulation API</p>
        <Button label="Retry" size="small" @click="fetchData()" />
      </div>

      <!-- ── Motion / Presence — no API ── -->
      <div class="context-section">
        <div class="context-section__header">
          <div class="context-section__title-group">
            <div class="context-section__dot" style="background: #8b5cf6;"></div>
            <h2 class="context-section__title">Motion / Presence</h2>
          </div>
          <span class="section-tag">PIR Sensors + Computer Vision</span>
        </div>
        <div class="card card-body no-data-msg">
          <i class="pi pi-info-circle"></i>
          <span>No data available — this module requires backend integration</span>
        </div>
      </div>

      <!-- ── Traffic / Incidents ── -->
      <div class="context-section">
        <div class="context-section__header">
          <div class="context-section__title-group">
            <div class="context-section__dot" style="background: #f59e0b;"></div>
            <h2 class="context-section__title">Traffic / Incidents</h2>
          </div>
          <span class="section-tag">Camera Array + Traffic API</span>
        </div>

        <div class="kpi-row">
          <KpiCard label="Traffic Zones" :value="trafficRows.length" unit="" trend="stable" icon="pi-car" color="#f59e0b" />
          <KpiCard label="Active Incidents" :value="activeIncidentsCount" unit="" trend="up" trend-value="+1" icon="pi-exclamation-triangle" color="#ef4444" />
          <KpiCard label="Congested Zones" :value="congestedZones" unit="" trend="stable" icon="pi-map" color="#ef4444" />
          <KpiCard :label="isLive ? 'Avg Traffic Index' : 'Avg Vehicle Count'" :value="avgTrafficIndex" :unit="isLive ? '' : '/hr'" trend="stable" icon="pi-gauge" color="#0ea5e9" />
        </div>

        <div class="card card-body">
          <div class="section-title" style="margin-bottom: 0.75rem;">Traffic Index — Live History</div>
          <TimeSeriesChart :datasets="trafficChartDatasets" :labels="trafficChartLabels" y-axis-label="Traffic Index (×100)" :height="220" />
        </div>

        <div class="table-pair">
          <DataTablePage
            :title="`${trafficRows.length} live traffic zones`"
            :columns="trafficColumns"
            :data="trafficRows as unknown as Record<string, unknown>[]"
            :filters="[
              { label: 'Congested', value: 'congested', field: 'flowLevel' },
              { label: 'Moderate', value: 'moderate', field: 'flowLevel' },
              { label: 'Light', value: 'light', field: 'flowLevel' }
            ]"
            empty-icon="pi-car"
            empty-title="No traffic data"
          />
          <DataTablePage
            :title="`${cityEventRows.length} city events`"
            :columns="incidentColumns"
            :data="cityEventRows as unknown as Record<string, unknown>[]"
            :filters="[
              { label: 'Active', value: 'active', field: 'status' },
              { label: 'Resolved', value: 'resolved', field: 'status' }
            ]"
            empty-icon="pi-exclamation-triangle"
            empty-title="No city events"
          />
        </div>
      </div>

      <!-- ── Noise Indicators — no API ── -->
      <div class="context-section">
        <div class="context-section__header">
          <div class="context-section__title-group">
            <div class="context-section__dot" style="background: #ef4444;"></div>
            <h2 class="context-section__title">Noise Indicators</h2>
          </div>
          <span class="section-tag">Environmental Acoustic Sensors</span>
        </div>
        <div class="card card-body no-data-msg">
          <i class="pi pi-info-circle"></i>
          <span>No data available — this module requires backend integration</span>
        </div>
      </div>

      <!-- ── Weather ── -->
      <div class="context-section">
        <div class="context-section__header">
          <div class="context-section__title-group">
            <div class="context-section__dot" style="background: #0ea5e9;"></div>
            <h2 class="context-section__title">Weather</h2>
          </div>
          <span class="section-tag">Weather Station HQ · OpenWeatherMap</span>
        </div>

        <div class="kpi-row">
          <KpiCard label="Visibility" :value="currentVisibility" unit="" trend="stable" icon="pi-eye" color="#0ea5e9" />
          <KpiCard label="Fog Index" :value="currentFogIndex" unit="" trend="stable" icon="pi-cloud" color="#94a3b8" />
          <KpiCard label="Today's Sunrise" :value="todaySunrise" unit="" trend="stable" icon="pi-sun" color="#f59e0b" />
          <KpiCard label="Today's Sunset" :value="todaySunset" unit="" trend="stable" icon="pi-moon" color="#8b5cf6" />
        </div>

        <div class="card card-body">
          <div class="section-title" style="margin-bottom: 0.75rem;">Visibility &amp; Fog Index — Live History</div>
          <TimeSeriesChart :datasets="visibilityChartDatasets" :labels="weatherChartLabels" y-axis-label="Value" :height="240" />
        </div>

        <DataTablePage
          title="Weather / Visibility Observations"
          :columns="weatherColumns"
          :data="weatherTableRows as unknown as Record<string, unknown>[]"
          empty-icon="pi-cloud"
          empty-title="No weather data"
        />
      </div>

      <!-- ── Sunrise / Sunset ── -->
      <div class="context-section">
        <div class="context-section__header">
          <div class="context-section__title-group">
            <div class="context-section__dot" style="background: #f59e0b;"></div>
            <h2 class="context-section__title">Sunrise / Sunset</h2>
          </div>
          <span class="section-tag">Astronomical Calculator · Astral lib</span>
        </div>

        <div class="kpi-row">
          <KpiCard label="Today's Sunrise" :value="todaySunrise" unit="" trend="stable" icon="pi-sun" color="#f59e0b" />
          <KpiCard label="Today's Sunset" :value="todaySunset" unit="" trend="stable" icon="pi-moon" color="#8b5cf6" />
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 2rem; }

.data-banner {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.8rem; font-weight: 500; padding: 0.5rem 1rem;
  border-radius: var(--facis-radius-sm); border: 1px solid; flex-wrap: wrap;
}
.data-banner--loading { background: #f0f9ff; border-color: #bae6fd; color: #0369a1; }
.data-banner--live { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
.banner-extra { opacity: 0.8; font-weight: 400; }

/* Context section wrapper */
.context-section { display: flex; flex-direction: column; gap: 1.25rem; }
.context-section__header { display: flex; align-items: center; justify-content: space-between; }
.context-section__title-group { display: flex; align-items: center; gap: 0.625rem; }
.context-section__dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.context-section__title { font-size: 1rem; font-weight: 700; color: var(--facis-text); margin: 0; }
.section-tag { font-size: 0.72rem; color: var(--facis-text-secondary); background: var(--facis-surface-2); border: 1px solid var(--facis-border); padding: 0.2rem 0.6rem; border-radius: 20px; }
.section-title { font-size: 0.875rem; font-weight: 600; color: var(--facis-text); }

/* KPI row with fixed 4-col grid */
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
@media (max-width: 1100px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px) { .kpi-row { grid-template-columns: 1fr; } }

/* Table pair */
.table-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
@media (max-width: 1000px) { .table-pair { grid-template-columns: 1fr; } }

/* Noise note */
.noise-threshold-note { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.75rem; font-size: 0.75rem; color: var(--facis-text-secondary); }

.api-error {
  display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
  padding: 2rem; margin: 1.5rem; border: 1px solid #fee2e2;
  border-radius: var(--facis-radius); background: #fff5f5;
  color: #991b1b; font-size: 0.875rem; text-align: center;
}
.no-data-msg {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.82rem; color: var(--facis-text-secondary);
}
</style>
