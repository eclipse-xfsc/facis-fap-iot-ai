<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import TimeSeriesChart from '@/components/common/TimeSeriesChart.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useRouter } from 'vue-router'
import {
  getMeters,
  getMeterCurrent,
  getMeterHistory,
  getPVSystems,
  getPVCurrent,
  getPriceHistory,
  getPriceCurrent,
  getWeatherStations,
  getWeatherCurrent,
  type SimMeterCurrent,
  type SimPVCurrent,
  type SimPriceCurrent,
  type SimWeatherCurrent,
  type SimMeterHistoryReading,
  type SimPrice
} from '@/services/api'

const router = useRouter()

// ─── Live data refs ────────────────────────────────────────────────────────────
const loading = ref(true)
const error = ref(false)
const apiAvailable = ref(false)

// Current readings from first meter / PV system
const meterCurrent = ref<SimMeterCurrent | null>(null)
const pvCurrent = ref<SimPVCurrent | null>(null)
const priceCurrent = ref<SimPriceCurrent | null>(null)
const weatherCurrent = ref<SimWeatherCurrent | null>(null)

// History for chart
const meterHistory = ref<SimMeterHistoryReading[]>([])
const priceHistory = ref<SimPrice[]>([])

async function fetchData(): Promise<void> {
  loading.value = true
  error.value = false
  const [metersResp, pvResp, priceResp, weatherResp] = await Promise.all([
    getMeters(),
    getPVSystems(),
    getPriceCurrent(),
    getWeatherStations()
  ])

  if (!metersResp && !pvResp && !priceResp && !weatherResp) {
    error.value = true
    loading.value = false
    return
  }

  if (metersResp?.meters?.length) {
    const firstId = metersResp.meters[0].meter_id
    const [cur, hist] = await Promise.all([
      getMeterCurrent(firstId),
      getMeterHistory(firstId)
    ])
    meterCurrent.value = cur
    if (hist?.readings) meterHistory.value = hist.readings
  }

  if (pvResp?.systems?.length) {
    pvCurrent.value = await getPVCurrent(pvResp.systems[0].system_id)
  }

  priceCurrent.value = priceResp

  const [phist, wcur] = await Promise.all([
    getPriceHistory(),
    weatherResp?.stations?.length ? getWeatherCurrent(weatherResp.stations[0].station_id) : Promise.resolve(null)
  ])
  if (phist?.prices) priceHistory.value = phist.prices
  weatherCurrent.value = wcur

  apiAvailable.value = !!(meterCurrent.value || pvCurrent.value || priceCurrent.value)
  loading.value = false
}

onMounted(fetchData)

// ─── Derived chart data ────────────────────────────────────────────────────────

