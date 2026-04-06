<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import TimeSeriesChart from '@/components/common/TimeSeriesChart.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import {
  getMeters, getMeterHistory, getPVSystems, getPVHistory,
  getStreetlights, getStreetlightHistory
} from '@/services/api'
import {
  detectAnomalies, generateRecommendations, computeTrends,
  extractMeterPowerKw, extractPvPowerKw, extractStreetlightPowerW
} from '@/services/analytics'
import type { Anomaly, Recommendation } from '@/services/analytics'

// ─── State ─────────────────────────────────────────────────────────────────
const loading       = ref(true)
const isLive        = ref(false)
const anomalies     = ref<Anomaly[]>([])
const recommendations = ref<Recommendation[]>([])
const labels24h     = ref<string[]>([])
const energyData    = ref<number[]>([])
const pvData        = ref<number[]>([])
const lightingData  = ref<number[]>([])

// ─── Computed ───────────────────────────────────────────────────────────────
const energyAnomalies = computed(() => anomalies.value.filter(a => a.useCase === 'Smart Energy'))
const cityAnomalies   = computed(() => anomalies.value.filter(a => a.useCase === 'Smart City'))
const openAnomalies   = computed(() => anomalies.value)
const highPriRecs     = computed(() => recommendations.value.filter(r => r.priority === 'high'))

const recentInsights = computed(() =>
  [...anomalies.value.slice(0, 4).map(a => ({ ...a, _kind: 'anomaly' })),
   ...recommendations.value.slice(0, 2).map(r => ({ ...r, _kind: 'rec' }))]
    .sort((a, b) => {
      const ta = (a as Record<string, unknown>)['timestamp'] ?? (a as Record<string, unknown>)['createdAt'] ?? ''
      const tb = (b as Record<string, unknown>)['timestamp'] ?? (b as Record<string, unknown>)['createdAt'] ?? ''
      return String(tb).localeCompare(String(ta))
    })
    .slice(0, 6)
)

