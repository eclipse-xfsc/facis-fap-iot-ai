<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Scatter } from 'vue-chartjs'
import {
  Chart as ChartJS, LinearScale, PointElement, Tooltip, Legend,
  type ChartOptions
} from 'chart.js'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import { getMeters, getMeterHistory, getPriceHistory, getWeatherStations, getWeatherHistory, getPVSystems, getPVHistory } from '@/services/api'
import { computeCorrelations, extractMeterPowerKw } from '@/services/analytics'
import type { CorrelationResult } from '@/services/analytics'

ChartJS.register(LinearScale, PointElement, Tooltip, Legend)

interface CorrelationPair {
  id: string
  title: string
  xLabel: string
  yLabel: string
  correlationR: number
  strength: 'strong' | 'moderate' | 'weak'
  direction: 'positive' | 'negative' | 'none'
  insight: string
  xData: number[]
  yData: number[]
}

const loading      = ref(true)
const isLive       = ref(false)
const correlations = ref<CorrelationPair[]>([])

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [metersRes, stationsRes, pvRes] = await Promise.all([
      getMeters(), getWeatherStations(), getPVSystems()
    ])
    if (!metersRes || !pvRes) throw new Error('no data')

    const firstMeterId   = metersRes.meters[0]?.meter_id
    const firstStationId = stationsRes?.stations[0]?.station_id
    const firstPvId      = pvRes.systems[0]?.system_id

    const [mHist, priceHist, wxHist, pvHist] = await Promise.all([
      firstMeterId   ? getMeterHistory(firstMeterId) : Promise.resolve(null),
      getPriceHistory(),
      firstStationId ? getWeatherHistory(firstStationId) : Promise.resolve(null),
      firstPvId      ? getPVHistory(firstPvId) : Promise.resolve(null)
    ])

    const meterPower = (mHist?.readings ?? []).map(r => extractMeterPowerKw(r as Record<string, unknown>))
    const prices     = (priceHist?.prices ?? []).map(p => p.price_eur_per_kwh)
    const temps      = (wxHist?.readings ?? []).map(r => r.temperature_c)
    const ghi        = (wxHist?.readings ?? []).map(r => r.ghi_w_m2)
    const pvPower    = (pvHist?.readings ?? []).map(r => r.power_kw)

    const pairs: CorrelationPair[] = []

    if (meterPower.length && prices.length) {
      const result: CorrelationResult = computeCorrelations(meterPower, prices.slice(0, meterPower.length), 'Consumption vs Price')
      pairs.push({
        id: 'c1', title: 'Energy Consumption vs Electricity Price', xLabel: 'Price (€/kWh)', yLabel: 'Power (kW)',
        correlationR: result.r, strength: result.strength, direction: result.direction,
        insight: result.direction === 'negative'
          ? 'Consumption drops when prices rise — demand response behaviour detected.'
          : 'Weak price-demand coupling — load profile is largely inelastic.',
        xData: prices.slice(0, meterPower.length),
        yData: meterPower
      })
    }

    if (meterPower.length && temps.length) {
      const result: CorrelationResult = computeCorrelations(temps, meterPower.slice(0, temps.length), 'Temperature vs Consumption')
      pairs.push({
        id: 'c2', title: 'Temperature vs Energy Consumption', xLabel: 'Temperature (°C)', yLabel: 'Power (kW)',
        correlationR: result.r, strength: result.strength, direction: result.direction,
        insight: result.strength === 'strong'
          ? `Strong ${result.direction} correlation (r=${result.r}) — HVAC-driven load visible.`
          : `Moderate coupling (r=${result.r}) — partial HVAC influence.`,
        xData: temps.slice(0, meterPower.length),
        yData: meterPower.slice(0, temps.length)
      })
    }

    if (ghi.length && pvPower.length) {
      const result: CorrelationResult = computeCorrelations(ghi, pvPower.slice(0, ghi.length), 'GHI vs PV')
      pairs.push({
        id: 'c3', title: 'Solar Irradiance vs PV Output', xLabel: 'GHI (W/m²)', yLabel: 'PV Power (kW)',
        correlationR: result.r, strength: result.strength, direction: result.direction,
        insight: `${result.strength} ${result.direction} correlation (r=${result.r}) — irradiance is the primary PV driver.`,
        xData: ghi.slice(0, pvPower.length),
        yData: pvPower.slice(0, ghi.length)
      })
    }

    if (pvPower.length && meterPower.length) {
      const result: CorrelationResult = computeCorrelations(pvPower, meterPower.slice(0, pvPower.length), 'PV vs Grid Import')
      pairs.push({
        id: 'c4', title: 'PV Generation vs Grid Import', xLabel: 'PV Power (kW)', yLabel: 'Meter Load (kW)',
        correlationR: result.r, strength: result.strength, direction: result.direction,
        insight: result.direction === 'negative'
          ? 'PV reduces grid draw — self-consumption confirmed.'
          : `Correlation r=${result.r} — mixed generation/load pattern.`,
        xData: pvPower.slice(0, meterPower.length),
        yData: meterPower.slice(0, pvPower.length)
      })
    }

    correlations.value = pairs
    isLive.value = pairs.length > 0
  } catch {
    // leave empty — template shows fallback message
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchData())

