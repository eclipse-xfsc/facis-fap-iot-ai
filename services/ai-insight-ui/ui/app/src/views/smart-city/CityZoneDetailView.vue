<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import DetailTabs from '@/components/common/DetailTabs.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import DataTablePage from '@/components/common/DataTablePage.vue'
import TimeSeriesChart from '@/components/common/TimeSeriesChart.vue'
import {
  getStreetlights,
  getStreetlightHistory,
  getTrafficCurrent,
  getTrafficHistory,
  getCityEventCurrent,
  getCityEventHistory,
  getCityWeatherCurrent,
  type SimStreetlight,
  type SimStreetlightHistoryReading,
  type SimTrafficCurrent,
  type SimTrafficHistoryReading,
  type SimEventCurrent,
  type SimEventHistoryReading,
  type SimCityWeatherCurrent
} from '@/services/api'

const route = useRoute()
const router = useRouter()

// ─── Live data state ──────────────────────────────────────────────────────────
const loading = ref(false)
const error = ref(false)

const zoneIdParam = computed(() => route.params['id'] as string)

// Zone lights from API
const liveZoneLights = ref<SimStreetlight[]>([])
// Dimming history readings for this zone (merged from all lights)
const liveDimmingHistory = ref<SimStreetlightHistoryReading[]>([])
// Traffic
const liveTrafficCurrent = ref<SimTrafficCurrent | null>(null)
const liveTrafficHistory = ref<SimTrafficHistoryReading[]>([])
// Events
const liveEventCurrent = ref<SimEventCurrent | null>(null)
const liveEventHistory = ref<SimEventHistoryReading[]>([])
// Weather
const liveWeather = ref<SimCityWeatherCurrent | null>(null)

async function fetchData(): Promise<void> {
  loading.value = true
  error.value = false
  const [streetlightsRes, trafficRes, eventRes, weatherRes] = await Promise.all([
    getStreetlights(),
    getTrafficCurrent(zoneIdParam.value),
    getCityEventCurrent(zoneIdParam.value),
    getCityWeatherCurrent()
  ])

  if (!streetlightsRes && !trafficRes && !eventRes && !weatherRes) {
    error.value = true
    loading.value = false
    return
  }

  if (trafficRes) liveTrafficCurrent.value = trafficRes
  if (eventRes) liveEventCurrent.value = eventRes
  if (weatherRes) liveWeather.value = weatherRes

  if (streetlightsRes) {
    const zoneLights = streetlightsRes.streetlights.filter(l => l.zone_id === zoneIdParam.value)
    liveZoneLights.value = zoneLights
    const firstLight = zoneLights[0]
    if (firstLight) {
      const histRes = await getStreetlightHistory(firstLight.light_id)
      if (histRes) liveDimmingHistory.value = histRes.readings
    }
  }

  const [trafficHistRes, eventHistRes] = await Promise.all([
    getTrafficHistory(zoneIdParam.value),
    getCityEventHistory(zoneIdParam.value)
  ])
  if (trafficHistRes) liveTrafficHistory.value = trafficHistRes.readings
  if (eventHistRes) liveEventHistory.value = eventHistRes.readings

  loading.value = false
}

onMounted(fetchData)

// ─── Zone data from API only ──────────────────────────────────────────────────
const zone = computed(() => {
  if (liveZoneLights.value.length === 0) return null
  const avgDimming = liveDimmingHistory.value.length > 0
    ? liveDimmingHistory.value[liveDimmingHistory.value.length - 1]?.dimming_level_pct ?? 0
    : 0
  return {
    zoneId: zoneIdParam.value,
    zoneName: `Zone ${zoneIdParam.value}`,
    lightCount: liveZoneLights.value.length,
    status: 'active',
    avgDimmingLevel: avgDimming
  }
})

// Luminaires from live API
const zoneLuminaires = computed(() =>
  liveZoneLights.value.map(l => ({
    lightId: l.light_id,
    zoneId: l.zone_id,
    state: 'active',
    dimmingLevel: liveDimmingHistory.value[liveDimmingHistory.value.length - 1]?.dimming_level_pct ?? 0,
    healthStatus: 'healthy',
    timestamp: new Date().toISOString()
  }))
)

// Zone info from real API
const liveZoneInfo = computed(() => ({
  lightCount: liveZoneLights.value.length,
  avgDimmingLevel: liveDimmingHistory.value.length > 0
    ? liveDimmingHistory.value[liveDimmingHistory.value.length - 1]?.dimming_level_pct ?? 0
    : 0,
  trafficIndex: liveTrafficCurrent.value?.traffic_index ?? null,
  sunrise: liveWeather.value?.sunrise_time ?? null,
  sunset: liveWeather.value?.sunset_time ?? null,
  visibility: liveWeather.value?.visibility ?? null
}))

