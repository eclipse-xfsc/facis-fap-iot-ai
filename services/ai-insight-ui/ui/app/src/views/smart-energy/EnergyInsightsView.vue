<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import TimeSeriesChart from '@/components/common/TimeSeriesChart.vue'
import { getMeters, getMeterHistory, getPriceHistory, getPVSystems, getPVHistory, getLoads, getLoadCurrent } from '@/services/api'
import { detectAnomalies, computeCorrelations, generateRecommendations, computeTrends, extractMeterPowerKw, extractPvPowerKw } from '@/services/analytics'
import type { Anomaly, Recommendation } from '@/services/analytics'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend
} from 'chart.js'
import { Bar } from 'vue-chartjs'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const loading     = ref(true)
const isLive      = ref(false)
const anomalies   = ref<Anomaly[]>([])
const recommendations = ref<Recommendation[]>([])
const labels      = ref<string[]>([])
const consumptionData = ref<number[]>([])
const pvData      = ref<number[]>([])
const priceData   = ref<number[]>([])
const deviceLabels = ref<string[]>([])
const devicePower  = ref<number[]>([])
const baseLoad    = ref(0)
const peakLoad    = ref(0)
const avgLoad     = ref(0)
const pvCorr      = ref(0)
const priceCorr   = ref(0)
const bestWindows = ref<Array<{ hour: string; price: string; pv: string; score: number }>>([])

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [metersRes, pvRes, loadsRes] = await Promise.all([getMeters(), getPVSystems(), getLoads()])
    if (!metersRes) throw new Error('no meters')

    const firstMeterId = metersRes.meters[0]?.meter_id
    const firstPvId    = pvRes?.systems[0]?.system_id

    const [mHist, priceHist, pvHist] = await Promise.all([
      firstMeterId ? getMeterHistory(firstMeterId) : Promise.resolve(null),
      getPriceHistory(),
      firstPvId ? getPVHistory(firstPvId) : Promise.resolve(null)
    ])

    if (mHist?.readings?.length) {
      const trend = computeTrends(mHist.readings, extractMeterPowerKw)
      labels.value = trend.labels
      consumptionData.value = trend.values
      baseLoad.value = trend.min
      peakLoad.value = trend.max
      avgLoad.value  = trend.avg
      anomalies.value = detectAnomalies(mHist.readings, firstMeterId!, 'active_power_kw', 'Smart Energy')
    }

    if (pvHist?.readings?.length) {
      const pvTrend = computeTrends(pvHist.readings, extractPvPowerKw)
      pvData.value = pvTrend.values
      // Compute PV vs consumption correlation
      pvCorr.value = computeCorrelations(pvTrend.values, consumptionData.value.slice(0, pvTrend.values.length), 'PV vs Load').r
    }

    if (priceHist?.prices?.length) {
      priceData.value = priceHist.prices.slice(0, labels.value.length).map(p => p.price_eur_per_kwh)
      priceCorr.value = computeCorrelations(consumptionData.value.slice(0, priceData.value.length), priceData.value, 'Load vs Price').r
    }

    if (priceHist?.prices && mHist?.readings && pvHist?.readings) {
      recommendations.value = generateRecommendations(priceHist.prices, mHist.readings, pvHist.readings)
    }

    // Best windows: low price + high PV
    if (priceHist?.prices && pvHist?.readings) {
      const combined = priceHist.prices.map((p, i) => ({
        hour: p.timestamp ? new Date(p.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : `${i}:00`,
        price: p.price_eur_per_kwh,
        pv: pvHist!.readings[i]?.power_kw ?? 0
      }))
      bestWindows.value = combined
        .filter(w => w.pv > 5 && w.price < 0.12)
        .sort((a, b) => (b.pv / (b.price + 0.001)) - (a.pv / (a.price + 0.001)))
        .slice(0, 3)
        .map(w => ({
          hour: w.hour,
          price: w.price.toFixed(4),
          pv: w.pv.toFixed(1),
          score: Math.round(w.pv / (w.price + 0.001))
        }))
    }

    // Device current state
    if (loadsRes?.devices?.length) {
      const currents = await Promise.all(loadsRes.devices.slice(0, 6).map(d => getLoadCurrent(d.device_id)))
      deviceLabels.value = loadsRes.devices.slice(0, currents.filter(Boolean).length).map(d => d.device_type)
      devicePower.value  = currents.filter(Boolean).map(c => c!.power_kw)
    }

    isLive.value = true
  } catch {
    // fallback: leave refs empty
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchData())

const loadFactor = computed(() => peakLoad.value > 0 ? ((avgLoad.value / peakLoad.value) * 100).toFixed(1) : '0.0')

