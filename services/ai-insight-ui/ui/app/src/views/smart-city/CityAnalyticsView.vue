<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend, type ChartOptions
} from 'chart.js'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import TimeSeriesChart from '@/components/common/TimeSeriesChart.vue'
import { getStreetlights, getStreetlightCurrent, getStreetlightHistory, getTrafficZones, getTrafficCurrent } from '@/services/api'
import { computeTrends, detectStreetlightAnomalies, extractStreetlightPowerW, extractTrafficIndex } from '@/services/analytics'
import type { Anomaly } from '@/services/analytics'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const loading  = ref(true)
const isLive   = ref(false)
const anomalies = ref<Anomaly[]>([])

// Zone data derived from API
interface ZoneData {
  zoneId: string
  lightCount: number
  avgDimmingLevel: number
  avgPowerW: number
  status: 'healthy' | 'warning' | 'fault'
  trafficIndex: number
}

const zones = ref<ZoneData[]>([])
const historyLabels = ref<string[]>([])
const powerHistory  = ref<number[]>([])
const baselinePower = ref<number[]>([])

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [lightsRes, trafficRes] = await Promise.all([getStreetlights(), getTrafficZones()])
    if (!lightsRes?.streetlights?.length) throw new Error('no streetlights')

    // Group streetlights by zone
    const zoneMap = new Map<string, typeof lightsRes.streetlights>()
    for (const l of lightsRes.streetlights) {
      if (!zoneMap.has(l.zone_id)) zoneMap.set(l.zone_id, [])
      zoneMap.get(l.zone_id)!.push(l)
    }

    // Fetch current readings per zone (first light per zone)
    const zoneEntries = [...zoneMap.entries()]
    const zoneCurrentData = await Promise.all(
      zoneEntries.slice(0, 6).map(async ([zoneId, lights]) => {
        const curr = await getStreetlightCurrent(lights[0].light_id)
        let trafficIdx = 0
        const trafficZones = trafficRes?.zones ?? []
        const matchingZone = trafficZones.find(z => z.zone_id === zoneId || z.zone_id.includes(zoneId))
        if (matchingZone) {
          const tc = await getTrafficCurrent(matchingZone.zone_id)
          trafficIdx = tc?.traffic_index ?? 0
        }
        return { zoneId, lights, curr, trafficIdx }
      })
    )

    zones.value = zoneEntries.slice(0, 6).map((_, i) => {
      const entry = zoneCurrentData[i]
      const curr  = entry?.curr
      return {
        zoneId: entry?.zoneId ?? `ZONE-${i}`,
        lightCount: entry?.lights?.length ?? 0,
        avgDimmingLevel: curr?.dimming_level_pct ?? 70,
        avgPowerW: curr?.power_w ?? 0,
        status: (curr?.power_w ?? 0) === 0 ? 'fault' : curr && curr.dimming_level_pct > 90 ? 'warning' : 'healthy',
        trafficIndex: entry?.trafficIdx ?? 0
      }
    })

    // Fetch history of first streetlight for chart
    const firstLightId = lightsRes.streetlights[0].light_id
    const hist = await getStreetlightHistory(firstLightId)
    if (hist?.readings?.length) {
      const trend = computeTrends(hist.readings, extractStreetlightPowerW)
      historyLabels.value = trend.labels
      powerHistory.value  = trend.values
      baselinePower.value = trend.values.map(() => lightsRes.streetlights[0].rated_power_w)
      anomalies.value = detectStreetlightAnomalies(
        hist.readings as Array<{ timestamp: string; power_w: number; dimming_level_pct: number }>,
        firstLightId
      )
    }

    isLive.value = true
  } catch {
    zones.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchData())

const avgDimming     = computed(() => zones.value.length ? Math.round(zones.value.reduce((s, z) => s + z.avgDimmingLevel, 0) / zones.value.length) : 0)
const efficiencyScore = computed(() => Math.round(100 - avgDimming.value * 0.38))
const inefficientZones = computed(() => zones.value.filter(z => z.avgDimmingLevel > 85 && z.trafficIndex < 0.5).length)
const totalPowerW    = computed(() => zones.value.reduce((s, z) => s + z.avgPowerW, 0))