// Labels: from real history timestamps only
const chartLabels = computed((): string[] => {
  return meterHistory.value.map(r =>
    new Date(r.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
})

// Compute total active power from 3-phase readings
function totalPowerKw(r: SimMeterHistoryReading): number {
  return (r.active_power_l1_w + r.active_power_l2_w + r.active_power_l3_w) / 1000
}

// Chart dataset toggles
const showPrice = ref(true)

const mainDatasets = computed(() => {
  const ds = [
    {
      label: 'Consumption (kW)',
      data: meterHistory.value.map(totalPowerKw),
      borderColor: '#005fff',
      backgroundColor: 'rgba(0,95,255,0.07)',
      fill: true,
      tension: 0.4,
      yAxisID: 'y'
    },
    {
      label: 'PV Generation (kW)',
      data: meterHistory.value.map(() => pvCurrent.value?.readings.power_kw ?? 0),
      borderColor: '#22c55e',
      backgroundColor: 'rgba(34,197,94,0.05)',
      fill: false,
      tension: 0.4,
      yAxisID: 'y'
    },
    {
      label: 'Grid Import (kW)',
      data: meterHistory.value.map(r => Math.max(0, totalPowerKw(r) - (pvCurrent.value?.readings.power_kw ?? 0))),
      borderColor: '#f59e0b',
      fill: false,
      tension: 0.4,
      yAxisID: 'y'
    }
  ]

  if (showPrice.value && priceHistory.value.length > 0) {
    ds.push({
      label: 'Spot Price (€/kWh)',
      data: priceHistory.value.map(p => p.price_eur_per_kwh),
      borderColor: '#8b5cf6',
      fill: false,
      tension: 0.4,
      yAxisID: 'y2'
    })
  }

  return ds
})

// ─── KPI values from real API only ────────────────────────────────────────────

const liveConsumption = computed((): number | null => {
  const r = meterCurrent.value?.readings
  if (!r) return null
  return (r.active_power_l1_w + r.active_power_l2_w + r.active_power_l3_w) / 1000
})

const livePV = computed((): number | null =>
  pvCurrent.value?.readings.power_kw ?? null
)

const liveGridImport = computed((): number | null => {
  if (liveConsumption.value === null) return null
  return Math.max(0, liveConsumption.value - (livePV.value ?? 0))
})

const liveSelfConsumption = computed((): string => {
  if (liveConsumption.value === null || liveConsumption.value === 0) return '—'
  return Math.min(100, ((livePV.value ?? 0) / liveConsumption.value) * 100).toFixed(1)
})

const livePrice = computed((): number | null =>
  priceCurrent.value?.current.price_eur_per_kwh ?? null
)

const liveTemp = computed((): string =>
  weatherCurrent.value?.conditions.temperature_c.toFixed(1) ?? '—'
)

// 7 KPI cards — all values from real API, show '—' when not available
const kpis = computed(() => [
  {
    label: 'Total Consumption',
    value: liveConsumption.value !== null ? liveConsumption.value.toFixed(1) : '—',
    unit: 'kW',
    trend: 'stable' as const,
    icon: 'pi-bolt',
    color: '#005fff'
  },
  {
    label: 'PV Generation',
    value: livePV.value !== null ? livePV.value.toFixed(1) : '—',
    unit: 'kW',
    trend: 'stable' as const,
    icon: 'pi-sun',
    color: '#22c55e'
  },
  {
    label: 'Grid Import',
    value: liveGridImport.value !== null ? liveGridImport.value.toFixed(1) : '—',
    unit: 'kW',
    trend: 'stable' as const,
    icon: 'pi-arrow-right-arrow-left',
    color: '#f59e0b'
  },
  {
    label: 'Self-Consumption',
    value: liveSelfConsumption.value,
    unit: liveSelfConsumption.value !== '—' ? '%' : '',
    trend: 'stable' as const,
    icon: 'pi-sync',
    color: '#22c55e'
  },
  {
    label: 'Current Price',
    value: livePrice.value !== null ? livePrice.value.toFixed(4) : '—',
    unit: livePrice.value !== null ? '€/kWh' : '',
    trend: 'stable' as const,
    icon: 'pi-euro',
    color: '#8b5cf6'
  },
  {
    label: 'Temperature',
    value: liveTemp.value,
    unit: liveTemp.value !== '—' ? '°C' : '',
    trend: 'stable' as const,
    icon: 'pi-sun',
    color: '#f59e0b'
  },
  {
    label: 'Data Points',
    value: meterHistory.value.length,
    unit: '',
    trend: 'stable' as const,
    icon: 'pi-database',
    color: '#ef4444'
  }
])

// Trend summary — computed from real history only
const trendCards = computed(() => {
  if (meterHistory.value.length === 0) return []
  const totalKwh = meterHistory.value.reduce((s, r) => s + totalPowerKw(r), 0)
  const maxKw = Math.max(...meterHistory.value.map(totalPowerKw))
  const minKw = Math.min(...meterHistory.value.map(totalPowerKw))
  return [
    { label: 'Total (history window)', value: `${totalKwh.toFixed(0)} kWh`, icon: 'pi-chart-bar' },
    { label: 'Peak Reading', value: `${maxKw.toFixed(1)} kW`, icon: 'pi-arrow-up' },
    { label: 'Min Reading', value: `${minKw.toFixed(1)} kW`, icon: 'pi-arrow-down' }
  ]
})

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Smart Energy Overview"
      subtitle="Energy metering, PV generation, and cost analytics — last 24 hours"
      :breadcrumbs="[{ label: 'Use Cases' }, { label: 'Smart Energy' }, { label: 'Overview' }]"
    >
      <template #actions>
        <Button label="Assets" icon="pi pi-gauge" size="small" outlined @click="router.push('/use-cases/smart-energy/assets')" />
        <Button label="AI Insights" icon="pi pi-lightbulb" size="small" outlined @click="router.push('/use-cases/smart-energy/insights')" />
        <Button icon="pi pi-refresh" size="small" text :loading="loading" @click="fetchData()" />
      </template>
    </PageHeader>

    <!-- API error state -->
    <div v-if="error && !loading" class="api-error-banner">
      <i class="pi pi-exclamation-circle"></i>
      <span>Could not load data from simulation API</span>
      <Button label="Retry" size="small" @click="fetchData()" />
    </div>
    <div v-else-if="apiAvailable && !loading" class="live-banner">
      <i class="pi pi-circle-fill live-banner__dot"></i>
      Live data from simulation API
    </div>

    <div class="view-body">

      <!-- KPI Row -->
      <div class="grid-kpi grid-kpi--7">
        <KpiCard
          v-for="item in kpis"
          :key="item.label"
          :label="item.label"
          :value="item.value"
          :unit="item.unit"
          :trend="item.trend"
          :trend-value="item.trendValue"
          :icon="item.icon"
          :color="item.color"
        />
      </div>

      <!-- Main 24h Chart -->
      <div class="card card-body">
        <div class="chart-header">
          <div class="section-title" style="margin-bottom:0">Power & Generation — Last 24h</div>
          <div class="chart-toggles">
            <button
              class="toggle-btn"
              :class="{ 'toggle-btn--active': showPrice }"
              @click="showPrice = !showPrice"
            >
              <span class="toggle-btn__dot" style="background:#8b5cf6"></span>
              Price Overlay
            </button>
          </div>
        </div>
        <TimeSeriesChart
          :datasets="mainDatasets"
          :labels="chartLabels"
          y-axis-label="Power (kW)"
          y2-axis-label="Price (€/kWh)"
          :height="340"
        />
      </div>

      <!-- Trend Summary Cards (from real history) -->
      <div v-if="trendCards.length > 0" class="trend-grid">
        <div
          v-for="card in trendCards"
          :key="card.label"
          class="trend-card card card-body"
        >
          <div class="trend-card__header">
            <i :class="`pi ${card.icon}`" class="trend-card__icon"></i>
            <span class="trend-card__label">{{ card.label }}</span>
          </div>
          <div class="trend-card__value">{{ card.value }}</div>
        </div>
      </div>

      <!-- Price history table -->
      <div v-if="priceHistory.length > 0" class="card card-body">
        <div class="section-title" style="margin-bottom:1rem">Recent Price Points</div>
        <div class="mini-table">
          <div class="mini-table__row mini-table__row--header">
            <span>Timestamp</span><span>Price (€/kWh)</span><span>Tariff</span>
          </div>
          <div v-for="p in priceHistory.slice(-5).reverse()" :key="p.timestamp" class="mini-table__row">
            <span class="text-muted">{{ fmtTs(p.timestamp) }}</span>
            <span class="font-semibold" style="color:#8b5cf6">{{ p.price_eur_per_kwh.toFixed(4) }}</span>
            <StatusBadge :status="p.tariff_type === 'peak' ? 'warning' : 'info'" size="sm" :show-dot="false" />
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }

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

.mini-table { border: 1px solid var(--facis-border); border-radius: var(--facis-radius-sm); overflow: hidden; }
.mini-table__row { display: grid; grid-template-columns: 1.5fr 1fr 1fr; padding: 0.5rem 1rem; border-top: 1px solid var(--facis-border); font-size: 0.857rem; align-items: center; gap: 0.5rem; }
.mini-table__row--header { background: var(--facis-surface-2); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; color: var(--facis-text-secondary); border-top: none; }

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

.demo-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 1.5rem;
  font-size: 0.75rem;
  color: var(--facis-text-secondary);
  background: var(--facis-surface-2);
  border-bottom: 1px solid var(--facis-border);
}

