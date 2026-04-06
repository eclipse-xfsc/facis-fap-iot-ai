<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import SelectButton from 'primevue/selectbutton'
import PageHeader from '@/components/common/PageHeader.vue'
import TimeSeriesChart from '@/components/common/TimeSeriesChart.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import { getMeters, getMeterHistory, getPVSystems, getPVHistory, getStreetlights, getStreetlightHistory } from '@/services/api'
import { computeTrends, extractMeterPowerKw, extractPvPowerKw, extractStreetlightPowerW } from '@/services/analytics'
import type { TrendResult } from '@/services/analytics'

const periods = ['24h', '7 Days', '30 Days']
const selectedPeriod = ref('24h')

const loading   = ref(true)
const isLive    = ref(false)

const energyTrend   = ref<TrendResult>({ min: 0, max: 0, avg: 0, trend: 'stable', trendPct: 0, labels: [], values: [] })
const pvTrend       = ref<TrendResult>({ min: 0, max: 0, avg: 0, trend: 'stable', trendPct: 0, labels: [], values: [] })
const lightingTrend = ref<TrendResult>({ min: 0, max: 0, avg: 0, trend: 'stable', trendPct: 0, labels: [], values: [] })

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [metersRes, pvRes, lightsRes] = await Promise.all([getMeters(), getPVSystems(), getStreetlights()])
    if (!metersRes || !pvRes || !lightsRes) throw new Error('no data')

    const firstMeterId = metersRes.meters[0]?.meter_id
    const firstPvId    = pvRes.systems[0]?.system_id
    const firstLightId = lightsRes.streetlights[0]?.light_id

    const [mHist, pvHist, lHist] = await Promise.all([
      firstMeterId ? getMeterHistory(firstMeterId) : Promise.resolve(null),
      firstPvId    ? getPVHistory(firstPvId)       : Promise.resolve(null),
      firstLightId ? getStreetlightHistory(firstLightId) : Promise.resolve(null)
    ])

    if (mHist?.readings?.length)  energyTrend.value   = computeTrends(mHist.readings,  extractMeterPowerKw)
    if (pvHist?.readings?.length) pvTrend.value        = computeTrends(pvHist.readings, extractPvPowerKw)
    if (lHist?.readings?.length)  lightingTrend.value  = computeTrends(lHist.readings,  extractStreetlightPowerW)

    isLive.value = true
  } catch {
    // keep defaults (zeros) — chart stays empty rather than showing bad data
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchData())

// Slice data based on period selection for display
const displayLabels = computed(() => {
  const labels = energyTrend.value.labels
  if (selectedPeriod.value === '24h') return labels
  return labels.filter((_, i) => i % 2 === 0) // downsample
})

const displayEnergyData = computed(() => {
  if (selectedPeriod.value === '24h') return energyTrend.value.values
  return energyTrend.value.values.filter((_, i) => i % 2 === 0)
})

const displayPvData = computed(() => {
  if (selectedPeriod.value === '24h') return pvTrend.value.values
  return pvTrend.value.values.filter((_, i) => i % 2 === 0)
})

const displayLightingData = computed(() => {
  if (selectedPeriod.value === '24h') return lightingTrend.value.values
  return lightingTrend.value.values.filter((_, i) => i % 2 === 0)
})

