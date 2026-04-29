<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import TimeSeriesChart from '@/components/common/TimeSeriesChart.vue'
import {
  getStreetlights,
  getTrafficZones,
  getTrafficCurrent,
  getCityEventCurrent,
  getCityWeatherCurrent,
  type SimStreetlight,
  type SimTrafficCurrent,
  type SimEventCurrent,
  type SimCityWeatherCurrent
} from '@/services/api'

const router = useRouter()

// ─── Live data state ──────────────────────────────────────────────────────────
const isLive = ref(false)
const loading = ref(false)
const error = ref(false)

// Live streetlights data
const liveStreetlights = ref<SimStreetlight[]>([])
// Traffic per zone: zoneId → current
const liveTraffic = ref<Record<string, SimTrafficCurrent>>({})
// Events per zone: zoneId → current
const liveEvents = ref<Record<string, SimEventCurrent>>({})
// City weather
const liveWeather = ref<SimCityWeatherCurrent | null>(null)

// ─── Computed zones from live data ────────────────────────────────────────────
interface ZoneSummary {
  zoneId: string
  zoneName: string
  lightCount: number
  avgDimmingLevel: number
  status: string
  contextActivityLevel: string
  dataQuality: number
  lastUpdate: string
}

const liveZones = computed<ZoneSummary[]>(() => {
  if (liveStreetlights.value.length === 0) return []
  const grouped: Record<string, SimStreetlight[]> = {}
  for (const light of liveStreetlights.value) {
    if (!grouped[light.zone_id]) grouped[light.zone_id] = []
    grouped[light.zone_id].push(light)
  }
  return Object.entries(grouped).map(([zoneId, lights]) => {
    const traffic = liveTraffic.value[zoneId]
    const trafficIndex = traffic?.traffic_index ?? 0
    const activityLevel = trafficIndex > 0.7 ? 'high' : trafficIndex > 0.4 ? 'medium' : 'low'
    const event = liveEvents.value[zoneId]
    const hasActiveEvent = event?.active ?? false
    return {
      zoneId,
      zoneName: zoneId,
      lightCount: lights.length,
      avgDimmingLevel: 50,
      status: hasActiveEvent && event?.severity === 'high' ? 'fault' : 'active',
      contextActivityLevel: activityLevel,
      dataQuality: 98.5,
      lastUpdate: traffic?.timestamp ?? new Date().toISOString()
    }
  })
})

const zones = computed(() => liveZones.value)

// ─── Fetch live data on mount ─────────────────────────────────────────────────
async function fetchData(): Promise<void> {
  loading.value = true
  error.value = false
  const [streetlightsRes, trafficRes, weatherRes] = await Promise.all([
    getStreetlights(),
    getTrafficZones(),
    getCityWeatherCurrent()
  ])

  if (!streetlightsRes && !trafficRes && !weatherRes) {
    error.value = true
    loading.value = false
    return
  }

  if (streetlightsRes) {
    liveStreetlights.value = streetlightsRes.streetlights
  }

  if (weatherRes) {
    liveWeather.value = weatherRes
  }

  if (trafficRes && trafficRes.zones.length > 0) {
    const trafficResults = await Promise.all(
      trafficRes.zones.map(z => getTrafficCurrent(z.zone_id))
    )
    const eventsResults = await Promise.all(
      trafficRes.zones.map(z => getCityEventCurrent(z.zone_id))
    )
    for (let i = 0; i < trafficRes.zones.length; i++) {
      const zoneId = trafficRes.zones[i].zone_id
      if (trafficResults[i]) liveTraffic.value[zoneId] = trafficResults[i]!
      if (eventsResults[i]) liveEvents.value[zoneId] = eventsResults[i]!
    }
  }

  if (streetlightsRes || trafficRes || weatherRes) {
    isLive.value = true
  }
  loading.value = false
}

onMounted(fetchData)

// ─── KPIs ─────────────────────────────────────────────────────────────────────
const activeZones = computed(() => zones.value.filter(z => z.status !== 'fault' && z.status !== 'off').length)
const activeLuminaires = computed(() => zones.value.reduce((sum, z) => sum + (z.status !== 'fault' ? z.lightCount : 0), 0))
const avgDimming = computed(() => {
  const active = zones.value.filter(z => z.status !== 'fault')
  return active.length ? Math.round(active.reduce((s, z) => s + z.avgDimmingLevel, 0) / active.length) : 0
})
const activeEventsCount = computed(() => Object.values(liveEvents.value).filter(e => e.active).length)
const energyEfficiency = computed(() => zones.value.length > 0 ? Math.round(100 - avgDimming.value * 0.38) : null)