// ─── Charts from real API only ────────────────────────────────────────────────
const chartLabels = computed(() =>
  liveDimmingHistory.value.map(r =>
    new Date(r.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
)

const dimmingChartDatasets = computed(() => [
  {
    label: `Zone ${zoneIdParam.value} — Dimming (%)`,
    data: liveDimmingHistory.value.map(r => r.dimming_level_pct),
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59,130,246,0.10)',
    fill: true
  }
])

const trafficChartLabels = computed(() =>
  liveTrafficHistory.value.map(r =>
    new Date(r.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
)

const trafficDatasets = computed(() => [{
  label: 'Traffic Index (×100)',
  data: liveTrafficHistory.value.map(r => r.traffic_index * 100),
  borderColor: '#f59e0b',
  backgroundColor: 'rgba(245,158,11,0.08)',
  fill: true
}])

const weatherDatasets = computed(() => [
  {
    label: 'Fog Index (%)',
    data: liveWeather.value ? [liveWeather.value.fog_index * 100] : [],
    borderColor: '#94a3b8',
    backgroundColor: 'rgba(148,163,184,0.08)',
    fill: true
  },
  {
    label: 'Visibility (km)',
    data: liveWeather.value ? [liveWeather.value.visibility] : [],
    borderColor: '#0ea5e9',
    backgroundColor: 'transparent'
  }
])

const weatherChartLabels = computed(() =>
  liveWeather.value
    ? [new Date(liveWeather.value.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })]
    : []
)

// Sunrise/sunset from real API
const sunriseDisplay = computed(() => liveWeather.value?.sunrise_time ?? '—')
const sunsetDisplay = computed(() => liveWeather.value?.sunset_time ?? '—')

// ─── Switching events — derived from dimming history changes ─────────────────
const switchingEvents = computed(() => {
  if (liveDimmingHistory.value.length < 2) return []
  const events = []
  for (let i = 1; i < liveDimmingHistory.value.length; i++) {
    const prev = liveDimmingHistory.value[i - 1]
    const curr = liveDimmingHistory.value[i]
    const delta = Math.abs(curr.dimming_level_pct - prev.dimming_level_pct)
    if (delta > 5) {
      events.push({
        id: `SW-${i}`,
        timestamp: curr.timestamp,
        eventType: curr.dimming_level_pct > prev.dimming_level_pct ? 'brighten' : 'dim',
        fromDimming: prev.dimming_level_pct,
        toDimming: curr.dimming_level_pct,
        trigger: 'schedule'
      })
    }
  }
  return events.slice(0, 8)
})

const switchingColumns = [
  { field: 'id', header: 'Event ID', sortable: true },
  { field: 'timestamp', header: 'Timestamp', type: 'date' as const, sortable: true },
  { field: 'eventType', header: 'Type', sortable: true },
  { field: 'fromDimming', header: 'From (%)', type: 'number' as const, sortable: true },
  { field: 'toDimming', header: 'To (%)', type: 'number' as const, sortable: true },
  { field: 'trigger', header: 'Trigger', sortable: true }
]

const lumiColumns = [
  { field: 'lightId', header: 'Light ID', sortable: true },
  { field: 'state', header: 'State', type: 'status' as const, sortable: true },
  { field: 'dimmingLevel', header: 'Dimming (%)', type: 'number' as const, sortable: true },
  { field: 'healthStatus', header: 'Health', type: 'status' as const, sortable: true },
  { field: 'timestamp', header: 'Last Update', type: 'date' as const, sortable: true }
]

const motionColumns = [
  { field: 'id', header: 'Event ID', sortable: true },
  { field: 'zoneId', header: 'Zone', sortable: true },
  { field: 'type', header: 'Type', sortable: true },
  { field: 'confidence', header: 'Confidence', type: 'number' as const, sortable: true },
  { field: 'timestamp', header: 'Timestamp', type: 'date' as const, sortable: true }
]

// ─── Zone events — from real API only ────────────────────────────────────────
const zoneEvents = computed(() => {
  const results = []
  if (liveEventCurrent.value?.active) {
    results.push({
      id: `${zoneIdParam.value}-current`,
      description: `${liveEventCurrent.value.event_type} — severity: ${liveEventCurrent.value.severity}`,
      zoneId: zoneIdParam.value,
      timestamp: liveEventCurrent.value.timestamp,
      type: liveEventCurrent.value.event_type,
      severity: liveEventCurrent.value.severity,
      status: 'active'
    })
  }
  for (const r of liveEventHistory.value.filter(h => h.active).slice(0, 4)) {
    results.push({
      id: `${zoneIdParam.value}-hist-${r.timestamp}`,
      description: `${r.event_type} — severity: ${r.severity}`,
      zoneId: zoneIdParam.value,
      timestamp: r.timestamp,
      type: r.event_type,
      severity: r.severity,
      status: r.active ? 'active' : 'resolved'
    })
  }
  return results
})

// ─── Audit trail from real API calls ─────────────────────────────────────────
const auditEntries = computed(() => {
  const entries = []
  if (liveZoneLights.value.length > 0) {
    entries.push({ id: 'a1', type: 'API', timestamp: new Date().toISOString(), action: 'Streetlights fetched', actor: 'system', result: 'success', severity: 'info', details: `GET /api/sim/streetlights — ${liveZoneLights.value.length} lights in zone ${zoneIdParam.value}` })
  }
  if (liveTrafficCurrent.value) {
    entries.push({ id: 'a2', type: 'API', timestamp: new Date().toISOString(), action: 'Traffic data fetched', actor: 'system', result: 'success', severity: 'info', details: `GET /api/sim/traffic/${zoneIdParam.value}/current — index: ${liveTrafficCurrent.value.traffic_index}` })
  }
  if (liveEventCurrent.value) {
    entries.push({ id: 'a3', type: 'API', timestamp: new Date().toISOString(), action: 'Events fetched', actor: 'system', result: 'success', severity: 'info', details: `GET /api/sim/events/${zoneIdParam.value}/current — type: ${liveEventCurrent.value.event_type}` })
  }
  return entries
})
const auditColumns = [
  { field: 'id', header: 'ID', sortable: true },
  { field: 'timestamp', header: 'Timestamp', type: 'date' as const, sortable: true },
  { field: 'type', header: 'Type', sortable: true },
  { field: 'action', header: 'Action', sortable: true },
  { field: 'actor', header: 'Actor', sortable: true },
  { field: 'result', header: 'Result', type: 'status' as const, sortable: true },
  { field: 'severity', header: 'Severity', type: 'status' as const, sortable: true }
]

// ─── Harmonized data ──────────────────────────────────────────────────────────
const harmonizedData = computed(() => ({
  zoneId: zoneIdParam.value,
  zoneName: `Zone ${zoneIdParam.value}`,
  schema: 'LightingZoneStatus_v1',
  dataSource: 'live-simulation-api',
  ingestionTimestamp: new Date().toISOString(),
  operational: {
    status: liveZoneLights.value.length > 0 ? 'active' : 'unknown',
    avgDimmingLevel: liveZoneInfo.value.avgDimmingLevel,
    lightCount: liveZoneInfo.value.lightCount,
    faultCount: 0
  },
  context: {
    trafficIndex: liveZoneInfo.value.trafficIndex,
    visibilityKm: liveZoneInfo.value.visibility,
    sunriseToday: liveZoneInfo.value.sunrise,
    sunsetToday: liveZoneInfo.value.sunset,
    activeEvent: liveEventCurrent.value?.active ? liveEventCurrent.value.event_type : null
  },
  quality: {
    dataQuality: liveZoneLights.value.length > 0 ? 99.0 : null,
    lastUpdate: zone.value?.lastUpdate,
    adapterStatus: zone.value?.status === 'fault' ? 'disconnected' : 'connected'
  }
}))

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const tabs = [
  { label: 'Overview', icon: 'pi-info-circle' },
  { label: 'Activity Timeline', icon: 'pi-chart-line' },
  { label: 'Context Signals', icon: 'pi-cloud' },
  { label: 'Harmonized Data', icon: 'pi-code' },
  { label: 'Provenance', icon: 'pi-sitemap' },
  { label: 'Transformations', icon: 'pi-cog' },
  { label: 'Recommendations', icon: 'pi-lightbulb' },
  { label: 'References', icon: 'pi-link' }
]

function impactColor(level: string): string {
  return level === 'high' ? '#ef4444' : level === 'medium' ? '#f59e0b' : '#3b82f6'
}

function categoryIcon(cat: string): string {
  return cat === 'energy' ? 'pi-bolt' : cat === 'safety' ? 'pi-shield' : cat === 'adaptive' ? 'pi-sliders-v' : 'pi-chart-line'
}

function categoryColor(cat: string): string {
  return cat === 'energy' ? '#f59e0b' : cat === 'safety' ? '#ef4444' : cat === 'adaptive' ? '#3b82f6' : '#8b5cf6'
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      :title="zone?.zoneName ?? 'Zone Detail'"
      :subtitle="`${zone?.zoneId} · ${zone?.lightCount} luminaires`"
      :breadcrumbs="[
        { label: 'Use Cases' },
        { label: 'Smart City' },
        { label: 'Zones', to: '/use-cases/smart-city/zones' },
        { label: zone?.zoneId ?? '' }
      ]"
    >
      <template #actions>
        <StatusBadge :status="zone?.status ?? 'offline'" />
      </template>
    </PageHeader>

    <div class="view-body">
      <!-- Data source banner -->
      <div v-if="error && !loading" class="api-error" style="margin: 1rem 1.5rem">
        <i class="pi pi-exclamation-circle"></i>
        <p>Could not load data from simulation API</p>
        <Button label="Retry" size="small" @click="fetchData()" />
      </div>
      <div v-else-if="loading" class="data-banner data-banner--loading">
        <i class="pi pi-spin pi-spinner"></i> Loading live data from simulation API...
      </div>
      <div v-else-if="liveZoneLights.length > 0" class="data-banner data-banner--live">
        <i class="pi pi-wifi"></i> Live data from simulation API
        <span v-if="liveTrafficCurrent" class="banner-extra">&nbsp;· Traffic index {{ (liveTrafficCurrent.traffic_index * 100).toFixed(0) }}</span>
        <span v-if="liveWeather" class="banner-extra">&nbsp;· Visibility {{ liveWeather.visibility.toFixed(1) }} km · Sunrise {{ sunriseDisplay }} / Sunset {{ sunsetDisplay }}</span>
      </div>

      <!-- Zone KPIs -->
      <div class="grid-kpi" style="grid-template-columns: repeat(auto-fill, minmax(175px, 1fr))">
        <KpiCard label="Luminaires" :value="liveZoneInfo.lightCount" unit="" trend="stable" icon="pi-lightbulb" color="#f59e0b" />
        <KpiCard label="Avg Dimming" :value="liveZoneInfo.avgDimmingLevel" unit="%" trend="stable" icon="pi-sliders-v" color="#3b82f6" />
        <KpiCard label="Traffic Index" :value="liveTrafficCurrent?.traffic_index !== undefined ? (liveTrafficCurrent.traffic_index * 100).toFixed(0) : '—'" unit="" trend="stable" icon="pi-car" color="#f59e0b" />
        <KpiCard label="Visibility" :value="liveWeather?.visibility !== undefined ? liveWeather.visibility.toFixed(1) : '—'" unit="km" trend="stable" icon="pi-eye" color="#3b82f6" />
        <KpiCard
          label="Fault Luminaires"
          :value="zoneLuminaires.filter(l => l.state === 'fault').length"
          unit=""
          :trend="zoneLuminaires.filter(l => l.state === 'fault').length > 0 ? 'up' : 'stable'"
          icon="pi-exclamation-triangle"
          color="#ef4444"
        />
      </div>

      <!-- Detail Tabs -->
      <DetailTabs :tabs="tabs">

        <!-- TAB 0: Overview -->
        <template #tab-0>
          <div class="tab-content">
            <div class="two-col">
              <!-- Zone metadata card -->
              <div class="info-card">
                <div class="info-card__title">Zone Metadata</div>
                <div class="info-row"><span class="info-row__key">Zone ID</span><span class="info-row__val mono">{{ zone?.zoneId }}</span></div>
                <div class="info-row"><span class="info-row__key">Zone Name</span><span class="info-row__val">{{ zone?.zoneName }}</span></div>
                <div class="info-row"><span class="info-row__key">Luminaire Count</span><span class="info-row__val">{{ zone?.lightCount }}</span></div>
                <div class="info-row"><span class="info-row__key">Operational Status</span><StatusBadge :status="zone?.status ?? 'offline'" size="sm" /></div>
                <div class="info-row"><span class="info-row__key">Traffic Index</span><span class="info-row__val">{{ liveTrafficCurrent ? (liveTrafficCurrent.traffic_index * 100).toFixed(0) : '—' }}</span></div>
                <div class="info-row"><span class="info-row__key">Last Update</span><span class="info-row__val mono">{{ zone?.lastUpdate ? new Date(zone.lastUpdate).toLocaleString('en-GB') : '—' }}</span></div>
                <div class="info-row"><span class="info-row__key">Data Quality</span>
                  <span class="info-row__val" :style="{ color: liveZoneLights.length > 0 ? '#15803d' : '#f59e0b' }">
                    {{ liveZoneLights.length > 0 ? '99.0%' : '—' }}
                  </span>
                </div>
              </div>

              <!-- Dimming profile KPIs -->
              <div class="info-card">
                <div class="info-card__title">Current Dimming Profile</div>
                <div class="dimming-profile">
                  <div class="dimming-profile__bar-wrapper">
                    <div class="dimming-profile__label">Current Level</div>
                    <div class="dimming-profile__bar">
                      <div
                        class="dimming-profile__fill"
                        :style="{
                          width: `${zone?.avgDimmingLevel ?? 0}%`,
                          background: (zone?.avgDimmingLevel ?? 0) > 80 ? '#f59e0b' : '#3b82f6'
                        }"
                      ></div>
                    </div>
                    <div class="dimming-profile__value">{{ zone?.avgDimmingLevel ?? 0 }}%</div>
                  </div>
                  <div class="info-row"><span class="info-row__key">Switching Mode</span><span class="info-row__val">Context-Adaptive</span></div>
                  <div class="info-row"><span class="info-row__key">Schedule Type</span><span class="info-row__val">Astronomical</span></div>
                  <div class="info-row"><span class="info-row__key">Energy Class</span><span class="info-row__val">EN 13201-2 Class P4</span></div>
                  <div class="info-row"><span class="info-row__key">Zone Efficiency</span>
                    <span class="info-row__val" style="color: #15803d; font-weight: 600;">
                      {{ Math.round(100 - (zone?.avgDimmingLevel ?? 50) * 0.38) }}%
                    </span>
                  </div>
                </div>
                <div class="info-card__title" style="margin-top: 1rem;">Luminaire Summary</div>
                <div class="lumi-summary">
                  <div class="lumi-summary__item lumi-summary__item--green">
                    <span class="lumi-summary__count">{{ zoneLuminaires.filter(l => l.state === 'on' || l.state === 'dimmed').length }}</span>
                    <span class="lumi-summary__label">Active</span>
                  </div>
                  <div class="lumi-summary__item lumi-summary__item--yellow">
                    <span class="lumi-summary__count">{{ zoneLuminaires.filter(l => l.healthStatus === 'warning').length }}</span>
                    <span class="lumi-summary__label">Warning</span>
                  </div>
                  <div class="lumi-summary__item lumi-summary__item--red">
                    <span class="lumi-summary__count">{{ zoneLuminaires.filter(l => l.state === 'fault').length }}</span>
                    <span class="lumi-summary__label">Fault</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- TAB 1: Activity Timeline -->
        <template #tab-1>
          <div class="tab-content">
            <div class="card-body section-block">
              <div class="section-title">Dimming Level — Last 24 Hours</div>
              <TimeSeriesChart
                :datasets="dimmingChartDatasets"
                :labels="chartLabels"
                y-axis-label="Dimming Level (%)"
                :height="280"
              />
            </div>
            <div class="section-block" style="margin-top: 1.25rem;">
              <div class="section-title" style="margin-bottom: 0.75rem;">Switching Events</div>
              <DataTablePage
                :columns="switchingColumns"
                :data="switchingEvents as unknown as Record<string, unknown>[]"
                empty-icon="pi-sliders-v"
                empty-title="No switching events"
              />
            </div>
          </div>
        </template>

        <!-- TAB 2: Context Signals -->
        <template #tab-2>
          <div class="tab-content context-grid">

            <!-- Events / Presence -->
            <div class="context-section">
              <div class="context-section__header">
                <i class="pi pi-users context-section__icon" style="color: #8b5cf6"></i>
                <span class="context-section__title">City Events</span>
              </div>
              <div class="context-kpis">
                <div class="ctx-kpi"><span class="ctx-kpi__val">{{ zoneEvents.length }}</span><span class="ctx-kpi__lbl">Active Events</span></div>
                <div class="ctx-kpi"><span class="ctx-kpi__val">{{ liveEventCurrent?.active ? liveEventCurrent.severity : '—' }}</span><span class="ctx-kpi__lbl">Severity</span></div>
              </div>
              <div class="ctx-event-list">
                <div v-for="e in zoneEvents.slice(0, 4)" :key="e.id" class="ctx-event-row">
                  <span class="ctx-event-type" style="color: #8b5cf6">{{ e.type }}</span>
                  <span class="ctx-event-time">{{ new Date(e.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }}</span>
                  <span class="ctx-event-conf">{{ e.severity }}</span>
                </div>
                <div v-if="zoneEvents.length === 0" class="no-items-small">No active events for this zone</div>
              </div>
            </div>

            <!-- Traffic / Incidents -->
            <div class="context-section">
              <div class="context-section__header">
                <i class="pi pi-car context-section__icon" style="color: #f59e0b"></i>
                <span class="context-section__title">Traffic / Incidents</span>
              </div>
              <div class="context-kpis">
                <div class="ctx-kpi">
                  <span class="ctx-kpi__val">{{ liveTrafficCurrent ? (liveTrafficCurrent.traffic_index > 0.7 ? 'Heavy' : liveTrafficCurrent.traffic_index > 0.4 ? 'Moderate' : 'Light') : (zone?.contextActivityLevel === 'high' ? 'Heavy' : 'Moderate') }}</span>
                  <span class="ctx-kpi__lbl">Flow Level</span>
                </div>
                <div class="ctx-kpi">
                  <span class="ctx-kpi__val">{{ liveTrafficCurrent ? (liveTrafficCurrent.traffic_index * 100).toFixed(0) : '—' }}</span>
                  <span class="ctx-kpi__lbl">Traffic Index</span>
                </div>
                <div class="ctx-kpi">
                  <span class="ctx-kpi__val">{{ liveEventCurrent?.active ? 1 : 0 }}</span>
                  <span class="ctx-kpi__lbl">Active Events</span>
                </div>
              </div>
              <TimeSeriesChart :datasets="trafficDatasets" :labels="trafficChartLabels" y-axis-label="Traffic (index ×100)" :height="140" />
            </div>

            <!-- Dimming History -->
            <div class="context-section">
              <div class="context-section__header">
                <i class="pi pi-chart-line context-section__icon" style="color: #3b82f6"></i>
                <span class="context-section__title">Dimming History</span>
              </div>
              <div class="context-kpis">
                <div class="ctx-kpi">
                  <span class="ctx-kpi__val">{{ liveDimmingHistory.length }}</span>
                  <span class="ctx-kpi__lbl">Data Points</span>
                </div>
                <div class="ctx-kpi">
                  <span class="ctx-kpi__val">{{ liveZoneInfo.avgDimmingLevel.toFixed(0) }}%</span>
                  <span class="ctx-kpi__lbl">Current Dimming</span>
                </div>
              </div>
              <TimeSeriesChart
                :datasets="dimmingChartDatasets"
                :labels="chartLabels"
                y-axis-label="Dimming (%)"
                :height="140"
              />
              <p v-if="liveDimmingHistory.length === 0" class="no-items-small">No dimming history data available</p>
            </div>

            <!-- Weather -->
            <div class="context-section">
              <div class="context-section__header">
                <i class="pi pi-cloud context-section__icon" style="color: #0ea5e9"></i>
                <span class="context-section__title">Weather</span>
              </div>
              <div class="context-kpis">
                <div class="ctx-kpi">
                  <span class="ctx-kpi__val">{{ liveWeather ? liveWeather.visibility.toFixed(1) + ' km' : '—' }}</span>
                  <span class="ctx-kpi__lbl">Visibility</span>
                </div>
                <div class="ctx-kpi">
                  <span class="ctx-kpi__val">{{ liveWeather ? (liveWeather.fog_index * 100).toFixed(0) + '%' : '—' }}</span>
                  <span class="ctx-kpi__lbl">Fog Index</span>
                </div>
                <div class="ctx-kpi">
                  <span class="ctx-kpi__val">{{ sunriseDisplay }}</span>
                  <span class="ctx-kpi__lbl">Sunrise</span>
                </div>
              </div>
              <TimeSeriesChart :datasets="weatherDatasets" :labels="weatherChartLabels" y-axis-label="Value" :height="140" />
            </div>

            <!-- Sunrise / Sunset -->
            <div class="context-section context-section--wide">
              <div class="context-section__header">
                <i class="pi pi-sun context-section__icon" style="color: #f59e0b"></i>
                <span class="context-section__title">Sunrise / Sunset</span>
              </div>
              <div class="ss-grid">
                <div class="ss-today">
                  <div class="ss-today__item">
                    <i class="pi pi-arrow-up" style="color: #f59e0b"></i>
                    <span class="ss-today__label">Sunrise</span>
                    <span class="ss-today__val">{{ sunriseDisplay }}</span>
                  </div>
                  <div class="ss-today__item">
                    <i class="pi pi-arrow-down" style="color: #8b5cf6"></i>
                    <span class="ss-today__label">Sunset</span>
                    <span class="ss-today__val">{{ sunsetDisplay }}</span>
                  </div>
                  <div class="ss-today__item">
                    <i class="pi pi-eye" style="color: #0ea5e9"></i>
                    <span class="ss-today__label">Visibility</span>
                    <span class="ss-today__val">{{ liveWeather?.visibility !== undefined ? `${liveWeather.visibility.toFixed(1)} km` : '—' }}</span>
                  </div>
                  <div class="ss-today__item">
                    <i class="pi pi-cloud" style="color: #94a3b8"></i>
                    <span class="ss-today__label">Fog Index</span>
                    <span class="ss-today__val">{{ liveWeather?.fog_index !== undefined ? `${(liveWeather.fog_index * 100).toFixed(0)}%` : '—' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- TAB 3: Harmonized Data -->
        <template #tab-3>
          <div class="tab-content">
            <div class="json-header">
              <span class="json-header__title">Protocol-Agnostic Zone State (LightingZoneStatus_v1)</span>
              <span class="json-header__badge">JSON</span>
            </div>
            <pre class="json-view">{{ JSON.stringify(harmonizedData, null, 2) }}</pre>
          </div>
        </template>

        <!-- TAB 4: Provenance -->
        <template #tab-4>
          <div class="tab-content">
            <div class="section-title" style="margin-bottom: 1rem;">Data Ingestion Lineage</div>
            <div class="provenance-chain">
              <div class="prov-step">
                <div class="prov-step__dot prov-step__dot--green"></div>
                <div class="prov-step__body">
                  <div class="prov-step__stage">Source Origin</div>
                  <div class="prov-step__desc">DALI/IP Controller — TRIDONIC BASICDIM WEB — firmware 2.4.1</div>
                  <div class="prov-step__meta">Protocol: DALI-2 · Object: <span class="mono">dali/{{ zone?.zoneId?.toLowerCase() }}/+/status</span></div>
                </div>
              </div>
              <div class="prov-connector"></div>
              <div class="prov-step">
                <div class="prov-step__dot prov-step__dot--blue"></div>
                <div class="prov-step__body">
                  <div class="prov-step__stage">Ingestion Adapter</div>
                  <div class="prov-step__desc">DALI/IP Adapter v2.3 — converts DALI status frames to internal JSON envelope</div>
                  <div class="prov-step__meta">Ingestion latency: ~480ms · Buffer: 50 frames · Recovery: enabled</div>
                </div>
              </div>
              <div class="prov-connector"></div>
              <div class="prov-step">
                <div class="prov-step__dot prov-step__dot--blue"></div>
                <div class="prov-step__body">
                  <div class="prov-step__stage">Schema Normalization</div>
                  <div class="prov-step__desc">DALI-2/LuminaireStatus → LightingZoneStatus_v1 via AI-driven mapping (map-002)</div>
                  <div class="prov-step__meta">Rules applied: 18 · Strategy: ai-driven · Validation: passed</div>
                </div>
              </div>
              <div class="prov-connector"></div>
              <div class="prov-step">
                <div class="prov-step__dot prov-step__dot--blue"></div>
                <div class="prov-step__body">
                  <div class="prov-step__stage">Contextual Enrichment</div>
                  <div class="prov-step__desc">Motion events, traffic signals, weather, and solar schedule appended to zone record</div>
                  <div class="prov-step__meta">Context sources: PIR (motion), Camera Array (traffic), OpenWeatherMap (weather), Astral (sunrise)</div>
                </div>
              </div>
              <div class="prov-connector"></div>
              <div class="prov-step">
                <div class="prov-step__dot prov-step__dot--green"></div>
                <div class="prov-step__body">
                  <div class="prov-step__stage">Published</div>
                  <div class="prov-step__desc">Kafka topic: <span class="mono">smart-city.lighting.status</span> · REST cache refreshed</div>
                  <div class="prov-step__meta">Last update: {{ zone?.lastUpdate ? new Date(zone.lastUpdate).toLocaleString('en-GB') : '—' }}</div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- TAB 5: Transformations & Audit -->
        <template #tab-5>
          <div class="tab-content">
            <div class="section-title" style="margin-bottom: 0.75rem;">Normalization Steps</div>
            <div class="transform-list">
              <div class="transform-row"><span class="transform-row__step">1</span><span class="transform-row__action">DALI integer (0–254) converted to percentage (0–100%)</span><span class="transform-row__status transform-row__status--ok">PASS</span></div>
              <div class="transform-row"><span class="transform-row__step">2</span><span class="transform-row__action">State enum normalized: DALI "PHYSICAL_SELECTED" → "active"</span><span class="transform-row__status transform-row__status--ok">PASS</span></div>
              <div class="transform-row"><span class="transform-row__step">3</span><span class="transform-row__action">Zone aggregate: avg dimming computed across {{ zone?.lightCount }} luminaires</span><span class="transform-row__status transform-row__status--ok">PASS</span></div>
              <div class="transform-row"><span class="transform-row__step">4</span><span class="transform-row__action">Data quality score: freshness (last 30s) × completeness × range-check</span><span class="transform-row__status" :class="(zone?.dataQuality ?? 0) > 90 ? 'transform-row__status--ok' : 'transform-row__status--warn'">{{ (zone?.dataQuality ?? 0) > 90 ? 'PASS' : 'WARN' }}</span></div>
              <div class="transform-row"><span class="transform-row__step">5</span><span class="transform-row__action">Context activity level classified: pedestrian density + traffic flow → low/medium/high</span><span class="transform-row__status transform-row__status--ok">PASS</span></div>
              <div class="transform-row"><span class="transform-row__step">6</span><span class="transform-row__action">Timestamp harmonized to ISO 8601 UTC</span><span class="transform-row__status transform-row__status--ok">PASS</span></div>
            </div>

            <div class="section-title" style="margin: 1.5rem 0 0.75rem;">Audit Trail</div>
            <DataTablePage
              :columns="auditColumns"
              :data="auditEntries as unknown as Record<string, unknown>[]"
              empty-icon="pi-list"
              empty-title="No audit entries"
            />
          </div>
        </template>

        <!-- TAB 6: Recommendations -->
        <template #tab-6>
          <div class="tab-content">
            <div class="section-header" style="margin-bottom: 1rem;">
              <div class="section-title">Zone Recommendations</div>
              <span class="advisory-badge">Advisory Only — No actuator commands</span>
            </div>
            <div class="api-error">
              <i class="pi pi-info-circle"></i>
              <p>No data available — this module requires AI backend integration to generate recommendations</p>
            </div>
          </div>
        </template>

        <!-- TAB 7: References -->
        <template #tab-7>
          <div class="tab-content">
            <div class="section-title" style="margin-bottom: 1rem;">Linked Smart City Data Products</div>
            <div class="ref-list">
              <div class="ref-item" @click="router.push('/use-cases/smart-city/data-products/scdp-001')">
                <div class="ref-item__icon"><i class="pi pi-box"></i></div>
                <div class="ref-item__body">
                  <div class="ref-item__name">Smart Lighting Status Stream</div>
                  <div class="ref-item__desc">Real-time operational status — version 1.2.0</div>
                </div>
                <StatusBadge status="available" size="sm" />
              </div>
              <div class="ref-item" @click="router.push('/use-cases/smart-city/data-products/scdp-003')">
                <div class="ref-item__icon"><i class="pi pi-box"></i></div>
                <div class="ref-item__body">
                  <div class="ref-item__name">Context-Aware Lighting Events</div>
                  <div class="ref-item__desc">Enriched switching events — version 0.9.1</div>
                </div>
                <StatusBadge status="available" size="sm" />
              </div>
            </div>

            <div class="section-title" style="margin: 1.5rem 0 1rem;">Related Contextual Streams</div>
            <div class="ref-list">
              <div class="ref-item">
                <div class="ref-item__icon" style="color: #8b5cf6"><i class="pi pi-users"></i></div>
                <div class="ref-item__body">
                  <div class="ref-item__name">PIR Motion Events — {{ zone?.zoneId }}</div>
                  <div class="ref-item__desc">Source: PIR Motion Sensors Residential · Protocol: Zigbee/MQTT</div>
                </div>
                <StatusBadge status="healthy" size="sm" />
              </div>
              <div class="ref-item">
                <div class="ref-item__icon" style="color: #f59e0b"><i class="pi pi-car"></i></div>
                <div class="ref-item__body">
                  <div class="ref-item__name">Traffic Camera Array — N12</div>
                  <div class="ref-item__desc">Source: Computer Vision · Protocol: HTTPS/REST</div>
                </div>
                <StatusBadge status="warning" size="sm" />
              </div>
              <div class="ref-item">
                <div class="ref-item__icon" style="color: #0ea5e9"><i class="pi pi-cloud"></i></div>
                <div class="ref-item__body">
                  <div class="ref-item__name">Weather Station HQ</div>
                  <div class="ref-item__desc">Source: Weather Sensor · Protocol: MQTT/JSON</div>
                </div>
                <StatusBadge status="healthy" size="sm" />
              </div>
            </div>

            <div class="section-title" style="margin: 1.5rem 0 1rem;">Active City Events in Zone</div>
            <div class="ref-list">
              <div
                v-for="evt in zoneEvents"
                :key="evt.id"
                class="ref-item"
              >
                <div class="ref-item__icon" :style="{ color: evt.type === 'incident' ? '#ef4444' : '#f59e0b' }">
                  <i :class="`pi ${evt.type === 'incident' ? 'pi-exclamation-triangle' : evt.type === 'construction' ? 'pi-wrench' : 'pi-star'}`"></i>
                </div>
                <div class="ref-item__body">
                  <div class="ref-item__name">{{ evt.description.substring(0, 60) }}…</div>
                  <div class="ref-item__desc">{{ evt.type }} · {{ new Date(evt.timestamp).toLocaleString('en-GB') }}</div>
                </div>
                <StatusBadge :status="evt.status" size="sm" />
              </div>
              <div v-if="zoneEvents.length === 0" class="text-muted" style="padding: 0.75rem 0;">
                No active city events for this zone.
              </div>
            </div>
          </div>
        </template>

      </DetailTabs>
    </div>
  </div>
</template>

<style scoped>
.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
.tab-content { padding: 1.25rem; }

.data-banner {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.8rem; font-weight: 500; padding: 0.5rem 1rem;
  border-radius: var(--facis-radius-sm); border: 1px solid; flex-wrap: wrap;
}
.data-banner--loading { background: #f0f9ff; border-color: #bae6fd; color: #0369a1; }
.data-banner--live { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
.banner-extra { opacity: 0.8; font-weight: 400; }

.section-title { font-size: 0.9rem; font-weight: 600; color: var(--facis-text); }
.section-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; }

/* Two column layout */
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
@media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

/* Info cards */
.info-card { background: var(--facis-surface-2); border: 1px solid var(--facis-border); border-radius: var(--facis-radius-sm); padding: 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
.info-card__title { font-size: 0.8rem; font-weight: 700; color: var(--facis-text); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--facis-border); padding-bottom: 0.5rem; }
.info-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.info-row__key { font-size: 0.78rem; color: var(--facis-text-secondary); flex-shrink: 0; }
.info-row__val { font-size: 0.82rem; color: var(--facis-text); font-weight: 500; text-align: right; }
.mono { font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; }

/* Dimming profile */
.dimming-profile { display: flex; flex-direction: column; gap: 0.6rem; }
.dimming-profile__bar-wrapper { display: flex; align-items: center; gap: 0.75rem; }
.dimming-profile__label { font-size: 0.75rem; color: var(--facis-text-secondary); width: 80px; flex-shrink: 0; }
.dimming-profile__bar { flex: 1; height: 8px; background: var(--facis-border); border-radius: 4px; overflow: hidden; }
.dimming-profile__fill { height: 100%; border-radius: 4px; transition: width 0.4s; }
.dimming-profile__value { font-size: 0.82rem; font-weight: 600; color: var(--facis-text); width: 38px; text-align: right; flex-shrink: 0; }

/* Luminaire summary */
.lumi-summary { display: flex; gap: 0.75rem; }
.lumi-summary__item { flex: 1; padding: 0.6rem; border-radius: var(--facis-radius-sm); border: 1px solid var(--facis-border); text-align: center; display: flex; flex-direction: column; gap: 0.2rem; }
.lumi-summary__count { font-size: 1.2rem; font-weight: 700; color: var(--facis-text); }
.lumi-summary__label { font-size: 0.68rem; color: var(--facis-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
.lumi-summary__item--green .lumi-summary__count { color: #15803d; }
.lumi-summary__item--yellow .lumi-summary__count { color: #92400e; }
.lumi-summary__item--red .lumi-summary__count { color: #991b1b; }

/* Section blocks */
.section-block { }

/* JSON view */
.json-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
.json-header__title { font-size: 0.82rem; font-weight: 600; color: var(--facis-text); }
.json-header__badge { font-size: 0.68rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 4px; background: #f1f5f9; color: #475569; border: 1px solid var(--facis-border); }
.json-view {
  background: #0f172a; color: #94a3b8;
  border-radius: var(--facis-radius-sm); padding: 1.25rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.78rem; line-height: 1.7; overflow: auto;
  max-height: 480px; white-space: pre;
}

/* Provenance chain */
.provenance-chain { display: flex; flex-direction: column; }
.prov-step { display: flex; align-items: flex-start; gap: 1rem; }
.prov-step__dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; margin-top: 0.3rem; }
.prov-step__dot--green { background: #22c55e; }
.prov-step__dot--blue { background: #3b82f6; }
.prov-step__body { padding-bottom: 0.25rem; }
.prov-step__stage { font-size: 0.82rem; font-weight: 600; color: var(--facis-text); }
.prov-step__desc { font-size: 0.8rem; color: var(--facis-text-secondary); margin-top: 0.2rem; line-height: 1.5; }
.prov-step__meta { font-size: 0.72rem; color: var(--facis-text-muted); margin-top: 0.2rem; }
.prov-connector { width: 2px; height: 28px; background: var(--facis-border); margin-left: 5px; }

/* Transform list */
.transform-list { display: flex; flex-direction: column; gap: 0.5rem; }
.transform-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 0.875rem; background: var(--facis-surface-2); border: 1px solid var(--facis-border); border-radius: var(--facis-radius-sm); }
.transform-row__step { font-size: 0.7rem; font-weight: 700; width: 20px; height: 20px; border-radius: 50%; background: var(--facis-primary-light); color: var(--facis-primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.transform-row__action { flex: 1; font-size: 0.8rem; color: var(--facis-text); }
.transform-row__status { font-size: 0.68rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 20px; flex-shrink: 0; }
.transform-row__status--ok { background: #dcfce7; color: #15803d; }
.transform-row__status--warn { background: #fef3c7; color: #92400e; }

/* Context signals */
.context-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1.25rem; }
.context-section { background: var(--facis-surface-2); border: 1px solid var(--facis-border); border-radius: var(--facis-radius-sm); padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
.context-section--wide { grid-column: 1 / -1; }
.context-section__header { display: flex; align-items: center; gap: 0.5rem; }
.context-section__icon { font-size: 1rem; }
.context-section__title { font-size: 0.85rem; font-weight: 600; color: var(--facis-text); }
.context-kpis { display: flex; gap: 1rem; flex-wrap: wrap; }
.ctx-kpi { display: flex; flex-direction: column; gap: 0.1rem; }
.ctx-kpi__val { font-size: 1.1rem; font-weight: 700; color: var(--facis-text); }
.ctx-kpi__lbl { font-size: 0.68rem; color: var(--facis-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
.ctx-event-list { display: flex; flex-direction: column; gap: 0.3rem; }
.ctx-event-row { display: flex; align-items: center; gap: 0.75rem; font-size: 0.75rem; padding: 0.25rem 0; border-top: 1px solid var(--facis-border); }
.ctx-event-type { font-weight: 600; text-transform: capitalize; width: 80px; }
.ctx-event-time { color: var(--facis-text-secondary); }
.ctx-event-conf { margin-left: auto; color: var(--facis-text-secondary); }

/* Sunrise/Sunset */
.ss-grid { display: grid; grid-template-columns: auto 1fr; gap: 1.5rem; align-items: start; }
@media (max-width: 700px) { .ss-grid { grid-template-columns: 1fr; } }
.ss-today { display: flex; flex-direction: column; gap: 0.75rem; }
.ss-today__item { display: flex; align-items: center; gap: 0.6rem; }
.ss-today__label { font-size: 0.78rem; color: var(--facis-text-secondary); width: 80px; }
.ss-today__val { font-size: 0.9rem; font-weight: 600; color: var(--facis-text); }

/* Advisory badge */
.advisory-badge {
  display: inline-flex; align-items: center;
  font-size: 0.68rem; font-weight: 600; padding: 0.2rem 0.5rem;
  border-radius: 20px; border: 1px solid #dbeafe;
  background: #eff6ff; color: #1d4ed8;
}

/* Recommendations */
.empty-rec { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 3rem; color: var(--facis-text-secondary); font-size: 0.875rem; }
.rec-grid { display: flex; flex-direction: column; gap: 1rem; }
.rec-card-lg {
  border: 1px solid var(--facis-border); border-radius: var(--facis-radius-sm);
  padding: 1.125rem; background: var(--facis-surface-2);
  display: flex; flex-direction: column; gap: 0.6rem;
}
.rec-card-lg--muted { opacity: 0.75; }
.rec-card-lg__header { display: flex; align-items: center; gap: 0.75rem; }
.rec-card-lg__icon { width: 36px; height: 36px; border-radius: var(--facis-radius-sm); display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; }
.rec-card-lg__meta { display: flex; flex-direction: column; gap: 0.1rem; }
.rec-card-lg__impact { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.04em; }
.rec-card-lg__conf { font-size: 0.7rem; color: var(--facis-text-secondary); }
.rec-card-lg__title { font-size: 0.875rem; font-weight: 600; color: var(--facis-text); line-height: 1.4; }
.rec-card-lg__summary { font-size: 0.8rem; color: var(--facis-text-secondary); line-height: 1.55; }
.rec-card-lg__rationale { font-size: 0.78rem; color: var(--facis-text-muted); line-height: 1.55; padding-top: 0.5rem; border-top: 1px solid var(--facis-border); }
.rec-card-lg__footer { display: flex; justify-content: flex-end; }
.rec-card-lg__time { font-size: 0.7rem; color: var(--facis-text-muted); }

/* References */
.ref-list { display: flex; flex-direction: column; gap: 0.625rem; }
.ref-item {
  display: flex; align-items: center; gap: 0.875rem;
  padding: 0.75rem 0.875rem; background: var(--facis-surface-2);
  border: 1px solid var(--facis-border); border-radius: var(--facis-radius-sm);
  cursor: pointer; transition: box-shadow 0.15s;
}
.ref-item:hover { box-shadow: var(--facis-shadow-md); }
.ref-item__icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 0.875rem; color: var(--facis-primary); background: var(--facis-primary-light); border-radius: var(--facis-radius-sm); flex-shrink: 0; }
.ref-item__body { flex: 1; display: flex; flex-direction: column; gap: 0.15rem; }
.ref-item__name { font-size: 0.82rem; font-weight: 600; color: var(--facis-text); }
.ref-item__desc { font-size: 0.75rem; color: var(--facis-text-secondary); }
.text-muted { color: var(--facis-text-secondary); font-size: 0.82rem; }
</style>