.grid-kpi--7 {
  grid-template-columns: repeat(7, 1fr);
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.chart-toggles {
  display: flex;
  gap: 0.5rem;
}

.toggle-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.3rem 0.75rem;
  border-radius: 20px;
  border: 1px solid var(--facis-border);
  background: var(--facis-surface);
  color: var(--facis-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.toggle-btn:hover {
  border-color: var(--facis-primary);
  color: var(--facis-primary);
}

.toggle-btn--active {
  background: var(--facis-primary-light);
  border-color: var(--facis-primary);
  color: var(--facis-primary);
}

.toggle-btn__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Trend cards */
.trend-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.trend-card__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.625rem;
}

.trend-card__icon {
  font-size: 0.9rem;
  color: var(--facis-primary);
}

.trend-card__label {
  font-size: 0.786rem;
  font-weight: 500;
  color: var(--facis-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.trend-card__value {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--facis-text);
  margin-bottom: 0.375rem;
}

.trend-card__delta {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.786rem;
  font-weight: 600;
}

/* Bottom split */
.bottom-split {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 1.5rem;
}

.insights-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.insight-item {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  padding: 0.875rem;
  background: var(--facis-surface-2);
  border-radius: var(--facis-radius-sm);
}

.insight-item__icon {
  width: 36px;
  height: 36px;
  border-radius: var(--facis-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.insight-item__body {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.insight-item__title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--facis-text);
}

.insight-item__summary {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
  line-height: 1.4;
}

.insight-item__footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.25rem;
}

.advisory-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 20px;
  background: rgba(139, 92, 246, 0.12);
  color: #7c3aed;
}

.confidence-pill {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 20px;
  background: rgba(34, 197, 94, 0.1);
  color: #15803d;
}

.no-items {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem;
  color: var(--facis-text-secondary);
  font-size: 0.875rem;
}

@media (max-width: 1200px) {
  .grid-kpi--7 {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 900px) {
  .trend-grid { grid-template-columns: 1fr; }
  .bottom-split { grid-template-columns: 1fr; }
}
</style>
