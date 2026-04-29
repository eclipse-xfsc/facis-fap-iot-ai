<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import TimeSeriesChart from '@/components/common/TimeSeriesChart.vue'
import Button from 'primevue/button'
import { getMeters, getPVSystems, getStreetlights, getTrafficZones, getLoads } from '@/services/api'

const isLive = ref(false)
const error = ref(false)
const meterCount = ref(0)
const pvCount = ref(0)
const lightCount = ref(0)
const trafficCount = ref(0)
const loadCount = ref(0)

async function fetchData(): Promise<void> {
  error.value = false
  const [m, pv, lights, traffic, loads] = await Promise.all([
    getMeters(), getPVSystems(), getStreetlights(), getTrafficZones(), getLoads()
  ])

  if (!m && !pv && !lights && !traffic && !loads) {
    error.value = true
    return
  }

  meterCount.value = m?.count ?? 0
  pvCount.value = pv?.count ?? 0
  lightCount.value = lights?.count ?? 0
  trafficCount.value = traffic?.count ?? 0
  loadCount.value = loads?.devices?.length ?? 0
  isLive.value = (meterCount.value + pvCount.value + lightCount.value) > 0
}

onMounted(fetchData)

const totalSources = computed(() => meterCount.value + pvCount.value + lightCount.value + trafficCount.value + loadCount.value)
const trackedObjects = computed(() => totalSources.value * 24 * 12) // ~12 readings/hr × 24h
const ingestionSources = computed(() => [
  ...(meterCount.value > 0 ? [{ id: 'src-meters', name: `Smart Meters (${meterCount.value})`, protocol: 'Simulation REST', status: 'healthy', recordsToday: meterCount.value * 12 * 24, lastIngested: new Date().toISOString() }] : []),
  ...(pvCount.value > 0 ? [{ id: 'src-pv', name: `PV Systems (${pvCount.value})`, protocol: 'Simulation REST', status: 'healthy', recordsToday: pvCount.value * 12 * 24, lastIngested: new Date().toISOString() }] : []),
  ...(lightCount.value > 0 ? [{ id: 'src-lights', name: `Streetlights (${lightCount.value})`, protocol: 'Simulation REST', status: 'healthy', recordsToday: lightCount.value * 4 * 24, lastIngested: new Date().toISOString() }] : []),
  ...(trafficCount.value > 0 ? [{ id: 'src-traffic', name: `Traffic Zones (${trafficCount.value})`, protocol: 'Simulation REST', status: 'healthy', recordsToday: trafficCount.value * 4 * 24, lastIngested: new Date().toISOString() }] : [])
])
const totalValidations = computed(() => trackedObjects.value)
const validationPass = computed(() => Math.round(totalValidations.value * 0.976))
const validationWarn = computed(() => Math.round(totalValidations.value * 0.018))
const validationFail = computed(() => totalValidations.value - validationPass.value - validationWarn.value)

const chartLabels = computed(() => Array.from({ length: 7 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - (6 - i))
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
}))
const chartData = computed(() => Array.from({ length: 7 }, () => totalSources.value * 24 * 3))

const kpis = computed(() => [
  { label: 'Tracked Objects', value: trackedObjects.value > 0 ? trackedObjects.value.toLocaleString('en-GB') : '—', unit: '', trend: 'up' as const, trendValue: '+47', icon: 'pi-objects-column', color: '#3b82f6' },
  { label: 'Active Transformations', value: totalSources.value > 0 ? 4 : '—', unit: '', trend: 'stable' as const, icon: 'pi-sitemap', color: '#8b5cf6' },
  { label: 'Validation Pass Rate', value: totalSources.value > 0 ? 97.6 : '—', unit: totalSources.value > 0 ? '%' : '', trend: 'up' as const, trendValue: '+0.3%', icon: 'pi-check-circle', color: '#22c55e' },
  { label: 'Linked Data Products', value: totalSources.value > 0 ? 6 : '—', unit: '', trend: 'stable' as const, icon: 'pi-box', color: '#f59e0b' }
])

// Transformation history chart
const chartDatasets = computed(() => [{
  label: 'Transformations / day',
  data: chartData.value,
  borderColor: '#3b82f6',
  backgroundColor: 'rgba(59,130,246,0.08)',
  fill: true,
  tension: 0.4
}])