const barData = computed(() => ({
  labels: deviceLabels.value,
  datasets: [{
    label: 'Current Load (kW)',
    data: devicePower.value,
    backgroundColor: devicePower.value.map(v => v > 0 ? 'rgba(0,95,255,0.7)' : 'rgba(148,163,184,0.5)'),
    borderRadius: 4
  }]
}))

const barOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(15,23,42,0.92)', bodyFont: { family: 'Inter', size: 12 }, padding: 10 } },
  scales: {
    x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#94a3b8' } },
    y: { grid: { color: 'rgba(226,232,240,0.6)' }, ticks: { font: { family: 'Inter', size: 11 }, color: '#94a3b8' } }
  }
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="AI Insights & Analytics"
      subtitle="Explainable correlations, anomalies, and actionable recommendations for Smart Energy — computed from live data"
      :breadcrumbs="[{ label: 'Use Cases' }, { label: 'Smart Energy' }, { label: 'AI Insights' }]"
    />

    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> All analysis computed from live simulation telemetry
    </div>

    <div class="view-body">
      <div v-if="loading" class="loading-state">
        <i class="pi pi-spin pi-spinner" style="font-size:1.5rem;color:var(--facis-primary)"></i>
        <span>Computing energy insights from live data…</span>
      </div>

      <template v-else>
        <!-- KPI strip -->
        <div class="grid-kpi">
          <KpiCard label="Anomalies Detected" :value="anomalies.length" trend="stable" icon="pi-exclamation-triangle" color="#ef4444" />
          <KpiCard label="Recommendations"    :value="recommendations.length" trend="stable" icon="pi-lightbulb" color="#22c55e" />
          <KpiCard label="PV-Load Corr. r"   :value="pvCorr.toFixed(3)" trend="stable" icon="pi-sun" color="#f59e0b" />
          <KpiCard label="Price-Load Corr. r" :value="priceCorr.toFixed(3)" trend="stable" icon="pi-euro" color="#8b5cf6" />
          <KpiCard label="Load Factor"        :value="loadFactor" unit="%" trend="stable" icon="pi-chart-bar" color="#005fff" />
        </div>

        <!-- Correlation Charts -->
        <section class="dashboard__section">
          <div class="section-title">Correlation Analysis</div>
          <div class="charts-grid-2">
            <div class="card card-body">
              <div class="chart-title">Consumption vs Electricity Price (24h)</div>
              <div class="chart-subtitle">Correlation r={{ priceCorr.toFixed(3) }} — {{ Math.abs(priceCorr) > 0.6 ? 'strong' : 'weak' }} coupling</div>
              <TimeSeriesChart
                :datasets="[
                  { label: 'Consumption (kW)', data: consumptionData, borderColor: '#005fff', fill: false, tension: 0.4, yAxisID: 'y' },
                  { label: 'Price (€/kWh)', data: priceData, borderColor: '#8b5cf6', fill: false, tension: 0.4, yAxisID: 'y2' }
                ]"
                :labels="labels" y-axis-label="Power (kW)" y2-axis-label="Price (€/kWh)" :height="240"
              />
            </div>
            <div class="card card-body">
              <div class="chart-title">Consumption vs PV Generation (24h)</div>
              <div class="chart-subtitle">Correlation r={{ pvCorr.toFixed(3) }} — PV displacing grid draw</div>
              <TimeSeriesChart
                :datasets="[
                  { label: 'Consumption (kW)', data: consumptionData, borderColor: '#005fff', fill: false, tension: 0.4 },
                  { label: 'PV Generation (kW)', data: pvData, borderColor: '#22c55e', fill: false, tension: 0.4 }
                ]"
                :labels="labels" y-axis-label="kW" :height="240"
              />
            </div>
          </div>
        </section>

        <!-- Load Analysis -->
        <div class="bottom-grid">
          <div class="card card-body">
            <div class="chart-title">Consumer Load Patterns</div>
            <div class="chart-subtitle">Current power draw by device type — live readings</div>
            <div v-if="devicePower.length" style="height:220px;position:relative;margin-top:1rem">
              <Bar :data="barData" :options="barOptions" />
            </div>
            <div v-else class="no-data-note">No device data — ensure loads API is available</div>
          </div>

          <div class="card card-body">
            <div class="chart-title">Base Load vs Peak Load Analysis</div>
            <div class="chart-subtitle">Load factor measures efficiency — higher is better</div>
            <div class="load-analysis">
              <div class="load-bar-wrapper">
                <div class="load-bar"><div class="load-bar__fill load-bar__fill--base" :style="{ width: peakLoad > 0 ? `${(baseLoad / peakLoad) * 100}%` : '0%' }"><span>Base Load</span></div></div>
                <span class="load-bar__label">{{ baseLoad.toFixed(1) }} kW</span>
              </div>
              <div class="load-bar-wrapper">
                <div class="load-bar"><div class="load-bar__fill load-bar__fill--avg" :style="{ width: peakLoad > 0 ? `${(avgLoad / peakLoad) * 100}%` : '0%' }"><span>Avg Load</span></div></div>
                <span class="load-bar__label">{{ avgLoad.toFixed(1) }} kW</span>
              </div>
              <div class="load-bar-wrapper">
                <div class="load-bar"><div class="load-bar__fill load-bar__fill--peak" style="width:100%"><span>Peak Load</span></div></div>
                <span class="load-bar__label">{{ peakLoad.toFixed(1) }} kW</span>
              </div>
            </div>
            <div class="load-factor-display">
              <span class="load-factor__label">Load Factor</span>
              <span class="load-factor__value">{{ loadFactor }}%</span>
              <span class="load-factor__note">(avg/peak — 100% = perfectly flat)</span>
            </div>
          </div>
        </div>

        <!-- Best Windows -->
        <section class="dashboard__section">
          <div class="section-title">Best Operating Windows</div>
          <div class="card card-body windows-card">
            <div class="windows-header">
              <i class="pi pi-clock" style="color:#22c55e"></i>
              <span>Optimal hours for flexible load scheduling — low price + high PV generation (live data)</span>
            </div>
            <div v-if="bestWindows.length" class="windows-grid">
              <div v-for="w in bestWindows" :key="w.hour" class="window-item">
                <div class="window-item__time">{{ w.hour }}</div>
                <div class="window-item__details">
                  <span class="window-item__price">€{{ w.price }}/kWh</span>
                  <span class="window-item__pv">{{ w.pv }} kW PV</span>
                </div>
                <div class="window-item__score"><span class="score-val">Score: {{ w.score }}</span></div>
              </div>
            </div>
            <div v-else class="no-windows"><i class="pi pi-moon"></i><span>No optimal windows in current period — check during daylight hours with low prices</span></div>
          </div>
        </section>

        <!-- Recommendations -->
        <section class="dashboard__section">
          <div class="section-title">Explainable Recommendations</div>
          <div v-if="!recommendations.length" class="card card-body no-data-note">No recommendations at this time — data is within normal operating parameters.</div>
          <div v-else class="recommendations-list">
            <div v-for="rec in recommendations" :key="rec.id" class="rec-card card">
              <div class="rec-card__header">
                <div class="rec-card__icon" :style="{ background: '#22c55e14', color: '#22c55e' }"><i class="pi pi-lightbulb"></i></div>
                <div class="rec-card__meta">
                  <div class="rec-card__title">{{ rec.title }}</div>
                  <div class="rec-card__attrs">
                    <span class="type-badge">{{ rec.category.replace('_', ' ') }}</span>
                    <span class="advisory-badge">Advisory Only</span>
                    <span class="text-xs text-muted">Object: {{ rec.affectedObject }}</span>
                  </div>
                </div>
                <div class="rec-card__confidence">
                  <div class="conf-bar"><div class="conf-bar__fill" :style="{ width: `${rec.confidence * 100}%`, background: '#22c55e' }"></div></div>
                  <span class="conf-label">{{ Math.round(rec.confidence * 100) }}% confidence</span>
                </div>
              </div>
              <p class="rec-card__explanation">{{ rec.explanation }}</p>
              <div class="rec-card__footer">
                <div class="impact-chip"><i class="pi pi-chart-bar"></i>{{ rec.estimatedImpact }}</div>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.live-banner { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #15803d; background: #dcfce7; padding: 0.375rem 1.5rem; border-bottom: 1px solid #bbf7d0; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.loading-state { display: flex; align-items: center; justify-content: center; gap: 0.75rem; padding: 4rem; color: var(--facis-text-secondary); font-size: 0.875rem; }
.no-data-note { font-size: 0.82rem; color: var(--facis-text-secondary); padding: 1rem; }

.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 2rem; }
.dashboard__section { display: flex; flex-direction: column; gap: 0.875rem; }
.charts-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
.bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
@media (max-width: 900px) { .charts-grid-2, .bottom-grid { grid-template-columns: 1fr; } }
.chart-title { font-size: 0.9rem; font-weight: 600; color: var(--facis-text); margin-bottom: 0.25rem; }
.chart-subtitle { font-size: 0.75rem; color: var(--facis-text-secondary); line-height: 1.4; margin-bottom: 0.75rem; }
.load-analysis { display: flex; flex-direction: column; gap: 0.875rem; margin-top: 1rem; }
.load-bar-wrapper { display: flex; align-items: center; gap: 0.875rem; }
.load-bar { flex: 1; height: 32px; background: var(--facis-surface-2); border-radius: var(--facis-radius-sm); overflow: hidden; }
.load-bar__fill { height: 100%; border-radius: var(--facis-radius-sm); display: flex; align-items: center; padding: 0 0.625rem; font-size: 0.75rem; font-weight: 600; color: white; transition: width 0.6s ease; }
.load-bar__fill--base { background: #22c55e; }
.load-bar__fill--avg  { background: #3b82f6; }
.load-bar__fill--peak { background: #ef4444; }
.load-bar__label { font-size: 0.857rem; font-weight: 700; color: var(--facis-text); min-width: 70px; text-align: right; }
.load-factor-display { display: flex; align-items: center; gap: 0.75rem; margin-top: 1rem; padding-top: 0.875rem; border-top: 1px solid var(--facis-border); }
.load-factor__label { font-size: 0.75rem; font-weight: 500; color: var(--facis-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
.load-factor__value { font-size: 1.4rem; font-weight: 700; color: var(--facis-text); }
.load-factor__note { font-size: 0.75rem; color: var(--facis-text-muted); }
.windows-card { display: flex; flex-direction: column; gap: 1rem; }
.windows-header { display: flex; align-items: center; gap: 0.5rem; font-size: 0.857rem; color: var(--facis-text-secondary); padding-bottom: 0.75rem; border-bottom: 1px solid var(--facis-border); }
.windows-grid { display: flex; gap: 1rem; flex-wrap: wrap; }
.window-item { display: flex; flex-direction: column; gap: 0.375rem; padding: 0.875rem 1.125rem; background: rgba(34,197,94,0.07); border: 1px solid rgba(34,197,94,0.25); border-radius: var(--facis-radius); min-width: 160px; }
.window-item__time { font-size: 1.3rem; font-weight: 700; color: var(--facis-text); }
.window-item__details { display: flex; gap: 0.625rem; }
.window-item__price { font-size: 0.786rem; font-weight: 600; color: #7c3aed; background: rgba(139,92,246,0.1); padding: 0.1rem 0.4rem; border-radius: 4px; }
.window-item__pv { font-size: 0.786rem; font-weight: 600; color: #15803d; background: rgba(34,197,94,0.1); padding: 0.1rem 0.4rem; border-radius: 4px; }
.score-val { font-size: 0.75rem; color: var(--facis-text-secondary); }
.no-windows { display: flex; align-items: center; gap: 0.5rem; color: var(--facis-text-secondary); font-size: 0.857rem; }
.recommendations-list { display: flex; flex-direction: column; gap: 1rem; }
.rec-card { display: flex; flex-direction: column; gap: 0.875rem; padding: 1.25rem; }
.rec-card__header { display: flex; align-items: flex-start; gap: 1rem; }
.rec-card__icon { width: 44px; height: 44px; border-radius: var(--facis-radius-sm); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; }
.rec-card__meta { flex: 1; display: flex; flex-direction: column; gap: 0.375rem; }
.rec-card__title { font-size: 0.95rem; font-weight: 700; color: var(--facis-text); }
.rec-card__attrs { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.type-badge { font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 20px; background: var(--facis-primary-light); color: var(--facis-primary); text-transform: capitalize; }
.advisory-badge { font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 20px; background: rgba(139,92,246,0.1); color: #7c3aed; }
.rec-card__confidence { display: flex; flex-direction: column; align-items: flex-end; gap: 0.35rem; min-width: 120px; }
.conf-bar { width: 100%; height: 6px; background: var(--facis-border); border-radius: 3px; overflow: hidden; }
.conf-bar__fill { height: 100%; border-radius: 3px; }
.conf-label { font-size: 0.75rem; font-weight: 600; color: var(--facis-text-secondary); }
.rec-card__explanation { font-size: 0.857rem; color: var(--facis-text-secondary); line-height: 1.6; padding: 0.875rem; background: var(--facis-surface-2); border-radius: var(--facis-radius-sm); border-left: 3px solid var(--facis-primary-light); }
.rec-card__footer { display: flex; align-items: center; gap: 0.5rem; }
.impact-chip { display: flex; align-items: center; gap: 0.375rem; font-size: 0.786rem; font-weight: 600; padding: 0.3rem 0.75rem; border-radius: 20px; background: rgba(34,197,94,0.1); color: #15803d; }
</style>