function trendIcon(t: 'up' | 'down' | 'stable'): string {
  return t === 'up' ? 'pi-trending-up' : t === 'down' ? 'pi-trending-down' : 'pi-minus'
}
function trendColor(t: 'up' | 'down' | 'stable'): string {
  return t === 'up' ? '#ef4444' : t === 'down' ? '#22c55e' : '#94a3b8'
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Trend Analysis"
      subtitle="Real 24h telemetry trends for energy and smart city domains — computed from live simulation data"
      :breadcrumbs="[{ label: 'Analytics' }, { label: 'Trends' }]"
    >
      <template #actions>
        <SelectButton v-model="selectedPeriod" :options="periods" :allow-empty="false" size="small" />
      </template>
    </PageHeader>

    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> Computed from live simulation telemetry
    </div>

    <div class="view-body">
      <div v-if="loading" class="loading-state">
        <i class="pi pi-spin pi-spinner" style="font-size:1.5rem;color:var(--facis-primary)"></i>
        <span>Loading trend data…</span>
      </div>

      <template v-else>
        <!-- Energy section -->
        <div class="trend-section">
          <div class="trend-section__header">
            <div class="domain-badge domain-badge--energy"><i class="pi pi-bolt"></i> Smart Energy</div>
            <span class="period-label">{{ selectedPeriod }} view — live data</span>
          </div>

          <div class="grid-kpi">
            <KpiCard label="Avg Consumption" :value="energyTrend.avg.toFixed(1)" unit="kW" :trend="energyTrend.trend" :trend-value="`${energyTrend.trendPct > 0 ? '+' : ''}${energyTrend.trendPct}%`" icon="pi-bolt" color="#005fff" />
            <KpiCard label="Peak Consumption" :value="energyTrend.max.toFixed(1)" unit="kW" trend="stable" icon="pi-arrow-up" color="#ef4444" />
            <KpiCard label="Min Consumption"  :value="energyTrend.min.toFixed(1)" unit="kW" trend="stable" icon="pi-arrow-down" color="#22c55e" />
            <KpiCard label="Avg PV Output" :value="pvTrend.avg.toFixed(1)" unit="kW" :trend="pvTrend.trend" icon="pi-sun" color="#f59e0b" />
          </div>

          <div class="card card-body">
            <div class="section-title">Energy Consumption & PV Generation — {{ selectedPeriod }}</div>
            <TimeSeriesChart
              :datasets="[
                { label: 'Consumption (kW)', data: displayEnergyData, borderColor: '#005fff', backgroundColor: 'rgba(0,95,255,0.07)', fill: true, tension: 0.4 },
                { label: 'PV Generation (kW)', data: displayPvData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.07)', fill: true, tension: 0.4 }
              ]"
              :labels="displayLabels"
              y-axis-label="kW"
              :height="300"
            />
          </div>
        </div>

        <!-- City section -->
        <div class="trend-section">
          <div class="trend-section__header">
            <div class="domain-badge domain-badge--city"><i class="pi pi-map"></i> Smart City</div>
            <span class="period-label">{{ selectedPeriod }} view — live data</span>
          </div>

          <div class="grid-kpi">
            <KpiCard label="Avg Lighting Power" :value="lightingTrend.avg.toFixed(0)" unit="W" :trend="lightingTrend.trend" :trend-value="`${lightingTrend.trendPct > 0 ? '+' : ''}${lightingTrend.trendPct}%`" icon="pi-lightbulb" color="#f59e0b" />
            <KpiCard label="Peak Lighting" :value="lightingTrend.max.toFixed(0)" unit="W" trend="stable" icon="pi-arrow-up" color="#ef4444" />
            <KpiCard label="Min Lighting"  :value="lightingTrend.min.toFixed(0)" unit="W" trend="stable" icon="pi-arrow-down" color="#22c55e" />
            <KpiCard label="Lighting Trend" :value="`${lightingTrend.trendPct > 0 ? '+' : ''}${lightingTrend.trendPct}%`" :trend="lightingTrend.trend" :icon="trendIcon(lightingTrend.trend)" :color="trendColor(lightingTrend.trend)" />
          </div>

          <div class="card card-body">
            <div class="section-title">Streetlight Power Consumption — {{ selectedPeriod }}</div>
            <TimeSeriesChart
              :datasets="[
                { label: 'Lighting Power (W)', data: displayLightingData, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.10)', fill: true, tension: 0.4 }
              ]"
              :labels="displayLabels"
              y-axis-label="W"
              :height="300"
            />
          </div>
        </div>

        <!-- Insight notes -->
        <div class="card card-body insight-notes">
          <div class="section-title">Trend Observations</div>
          <div class="notes-grid">
            <div class="note-item note-item--energy">
              <i class="pi pi-info-circle note-icon"></i>
              <div>
                <div class="note-title">Energy Baseline</div>
                <p class="note-body">24h energy consumption baseline: {{ energyTrend.avg.toFixed(1) }} kW avg, {{ energyTrend.max.toFixed(1) }} kW peak. PV generation peak: {{ pvTrend.max.toFixed(1) }} kW. Trend: {{ energyTrend.trend }}.</p>
              </div>
            </div>
            <div class="note-item note-item--city">
              <i class="pi pi-info-circle note-icon"></i>
              <div>
                <div class="note-title">Lighting Efficiency</div>
                <p class="note-body">Streetlight power trend: {{ lightingTrend.trend }} ({{ lightingTrend.trendPct }}%). Average: {{ lightingTrend.avg.toFixed(0) }} W, peak: {{ lightingTrend.max.toFixed(0) }} W. Data computed from live telemetry.</p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.live-banner { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #15803d; background: #dcfce7; padding: 0.375rem 1.5rem; border-bottom: 1px solid #bbf7d0; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.loading-state { display: flex; align-items: center; justify-content: center; gap: 0.75rem; padding: 4rem; color: var(--facis-text-secondary); font-size: 0.875rem; }

.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
.trend-section { display: flex; flex-direction: column; gap: 1rem; }
.trend-section__header { display: flex; align-items: center; justify-content: space-between; }
.domain-badge { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.875rem; font-weight: 700; padding: 0.4rem 0.875rem; border-radius: 20px; }
.domain-badge--energy { background: #fef3c7; color: #92400e; }
.domain-badge--city   { background: #f3e8ff; color: #7c3aed; }
.period-label { font-size: 0.8rem; color: var(--facis-text-secondary); }
.insight-notes { padding: 1.25rem; }
.notes-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.5rem; }
@media (max-width: 768px) { .notes-grid { grid-template-columns: 1fr; } }
.note-item { display: flex; gap: 0.875rem; padding: 1rem; border-radius: var(--facis-radius-sm); }
.note-item--energy { background: #fffbeb; border-left: 3px solid #f59e0b; }
.note-item--city   { background: #faf5ff; border-left: 3px solid #8b5cf6; }
.note-icon { font-size: 1rem; color: var(--facis-text-muted); flex-shrink: 0; padding-top: 0.1rem; }
.note-title { font-size: 0.875rem; font-weight: 600; color: var(--facis-text); margin-bottom: 0.35rem; }
.note-body { font-size: 0.8rem; color: var(--facis-text-secondary); line-height: 1.5; }
</style>