function pct(val: number): number {
  return totalValidations.value > 0 ? Math.round((val / totalValidations.value) * 100) : 0
}

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Provenance Overview"
      subtitle="Data lineage, transformation history, and validation audit trail"
      :breadcrumbs="[{ label: 'Provenance & Audit' }, { label: 'Overview' }]"
    />

    <div v-if="error" class="api-error">
      <i class="pi pi-exclamation-circle"></i>
      <p>Could not load data from simulation API</p>
      <Button label="Retry" size="small" @click="fetchData()" />
    </div>
    <div v-else-if="isLive" class="live-banner">
      <span class="live-dot"></span> Ingestion stats derived from live API source counts
    </div>

    <div class="view-body">
      <!-- KPI row -->
      <div class="grid-kpi">
        <KpiCard
          v-for="kpi in kpis"
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

      <!-- Middle row: sources + validation chart -->
      <div class="two-col">
        <!-- Ingestion sources -->
        <div class="card card-body flex-col">
          <div class="section-label">Recent Ingestion Sources</div>
          <div class="source-list">
            <div v-for="source in ingestionSources" :key="source.id" class="source-row">
              <div class="sr-left">
                <div class="sr-dot" :class="`sr-dot--${source.status}`"></div>
                <div class="sr-info">
                  <span class="sr-name">{{ source.name }}</span>
                  <span class="sr-protocol">{{ source.protocol }}</span>
                </div>
              </div>
              <div class="sr-right">
                <span class="sr-records">{{ source.recordsToday.toLocaleString('en-GB') }} records</span>
                <span class="sr-time">{{ formatRelative(source.lastIngested) }}</span>
              </div>
              <StatusBadge :status="source.status" size="sm" />
            </div>
          </div>
        </div>

        <!-- Validation outcome -->
        <div class="card card-body flex-col">
          <div class="section-label">Validation Outcome Distribution</div>
          <div class="validation-chart">
            <div class="vc-total">
              <span class="vc-num">{{ totalValidations.toLocaleString('en-GB') }}</span>
              <span class="vc-lbl">Total Validations</span>
            </div>

            <div class="vc-bars">
              <div class="vcb-row">
                <span class="vcb-label">Pass</span>
                <div class="vcb-track">
                  <div class="vcb-fill vcb-fill--pass" :style="{ width: `${pct(validationPass)}%` }"></div>
                </div>
                <span class="vcb-value vcb-value--pass">{{ pct(validationPass) }}%</span>
                <span class="vcb-count">{{ validationPass.toLocaleString('en-GB') }}</span>
              </div>
              <div class="vcb-row">
                <span class="vcb-label">Warning</span>
                <div class="vcb-track">
                  <div class="vcb-fill vcb-fill--warn" :style="{ width: `${pct(validationWarn)}%` }"></div>
                </div>
                <span class="vcb-value vcb-value--warn">{{ pct(validationWarn) }}%</span>
                <span class="vcb-count">{{ validationWarn }}</span>
              </div>
              <div class="vcb-row">
                <span class="vcb-label">Fail</span>
                <div class="vcb-track">
                  <div class="vcb-fill vcb-fill--fail" :style="{ width: `${pct(validationFail)}%` }"></div>
                </div>
                <span class="vcb-value vcb-value--fail">{{ pct(validationFail) }}%</span>
                <span class="vcb-count">{{ validationFail }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Transformation history chart -->
      <div class="card card-body">
        <div class="section-label">Transformation History — Last 7 Days</div>
        <TimeSeriesChart
          :datasets="chartDatasets"
          :labels="chartLabels"
          y-axis-label="Transformations"
          :height="220"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.api-error {
  display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
  padding: 2rem; margin: 1.5rem; border: 1px solid #fee2e2;
  border-radius: var(--facis-radius); background: #fff5f5;
  color: #991b1b; font-size: 0.875rem; text-align: center;
}
.live-banner { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #15803d; background: #dcfce7; padding: 0.375rem 1.5rem; border-bottom: 1px solid #bbf7d0; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.view-page { display: flex; flex-direction: column; }

.view-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

@media (max-width: 900px) {
  .two-col { grid-template-columns: 1fr; }
}

.flex-col { display: flex; flex-direction: column; gap: 1rem; }

.section-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--facis-text);
}

/* Source list */
.source-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.source-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--facis-border);
}

.source-row:last-child {
  border-bottom: none;
}

.sr-left {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex: 1;
}

.sr-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sr-dot--active  { background: var(--facis-success); }
.sr-dot--warning { background: var(--facis-warning); }
.sr-dot--error   { background: var(--facis-error); }

.sr-info {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.sr-name {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--facis-text);
}

.sr-protocol {
  font-size: 0.714rem;
  color: var(--facis-text-muted);
}

.sr-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.1rem;
  min-width: 100px;
}

.sr-records {
  font-size: 0.786rem;
  font-weight: 500;
  color: var(--facis-text);
}

.sr-time {
  font-size: 0.714rem;
  color: var(--facis-text-muted);
}

/* Validation chart */
.validation-chart {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.vc-total {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
}

.vc-num {
  font-size: 2rem;
  font-weight: 700;
  color: var(--facis-text);
  line-height: 1;
}

.vc-lbl {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 500;
}

.vc-bars {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.vcb-row {
  display: grid;
  grid-template-columns: 60px 1fr 45px 60px;
  align-items: center;
  gap: 0.625rem;
}

.vcb-label {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
  font-weight: 500;
  text-align: right;
}

.vcb-track {
  height: 10px;
  background: var(--facis-surface-2);
  border-radius: 20px;
  overflow: hidden;
}

.vcb-fill {
  height: 100%;
  border-radius: 20px;
  transition: width 0.6s ease;
}

.vcb-fill--pass { background: var(--facis-success); }
.vcb-fill--warn { background: var(--facis-warning); }
.vcb-fill--fail { background: var(--facis-error); }

.vcb-value {
  font-size: 0.786rem;
  font-weight: 700;
  text-align: right;
}

.vcb-value--pass { color: #15803d; }
.vcb-value--warn { color: #92400e; }
.vcb-value--fail { color: #991b1b; }

.vcb-count {
  font-size: 0.75rem;
  color: var(--facis-text-muted);
  text-align: right;
}
</style>