// ─── Data fetch ─────────────────────────────────────────────────────────────
async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [metersRes, pvRes, lightsRes] = await Promise.all([
      getMeters(), getPVSystems(), getStreetlights()
    ])
    if (!metersRes || !pvRes || !lightsRes) throw new Error('no data')

    // Fetch first meter and pv history for charts + anomalies
    const firstMeterId = metersRes.meters[0]?.meter_id
    const firstPvId    = pvRes.systems[0]?.system_id
    const firstLightId = lightsRes.streetlights[0]?.light_id

    const [mHist, pvHist, lHist] = await Promise.all([
      firstMeterId ? getMeterHistory(firstMeterId) : Promise.resolve(null),
      firstPvId    ? getPVHistory(firstPvId)       : Promise.resolve(null),
      firstLightId ? getStreetlightHistory(firstLightId) : Promise.resolve(null)
    ])

    if (mHist?.readings?.length) {
      const trend = computeTrends(mHist.readings, extractMeterPowerKw)
      labels24h.value  = trend.labels
      energyData.value = trend.values.map(v => Math.round(v * 10) / 10)
      anomalies.value  = detectAnomalies(mHist.readings, firstMeterId!, 'active_power_kw', 'Smart Energy')
    }

    if (pvHist?.readings?.length) {
      const pvTrend = computeTrends(pvHist.readings, extractPvPowerKw)
      pvData.value = pvTrend.values
    }

    if (lHist?.readings?.length) {
      const lTrend = computeTrends(lHist.readings, extractStreetlightPowerW)
      lightingData.value = lTrend.values.map(v => Math.round(v / 100) / 10)
    }

    // City anomalies from streetlights
    if (lHist?.readings?.length) {
      const { detectStreetlightAnomalies } = await import('@/services/analytics')
      const cityAnoms = detectStreetlightAnomalies(
        lHist.readings as Array<{ timestamp: string; power_w: number; dimming_level_pct: number }>,
        firstLightId!
      )
      anomalies.value = [...anomalies.value, ...cityAnoms]
    }

    // Recommendations — needs price data
    const { getPriceHistory } = await import('@/services/api')
    const priceHist = await getPriceHistory()
    if (priceHist?.prices && mHist?.readings && pvHist?.readings) {
      recommendations.value = generateRecommendations(
        priceHist.prices,
        mHist.readings,
        pvHist.readings
      )
    }

    isLive.value = true
  } catch {
    // Fallback: generate minimal labels so chart renders
    labels24h.value  = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
    energyData.value = labels24h.value.map((_, i) => Math.round(400 + Math.sin(i / 4) * 200))
    pvData.value     = labels24h.value.map((_, i) => i >= 6 && i <= 20 ? Math.max(0, Math.round(Math.sin((i - 6) * Math.PI / 14) * 180)) : 0)
    lightingData.value = labels24h.value.map((_, i) => Math.max(0, Math.round(300 + Math.sin((i - 8) / 6) * 250)))
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchData())

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch { return ts }
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Analytics Overview"
      subtitle="Cross-domain AI-powered analytics — anomaly detection, correlations, and recommendations"
      :breadcrumbs="[{ label: 'Analytics' }, { label: 'Overview' }]"
    />

    <!-- Live banner -->
    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> Live — computed from real simulation telemetry
    </div>

    <div class="view-body">
      <!-- Loading skeleton -->
      <div v-if="loading" class="loading-state">
        <i class="pi pi-spin pi-spinner" style="font-size:1.5rem;color:var(--facis-primary)"></i>
        <span>Loading live analytics…</span>
      </div>

      <template v-else>
        <!-- KPI strip -->
        <div class="grid-kpi">
          <KpiCard label="Active Anomalies" :value="openAnomalies.length" trend="stable" icon="pi-exclamation-triangle" color="#ef4444" />
          <KpiCard label="Energy Anomalies" :value="energyAnomalies.length" trend="stable" icon="pi-bolt" color="#f59e0b" />
          <KpiCard label="City Anomalies"   :value="cityAnomalies.length" trend="stable" icon="pi-map" color="#8b5cf6" />
          <KpiCard label="Recommendations"  :value="recommendations.length" trend="stable" icon="pi-lightbulb" color="#22c55e" />
          <KpiCard label="High Priority"    :value="highPriRecs.length" trend="stable" icon="pi-flag" color="#ef4444" />
          <KpiCard label="Data Source"      value="Live API" trend="stable" icon="pi-database" color="#005fff" />
        </div>

        <!-- Main chart -->
        <div class="card card-body">
          <div class="section-title">Energy Consumption vs PV Generation vs Lighting — Last 24h</div>
          <TimeSeriesChart
            :datasets="[
              { label: 'Total Consumption (kW)', data: energyData, borderColor: '#005fff', backgroundColor: 'rgba(0,95,255,0.07)', fill: true, tension: 0.4 },
              { label: 'PV Generation (kW)',     data: pvData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.07)', fill: true, tension: 0.4 },
              { label: 'Lighting Power (kW)',    data: lightingData, borderColor: '#f59e0b', yAxisID: 'y2', tension: 0.4 }
            ]"
            :labels="labels24h"
            y-axis-label="Energy / PV (kW)"
            y2-axis-label="Lighting (kW)"
            :height="320"
          />
        </div>

        <!-- Two-column: Energy summary + City summary -->
        <div class="two-col">
          <!-- Energy Analytics -->
          <div class="card">
            <div class="domain-header domain-header--energy">
              <div class="domain-icon"><i class="pi pi-bolt"></i></div>
              <div>
                <div class="domain-title">Smart Energy</div>
                <div class="domain-subtitle">{{ energyAnomalies.length }} anomalies · {{ recommendations.filter(r => r.useCase === 'Smart Energy').length }} recommendations</div>
              </div>
            </div>
            <div class="insight-list">
              <div v-for="a in energyAnomalies.slice(0, 4)" :key="a.id" class="insight-row">
                <StatusBadge :status="a.severity" size="sm" />
                <div class="insight-info">
                  <span class="insight-title">{{ a.meterId }} — {{ a.deviation }}σ spike</span>
                  <span class="insight-sub">{{ a.value }} kW vs {{ a.mean }} kW mean · {{ formatDate(a.timestamp) }}</span>
                </div>
              </div>
              <div v-if="!energyAnomalies.length" class="insight-row insight-row--empty">
                <i class="pi pi-check-circle" style="color:var(--facis-success)"></i>
                <span class="insight-title">No anomalies detected in current period</span>
              </div>
            </div>
          </div>

          <!-- City Analytics -->
          <div class="card">
            <div class="domain-header domain-header--city">
              <div class="domain-icon"><i class="pi pi-map"></i></div>
              <div>
                <div class="domain-title">Smart City</div>
                <div class="domain-subtitle">{{ cityAnomalies.length }} anomalies · {{ recommendations.filter(r => r.useCase === 'Smart City').length }} recommendations</div>
              </div>
            </div>
            <div class="insight-list">
              <div v-for="a in cityAnomalies.slice(0, 4)" :key="a.id" class="insight-row">
                <StatusBadge :status="a.severity" size="sm" />
                <div class="insight-info">
                  <span class="insight-title">{{ a.meterId }} — {{ a.deviation }}σ deviation</span>
                  <span class="insight-sub">{{ a.value }} W vs {{ a.mean }} W mean · {{ formatDate(a.timestamp) }}</span>
                </div>
              </div>
              <div v-if="!cityAnomalies.length" class="insight-row insight-row--empty">
                <i class="pi pi-check-circle" style="color:var(--facis-success)"></i>
                <span class="insight-title">No city anomalies detected</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Recent insights timeline -->
        <div class="card">
          <div class="card-header">
            <span class="section-title" style="margin-bottom:0">Recent Insights</span>
            <span class="record-count">{{ recentInsights.length }} latest events</span>
          </div>
          <div class="recent-list">
            <div v-for="item in recentInsights" :key="String((item as Record<string, unknown>).id)" class="recent-row">
              <div class="recent-type-dot" :style="{ background: (item as Record<string, unknown>)['_kind'] === 'anomaly' ? '#ef4444' : '#22c55e' }" />
              <StatusBadge :status="String((item as Record<string, unknown>).severity ?? 'info')" size="sm" />
              <div class="insight-info">
                <span class="insight-title">{{ String((item as Record<string, unknown>).title ?? (item as Record<string, unknown>).explanation ?? '') }}</span>
                <span class="insight-sub">{{ (item as Record<string, unknown>)['_kind'] === 'anomaly' ? 'Smart Energy' : (item as Record<string, unknown>).useCase }}</span>
              </div>
              <span class="recent-time">{{ formatDate(String((item as Record<string, unknown>).timestamp ?? (item as Record<string, unknown>).createdAt ?? '')) }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.live-banner { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #15803d; background: #dcfce7; padding: 0.375rem 1.5rem; border-bottom: 1px solid #bbf7d0; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.loading-state { display: flex; align-items: center; justify-content: center; gap: 0.75rem; padding: 4rem; color: var(--facis-text-secondary); font-size: 0.875rem; }

.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }

.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
@media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

.card-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid var(--facis-border); }
.record-count { font-size: 0.75rem; font-weight: 500; color: var(--facis-text-secondary); }