const avgR         = computed(() => correlations.value.length ? (correlations.value.reduce((a, c) => a + Math.abs(c.correlationR), 0) / correlations.value.length).toFixed(2) : '0.00')
const strongCount  = computed(() => correlations.value.filter(c => c.strength === 'strong').length)
const moderateCount = computed(() => correlations.value.filter(c => c.strength === 'moderate').length)

function strengthColor(s: string): string {
  if (s === 'strong') return '#22c55e'
  if (s === 'moderate') return '#f59e0b'
  return '#94a3b8'
}

function buildScatterData(pair: CorrelationPair) {
  return { datasets: [{ label: pair.title, data: pair.xData.map((x, i) => ({ x, y: pair.yData[i] })), backgroundColor: strengthColor(pair.strength) + '88', borderColor: strengthColor(pair.strength), pointRadius: 4, pointHoverRadius: 6 }] }
}

function rBg(r: number): string {
  const abs = Math.abs(r)
  if (abs >= 0.8) return 'var(--facis-success-light)'
  if (abs >= 0.6) return 'var(--facis-warning-light)'
  return 'var(--facis-surface-2)'
}

function rColor(r: number): string {
  const abs = Math.abs(r)
  if (abs >= 0.8) return '#15803d'
  if (abs >= 0.6) return '#92400e'
  return '#475569'
}

const scatterOptions = computed<ChartOptions<'scatter'>>(() => ({
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { backgroundColor: 'rgba(15,23,42,0.92)', titleFont: { family: 'Inter', size: 11 }, bodyFont: { family: 'Inter', size: 11 }, padding: 8, cornerRadius: 6 }
  },
  scales: {
    x: { grid: { color: 'rgba(226,232,240,0.6)' }, ticks: { font: { family: 'Inter', size: 10 }, color: '#94a3b8' } },
    y: { grid: { color: 'rgba(226,232,240,0.6)' }, ticks: { font: { family: 'Inter', size: 10 }, color: '#94a3b8' } }
  }
}))
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Correlations"
      subtitle="Pearson correlation analysis between live energy, environmental, and city datasets"
      :breadcrumbs="[{ label: 'Analytics' }, { label: 'Correlations' }]"
    />

    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> Computed from live simulation telemetry — Pearson r on 24h data
    </div>

    <div class="view-body">
      <div v-if="loading" class="loading-state">
        <i class="pi pi-spin pi-spinner" style="font-size:1.5rem;color:var(--facis-primary)"></i>
        <span>Computing correlations from live data…</span>
      </div>

      <template v-else>
        <div class="grid-kpi">
          <KpiCard label="Correlation Pairs" :value="correlations.length" trend="stable" icon="pi-link" color="#005fff" />
          <KpiCard label="Strong Correlations" :value="strongCount" trend="stable" icon="pi-check-circle" color="#22c55e" />
          <KpiCard label="Moderate Correlations" :value="moderateCount" trend="stable" icon="pi-minus-circle" color="#f59e0b" />
          <KpiCard label="Avg |R| Value" :value="avgR" trend="stable" icon="pi-chart-scatter" color="#8b5cf6" />
        </div>

        <div v-if="!correlations.length" class="card card-body empty-state">
          <i class="pi pi-info-circle"></i>
          <span>Insufficient data to compute correlations — ensure simulation is running.</span>
        </div>

        <div v-else class="corr-grid">
          <div v-for="pair in correlations" :key="pair.id" class="corr-card card">
            <div class="corr-card__header">
              <div class="corr-title">{{ pair.title }}</div>
              <div class="corr-badges">
                <span class="strength-badge" :style="{ background: strengthColor(pair.strength) + '18', color: strengthColor(pair.strength) }">{{ pair.strength }}</span>
                <span class="direction-badge">{{ pair.direction }}</span>
              </div>
            </div>
            <div class="corr-r-row">
              <span class="r-label">Pearson r</span>
              <span class="r-value" :style="{ background: rBg(pair.correlationR), color: rColor(pair.correlationR) }">{{ pair.correlationR.toFixed(3) }}</span>
              <div class="r-bar-bg">
                <div class="r-bar-fill" :style="{ width: Math.abs(pair.correlationR) * 100 + '%', background: strengthColor(pair.strength) }" />
              </div>
            </div>
            <div class="corr-chart">
              <div class="chart-wrap">
                <Scatter :data="buildScatterData(pair)" :options="scatterOptions" style="height:160px" />
              </div>
              <div class="chart-axis-label chart-axis-label--x">{{ pair.xLabel }}</div>
            </div>
            <div class="corr-insight">
              <i class="pi pi-info-circle corr-insight__icon"></i>
              <p class="corr-insight__text">{{ pair.insight }}</p>
            </div>
          </div>
        </div>

        <div class="card card-body method-note">
          <i class="pi pi-shield method-note__icon"></i>
          <div>
            <div class="method-note__title">Correlation Methodology</div>
            <p class="method-note__text">All coefficients computed using Pearson's r on live 24h simulation data. Strength thresholds: strong |r| ≥ 0.8, moderate 0.6–0.8, weak &lt; 0.6. Analysis is observational — causal inference requires domain expert validation.</p>
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
.empty-state { display: flex; align-items: center; gap: 0.75rem; padding: 2rem; color: var(--facis-text-secondary); font-size: 0.875rem; }