const weatherVisibility = computed(() => {
  const v = liveWeather.value?.visibility
  if (v == null) return '—'
  const num = typeof v === 'number' ? v : parseFloat(String(v))
  return isNaN(num) ? String(v) : `${num.toFixed(1)} km`
})

const kpis = computed(() => [
  { label: 'Active Zones', value: activeZones.value, unit: '', trend: 'stable' as const, icon: 'pi-map', color: '#22c55e' },
  { label: 'Active Luminaires', value: activeLuminaires.value.toLocaleString(), unit: '', trend: 'stable' as const, icon: 'pi-lightbulb', color: '#f59e0b' },
  { label: 'Avg Dimming Level', value: avgDimming.value !== 0 ? avgDimming.value : '—', unit: avgDimming.value !== 0 ? '%' : '', trend: 'stable' as const, icon: 'pi-sliders-v', color: '#3b82f6' },
  { label: 'Active Events', value: activeEventsCount.value, unit: '', trend: 'stable' as const, icon: 'pi-bell', color: '#8b5cf6' },
  { label: 'Energy Efficiency', value: energyEfficiency.value ?? '—', unit: energyEfficiency.value !== null ? '%' : '', trend: 'stable' as const, icon: 'pi-leaf', color: '#22c55e' }
])

// ─── Lighting activity chart — derived from zone dimming levels ────────────────
const chartLabels = computed(() => zones.value.map(z => z.zoneId))
const chartDatasets = computed(() => [{
  label: 'Avg Dimming Level (%)',
  data: zones.value.map(z => z.avgDimmingLevel),
  borderColor: '#3b82f6',
  backgroundColor: 'rgba(59,130,246,0.10)',
  fill: true
}])

// ─── Recent Events (live only) ───────────────────────────────────────────────
const recentEvents = computed(() =>
  Object.entries(liveEvents.value)
    .filter(([, e]) => e.active)
    .map(([zoneId, e]) => ({
      id: `${zoneId}-${e.event_type}`,
      description: `${e.event_type} event in ${zoneId}`,
      zoneId,
      timestamp: e.timestamp,
      type: e.event_type,
      severity: e.severity,
      status: 'active'
    }))
    .slice(0, 5)
)

// ─── Overlay toggles ──────────────────────────────────────────────────────────
const overlays = ref({
  traffic: true,
  incidents: false,
  motion: true,
  weather: false
})

function toggleOverlay(key: keyof typeof overlays.value): void {
  overlays.value[key] = !overlays.value[key]
}

function activityColor(level: string): string {
  return level === 'high' ? '#22c55e' : level === 'medium' ? '#f59e0b' : '#94a3b8'
}

function eventTypeIcon(type: string): string {
  return type === 'festival' ? 'pi-star' : type === 'incident' ? 'pi-exclamation-triangle' : type === 'construction' ? 'pi-wrench' : 'pi-bell'
}