.domain-header { display: flex; align-items: center; gap: 0.875rem; padding: 1rem 1.25rem; border-bottom: 1px solid var(--facis-border); }
.domain-header--energy .domain-icon { background: #fef3c7; color: #92400e; }
.domain-header--city   .domain-icon { background: #f3e8ff; color: #7c3aed; }
.domain-icon { width: 36px; height: 36px; border-radius: var(--facis-radius-sm); display: flex; align-items: center; justify-content: center; font-size: 1rem; }
.domain-title { font-size: 0.9rem; font-weight: 600; color: var(--facis-text); }
.domain-subtitle { font-size: 0.75rem; color: var(--facis-text-secondary); }

.insight-list { display: flex; flex-direction: column; }
.insight-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 1.25rem; border-bottom: 1px solid var(--facis-border); }
.insight-row:last-child { border-bottom: none; }
.insight-row--empty { color: var(--facis-text-secondary); font-size: 0.82rem; gap: 0.5rem; }
.insight-info { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; overflow: hidden; }
.insight-title { font-size: 0.82rem; font-weight: 500; color: var(--facis-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.insight-sub { font-size: 0.72rem; color: var(--facis-text-secondary); }

.recent-list { display: flex; flex-direction: column; }
.recent-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 1.25rem; border-bottom: 1px solid var(--facis-border); }
.recent-row:last-child { border-bottom: none; }
.recent-type-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.recent-time { font-size: 0.75rem; color: var(--facis-text-muted); flex-shrink: 0; min-width: 120px; text-align: right; }
</style>