const dimBarData = computed(() => ({
  labels: zones.value.map(z => z.zoneId),
  datasets: [
    {
      label: 'Actual Dimming (%)',
      data: zones.value.map(z => z.avgDimmingLevel),
      backgroundColor: zones.value.map(z =>
        z.avgDimmingLevel > 85 && z.trafficIndex < 0.5 ? 'rgba(239,68,68,0.8)' :
        z.status === 'fault' ? 'rgba(148,163,184,0.5)' : 'rgba(59,130,246,0.75)'
      ),
      borderRadius: 4
    },
    {
      label: 'Optimal Target (%)',
      data: zones.value.map(z => z.trafficIndex > 0.7 ? 90 : z.trafficIndex > 0.4 ? 60 : 30),
      backgroundColor: 'rgba(34,197,94,0.3)',
      borderColor: 'rgba(34,197,94,0.8)',
      borderWidth: 2,
      borderRadius: 4
    }
  ]
}))

const barOptions: ChartOptions<'bar'> = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top', labels: { font: { family: 'Inter', size: 12 }, usePointStyle: true } },
    tooltip: { backgroundColor: 'rgba(15,23,42,0.92)', bodyFont: { family: 'Inter', size: 12 }, padding: 10 }
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#94a3b8' } },
    y: { min: 0, max: 110, grid: { color: 'rgba(226,232,240,0.6)' }, ticks: { font: { family: 'Inter', size: 11 }, color: '#94a3b8' } }
  }
}

const powerDatasets = computed(() => [
  { label: 'Actual Power (W)', data: powerHistory.value, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.10)', fill: true, tension: 0.4 },
  { label: 'Rated Power (W)', data: baselinePower.value, borderColor: '#94a3b8', backgroundColor: 'transparent', tension: 0.3 }
])