function eventTypeColor(type: string): string {
  return type === 'festival' ? '#8b5cf6' : type === 'incident' ? '#ef4444' : type === 'construction' ? '#f59e0b' : '#ef4444'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Smart City Overview"
      subtitle="Public lighting control, mobility sensing, and urban analytics"
      :breadcrumbs="[{ label: 'Use Cases' }, { label: 'Smart City' }, { label: 'Overview' }]"
    />

    <div class="view-body">
      <!-- Data source banner -->
      <div v-if="loading" class="data-banner data-banner--loading">
        <i class="pi pi-spin pi-spinner"></i> Loading live data from simulation API...
      </div>
      <div v-else-if="isLive" class="data-banner data-banner--live">
        <i class="pi pi-wifi"></i> Live data from simulation API
        <span v-if="liveWeather" class="banner-extra">
          &nbsp;· Visibility {{ weatherVisibility }}
          · Sunrise {{ liveWeather.sunrise_time }} / Sunset {{ liveWeather.sunset_time }}
        </span>
      </div>
      <div v-else-if="error" class="api-error">
        <i class="pi pi-exclamation-circle"></i>
        <p>Could not load data from simulation API</p>
        <Button label="Retry" size="small" @click="fetchData()" />
      </div>

      <!-- KPI Row -->
      <div class="grid-kpi">
        <KpiCard
          v-for="kpi in kpis"
          :key="kpi.label"
          :label="kpi.label"
          :value="kpi.value"
          :unit="kpi.unit"
          :trend="kpi.trend"
          :trend-value="(kpi as any).trendValue"
          :icon="kpi.icon"
          :color="kpi.color"
        />
      </div>

      <!-- Lighting Activity Chart + Overlay Toggles -->
      <div class="card card-body">
        <div class="section-header">
          <div class="section-title">Lighting Activity — Last 24 Hours</div>
          <div class="overlay-toggles">
            <span class="overlay-label">Context overlays:</span>
            <button
              v-for="(active, key) in overlays"
              :key="key"
              class="overlay-toggle"
              :class="{ 'overlay-toggle--active': active }"
              @click="toggleOverlay(key as keyof typeof overlays)"
            >
              <i :class="`pi ${key === 'traffic' ? 'pi-car' : key === 'incidents' ? 'pi-exclamation-triangle' : key === 'motion' ? 'pi-users' : 'pi-cloud'}`"></i>
              {{ key.charAt(0).toUpperCase() + key.slice(1) }}
            </button>
          </div>
        </div>
        <TimeSeriesChart
          :datasets="chartDatasets"
          :labels="chartLabels as unknown as string[]"
          y-axis-label="Dimming Level (%)"
          :height="280"
        />
      </div>

      <!-- Two-column: Zone Overview + Zone Comparison -->
      <div class="row-2col">
        <!-- Zone Overview Panel -->
        <div class="card">
          <div class="card-body" style="padding-bottom: 0.5rem;">
            <div class="section-title">Zone Status Overview</div>
          </div>
          <div class="zone-grid">
            <div
              v-for="zone in zones"
              :key="zone.zoneId"
              class="zone-card"
              @click="router.push(`/use-cases/smart-city/zones/${zone.zoneId}`)"
            >
              <div class="zone-card__header">
                <StatusBadge :status="zone.status" size="sm" />
                <span class="zone-card__quality" :class="{ 'zone-card__quality--warn': zone.dataQuality < 80 }">
                  {{ zone.dataQuality.toFixed(1) }}%
                </span>
              </div>
              <div class="zone-card__name">{{ zone.zoneName }}</div>
              <div class="zone-card__meta">
                <span class="zone-card__stat">
                  <i class="pi pi-lightbulb"></i> {{ zone.lightCount }}
                </span>
                <span class="zone-card__stat">
                  <i class="pi pi-sliders-v"></i> {{ zone.avgDimmingLevel }}%
                </span>
                <span class="zone-card__activity" :style="{ color: activityColor(zone.contextActivityLevel) }">
                  <i class="pi pi-circle-fill" style="font-size: 0.55rem;"></i>
                  {{ zone.contextActivityLevel }}
                </span>
              </div>
              <div class="zone-card__dimming-bar">
                <div
                  class="zone-card__dimming-fill"
                  :style="{
                    width: `${zone.avgDimmingLevel}%`,
                    background: zone.status === 'fault' ? '#ef4444' : zone.avgDimmingLevel > 70 ? '#f59e0b' : '#3b82f6'
                  }"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Recommendations Panel -->
        <div class="card card-body">
          <div class="section-header" style="margin-bottom: 1rem;">
            <div class="section-title">Recommendations</div>
          </div>
          <div class="no-data-msg">
            <i class="pi pi-info-circle"></i>
            <span>No data available — this module requires backend integration</span>
          </div>
        </div>
      </div>

      <!-- Recent City Events -->
      <div class="card card-body">
        <div class="section-title" style="margin-bottom: 1rem;">Active City Events</div>
        <div class="events-list">
          <div v-for="event in recentEvents" :key="event.id" class="event-row">
            <div class="event-row__icon" :style="{ background: `${eventTypeColor(event.type)}18`, color: eventTypeColor(event.type) }">
              <i :class="`pi ${eventTypeIcon(event.type)}`"></i>
            </div>
            <div class="event-row__body">
              <div class="event-row__title">{{ event.description }}</div>
              <div class="event-row__meta">
                <span class="zone-chip">{{ event.zoneId }}</span>
                <span class="event-row__time">{{ formatTime(event.timestamp) }}</span>
                <span class="event-row__type">{{ event.type }}</span>
              </div>
            </div>
            <div class="event-row__severity">
              <span class="severity-dot" :style="{ background: event.severity === 'high' ? '#ef4444' : event.severity === 'medium' ? '#f59e0b' : '#94a3b8' }"></span>
              {{ event.severity }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }

/* Data source banner */
.data-banner {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.8rem; font-weight: 500; padding: 0.5rem 1rem;
  border-radius: var(--facis-radius-sm); border: 1px solid;
}
.data-banner--loading { background: #f0f9ff; border-color: #bae6fd; color: #0369a1; }
.data-banner--live { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
.banner-extra { opacity: 0.8; font-weight: 400; }

.section-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
.section-title { font-size: 0.9rem; font-weight: 600; color: var(--facis-text); }

/* Overlay toggles */
.overlay-toggles { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.overlay-label { font-size: 0.75rem; color: var(--facis-text-secondary); margin-right: 0.25rem; }
.overlay-toggle {
  display: flex; align-items: center; gap: 0.3rem;
  font-size: 0.75rem; font-weight: 500; padding: 0.25rem 0.625rem;
  border-radius: 20px; border: 1px solid var(--facis-border);
  background: var(--facis-surface); color: var(--facis-text-secondary);
  cursor: pointer; transition: all 0.15s;
}
.overlay-toggle:hover { border-color: var(--facis-primary); color: var(--facis-primary); }
.overlay-toggle--active { background: var(--facis-primary-light); border-color: var(--facis-primary); color: var(--facis-primary); }

/* Two-column layout */
.row-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
@media (max-width: 1100px) { .row-2col { grid-template-columns: 1fr; } }

/* Zone cards */
.zone-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; padding: 0.75rem 1.25rem 1.25rem; }
.zone-card {
  background: var(--facis-surface-2);
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius-sm);
  padding: 0.875rem;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
  display: flex; flex-direction: column; gap: 0.5rem;
}
.zone-card:hover { box-shadow: var(--facis-shadow-md); border-color: var(--facis-primary); }
.zone-card__header { display: flex; align-items: center; justify-content: space-between; }
.zone-card__quality { font-size: 0.75rem; font-weight: 600; color: var(--facis-text-secondary); }
.zone-card__quality--warn { color: var(--facis-error); }
.zone-card__name { font-size: 0.8rem; font-weight: 600; color: var(--facis-text); line-height: 1.3; }
.zone-card__meta { display: flex; align-items: center; gap: 0.75rem; }
.zone-card__stat { display: flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; color: var(--facis-text-secondary); }
.zone-card__stat .pi { font-size: 0.7rem; }
.zone-card__activity { display: flex; align-items: center; gap: 0.25rem; font-size: 0.7rem; font-weight: 600; text-transform: capitalize; margin-left: auto; }
.zone-card__dimming-bar { height: 3px; background: var(--facis-border); border-radius: 2px; overflow: hidden; }
.zone-card__dimming-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }

/* Advisory badge */
.advisory-badge {
  display: inline-flex; align-items: center;
  font-size: 0.68rem; font-weight: 600; padding: 0.2rem 0.5rem;
  border-radius: 20px; border: 1px solid #dbeafe;
  background: #eff6ff; color: #1d4ed8;
}

/* Recommendations */
.rec-list { display: flex; flex-direction: column; gap: 0.875rem; }
.rec-card {
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius-sm);
  padding: 0.875rem;
  background: var(--facis-surface-2);
  display: flex; flex-direction: column; gap: 0.5rem;
}
.rec-card__header { display: flex; align-items: center; gap: 0.75rem; }
.rec-card__icon {
  width: 32px; height: 32px; border-radius: var(--facis-radius-sm);
  display: flex; align-items: center; justify-content: center; font-size: 0.875rem; flex-shrink: 0;
}
.rec-card__meta { display: flex; flex-direction: column; gap: 0.1rem; }
.rec-card__impact { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.04em; }
.rec-card__confidence { font-size: 0.7rem; color: var(--facis-text-secondary); }
.rec-card__title { font-size: 0.82rem; font-weight: 600; color: var(--facis-text); line-height: 1.4; }
.rec-card__summary { font-size: 0.78rem; color: var(--facis-text-secondary); line-height: 1.5; }
.rec-card__zones { display: flex; flex-wrap: wrap; gap: 0.3rem; }

/* Zone chip */
.zone-chip {
  font-size: 0.68rem; font-weight: 500; padding: 0.15rem 0.45rem;
  border-radius: 20px; background: var(--facis-primary-light);
  color: var(--facis-primary); border: 1px solid transparent;
}

/* Events */
.events-list { display: flex; flex-direction: column; gap: 0.75rem; }
.event-row { display: flex; align-items: flex-start; gap: 0.875rem; }
.event-row__icon {
  width: 36px; height: 36px; border-radius: var(--facis-radius-sm);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.875rem; flex-shrink: 0; margin-top: 0.1rem;
}
.event-row__body { flex: 1; display: flex; flex-direction: column; gap: 0.35rem; }
.event-row__title { font-size: 0.82rem; color: var(--facis-text); line-height: 1.45; }
.event-row__meta { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.event-row__time { font-size: 0.72rem; color: var(--facis-text-secondary); }
.event-row__type { font-size: 0.7rem; color: var(--facis-text-secondary); text-transform: capitalize; }
.event-row__severity { display: flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; font-weight: 600; color: var(--facis-text-secondary); text-transform: capitalize; flex-shrink: 0; }
.severity-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

.api-error {
  display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
  padding: 2rem; margin: 1.5rem; border: 1px solid #fee2e2;
  border-radius: var(--facis-radius); background: #fff5f5;
  color: #991b1b; font-size: 0.875rem; text-align: center;
}
.no-data-msg {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.82rem; color: var(--facis-text-secondary);
  padding: 1rem 0;
}
</style>