.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
.corr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(460px, 1fr)); gap: 1rem; }
@media (max-width: 1024px) { .corr-grid { grid-template-columns: 1fr; } }
.corr-card { display: flex; flex-direction: column; overflow: hidden; }
.corr-card__header { padding: 1rem 1.25rem 0.75rem; border-bottom: 1px solid var(--facis-border); display: flex; flex-direction: column; gap: 0.5rem; }
.corr-title { font-size: 0.9rem; font-weight: 600; color: var(--facis-text); }
.corr-badges { display: flex; align-items: center; gap: 0.5rem; }
.strength-badge { font-size: 0.72rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 20px; text-transform: capitalize; }
.direction-badge { font-size: 0.72rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 20px; background: var(--facis-surface-2); color: var(--facis-text-secondary); text-transform: capitalize; }
.corr-r-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1.25rem; }
.r-label { font-size: 0.78rem; font-weight: 500; color: var(--facis-text-secondary); min-width: 70px; }
.r-value { font-size: 0.875rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 4px; min-width: 55px; text-align: center; }
.r-bar-bg { flex: 1; height: 8px; background: var(--facis-surface-2); border-radius: 4px; overflow: hidden; }
.r-bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s; }
.corr-chart { padding: 0 1.25rem; }
.chart-wrap { position: relative; }
.chart-axis-label { font-size: 0.72rem; color: var(--facis-text-muted); text-align: center; }
.chart-axis-label--x { margin-top: 0.25rem; }
.corr-insight { display: flex; gap: 0.625rem; padding: 0.875rem 1.25rem; background: var(--facis-surface-2); border-top: 1px solid var(--facis-border); }
.corr-insight__icon { color: var(--facis-primary); font-size: 0.85rem; flex-shrink: 0; padding-top: 0.1rem; }
.corr-insight__text { font-size: 0.78rem; color: var(--facis-text-secondary); line-height: 1.5; }
.method-note { display: flex; gap: 0.875rem; background: #f0f9ff; border: 1px solid #bae6fd; }
.method-note__icon { color: #0284c7; font-size: 1rem; flex-shrink: 0; padding-top: 0.1rem; }
.method-note__title { font-size: 0.875rem; font-weight: 600; color: #0c4a6e; margin-bottom: 0.3rem; }
.method-note__text { font-size: 0.8rem; color: #0369a1; line-height: 1.5; }
</style>