function impactColor(level: string): string {
  return level === 'high' ? '#ef4444' : level === 'medium' ? '#f59e0b' : '#3b82f6'
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="City Analytics"
      subtitle="Lighting efficiency, anomaly detection, and zone performance — computed from live streetlight telemetry"
      :breadcrumbs="[{ label: 'Use Cases' }, { label: 'Smart City' }, { label: 'Analytics' }]"
    />

    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> Computed from live streetlight + traffic telemetry
    </div>

    <div class="view-body">
      <div v-if="loading" class="loading-state">
        <i class="pi pi-spin pi-spinner" style="font-size:1.5rem;color:var(--facis-primary)"></i>
        <span>Loading city analytics from live data…</span>
      </div>

      <template v-else>
        <div class="grid-kpi">
          <KpiCard label="Avg Dimming Level"    :value="avgDimming" unit="%" trend="stable" icon="pi-sliders-v" color="#3b82f6" />
          <KpiCard label="Efficiency Score"     :value="efficiencyScore" unit="%" trend="stable" icon="pi-leaf" color="#22c55e" />
          <KpiCard label="Total Power (W)"      :value="totalPowerW.toFixed(0)" unit="" trend="stable" icon="pi-bolt" color="#f59e0b" />
          <KpiCard label="Inefficient Zones"    :value="inefficientZones" unit="" trend="stable" icon="pi-exclamation-triangle" color="#ef4444" />
          <KpiCard label="Monitored Zones"      :value="zones.length" unit="" trend="stable" icon="pi-map" color="#22c55e" />
          <KpiCard label="Anomalies Detected"   :value="anomalies.length" unit="" trend="stable" icon="pi-search" color="#8b5cf6" />
        </div>

        <div v-if="!zones.length" class="card card-body empty-state">
          <i class="pi pi-info-circle"></i>
          <span>No streetlight data available — ensure simulation is running.</span>
        </div>

        <template v-else>
          <div class="card card-body">
            <div class="section-header">
              <div>
                <div class="section-title">Dimming Level vs Optimal Target by Zone</div>
                <div class="section-subtitle">Red bars = zones over-lit relative to traffic activity level</div>
              </div>
              <span class="legend-note legend-note--red">Over-lit</span>
            </div>
            <div style="height:280px;position:relative;margin-top:0.75rem">
              <Bar :data="dimBarData" :options="barOptions" />
            </div>
          </div>

          <div class="card card-body">
            <div class="section-title" style="margin-bottom:0.75rem">Streetlight Power vs Rated Baseline (24h)</div>
            <TimeSeriesChart :datasets="powerDatasets" :labels="historyLabels" y-axis-label="W" :height="260" />
          </div>

          <div v-if="anomalies.length" class="card card-body">
            <div class="section-title" style="margin-bottom:1rem">Statistical Anomalies Detected (>2σ)</div>
            <div class="anomaly-list">
              <div v-for="a in anomalies.slice(0, 8)" :key="a.id" class="anomaly-row">
                <span class="anm-severity" :style="{ color: a.severity === 'critical' ? '#ef4444' : '#f59e0b' }">{{ a.severity.toUpperCase() }}</span>
                <div class="anm-info">
                  <span class="anm-text">{{ a.explanation }}</span>
                  <span class="anm-time">{{ new Date(a.timestamp).toLocaleTimeString('en-GB') }}</span>
                </div>
                <span class="anm-sigma">{{ a.deviation }}σ</span>
              </div>
            </div>
          </div>

          <!-- Zone table -->
          <div class="card card-body">
            <div class="section-title" style="margin-bottom:1rem">Zone Performance Summary</div>
            <div class="zone-table">
              <div class="zone-table__head">
                <span>Zone</span><span>Lights</span><span>Dimming</span><span>Power (W)</span><span>Traffic</span><span>Status</span>
              </div>
              <div v-for="z in zones" :key="z.zoneId" class="zone-table__row">
                <span class="zone-id">{{ z.zoneId }}</span>
                <span>{{ z.lightCount }}</span>
                <span :style="{ color: z.avgDimmingLevel > 85 ? '#ef4444' : 'inherit' }">{{ z.avgDimmingLevel }}%</span>
                <span>{{ z.avgPowerW.toFixed(0) }}</span>
                <span>{{ (z.trafficIndex * 100).toFixed(0) }}%</span>
                <span :class="z.status === 'healthy' ? 'status-ok' : z.status === 'warning' ? 'status-warn' : 'status-err'">{{ z.status }}</span>
              </div>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.live-banner { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #15803d; background: #dcfce7; padding: 0.375rem 1.5rem; border-bottom: 1px solid #bbf7d0; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.loading-state, .empty-state { display: flex; align-items: center; justify-content: center; gap: 0.75rem; padding: 3rem; color: var(--facis-text-secondary); font-size: 0.875rem; }

.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
.section-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.section-title { font-size: 0.9rem; font-weight: 600; color: var(--facis-text); }
.section-subtitle { font-size: 0.78rem; color: var(--facis-text-secondary); margin-top: 0.2rem; }
.legend-note { font-size: 0.7rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 20px; }
.legend-note--red { background: #fee2e2; color: #991b1b; }

.anomaly-list { display: flex; flex-direction: column; gap: 0.5rem; }
.anomaly-row { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 0.75rem; background: var(--facis-surface-2); border-radius: var(--facis-radius-sm); }
.anm-severity { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em; flex-shrink: 0; min-width: 60px; }
.anm-info { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; }
.anm-text { font-size: 0.8rem; color: var(--facis-text); }
.anm-time { font-size: 0.72rem; color: var(--facis-text-muted); }
.anm-sigma { font-size: 0.8rem; font-weight: 700; color: var(--facis-error); }

.zone-table { display: flex; flex-direction: column; gap: 0; }
.zone-table__head { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr; gap: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.72rem; font-weight: 600; color: var(--facis-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--facis-border); }
.zone-table__row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr; gap: 0.5rem; padding: 0.6rem 0.75rem; font-size: 0.82rem; color: var(--facis-text); border-bottom: 1px solid var(--facis-border); align-items: center; }
.zone-table__row:last-child { border-bottom: none; }
.zone-id { font-family: var(--facis-font-mono); font-size: 0.78rem; }
.status-ok   { color: var(--facis-success); font-weight: 600; }
.status-warn { color: var(--facis-warning); font-weight: 600; }
.status-err  { color: var(--facis-error); font-weight: 600; }
</style>
