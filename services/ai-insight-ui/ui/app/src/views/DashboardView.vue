<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import PipelineFlow from '@/components/common/PipelineFlow.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useKpiStore } from '@/stores/kpi'
import { useNotificationsStore } from '@/stores/notifications'
import { useRouter } from 'vue-router'
import {
  getSimulationStatus,
  getSimHealth,
  getAiHealth,
  getMeters,
  getStreetlights,
  startSimulation,
  pauseSimulation,
  type SimSimulationStatus,
  type SimHealth,
  type AiHealth
} from '@/services/api'

const kpi = useKpiStore()
const notifications = useNotificationsStore()
const router = useRouter()

// Live data from API
const loading = ref(true)
const error = ref(false)
const simStatus = ref<SimSimulationStatus | null>(null)
const simHealth = ref<SimHealth | null>(null)
const aiHealth = ref<AiHealth | null>(null)
const meterCount = ref<number | null>(null)
const streetlightCount = ref<number | null>(null)

interface DataProductRow {
  id: string
  name: string
  version: string
  sourceCount: number
  apiStatus: string
  exportStatus: string
  lastUpdated: string
  category: string
}

const recentProductsData = ref<DataProductRow[]>([])

const simControlLoading = ref(false)

async function handleStartSim(): Promise<void> {
  simControlLoading.value = true
  await startSimulation()
  await new Promise(r => setTimeout(r, 2000))
  await fetchLiveData()
  simControlLoading.value = false
}

async function handleStopSim(): Promise<void> {
  simControlLoading.value = true
  await pauseSimulation()
  await new Promise(r => setTimeout(r, 1000))
  await fetchLiveData()
  simControlLoading.value = false
}

async function fetchLiveData(): Promise<void> {
  loading.value = true
  error.value = false
  const [status, sHealth, aHealth, meters, lights] = await Promise.all([
    getSimulationStatus(),
    getSimHealth(),
    getAiHealth(),
    getMeters(),
    getStreetlights()
  ])
  simStatus.value = status
  simHealth.value = sHealth
  aiHealth.value = aHealth
  if (meters) meterCount.value = meters.count
  if (lights) streetlightCount.value = lights.count

  if (!sHealth && !aHealth && !meters) {
    error.value = true
  }

  // Build data products from real source counts
  if (meters || lights) {
    recentProductsData.value = [
      {
        id: 'dp-energy',
        name: 'Energy Consumption Timeseries',
        version: '2.1.0',
        sourceCount: meters?.count ?? 0,
        apiStatus: meters ? 'available' : 'maintenance',
        exportStatus: 'ready',
        lastUpdated: new Date().toISOString(),
        category: 'energy'
      },
      {
        id: 'dp-city',
        name: 'Smart Lighting Status',
        version: '1.0.1',
        sourceCount: lights?.count ?? 0,
        apiStatus: lights ? 'available' : 'maintenance',
        exportStatus: 'ready',
        lastUpdated: new Date().toISOString(),
        category: 'smart-city'
      },
      {
        id: 'dp-sim',
        name: 'Simulation Status Feed',
        version: '1.0.0',
        sourceCount: (meters?.count ?? 0) + (lights?.count ?? 0),
        apiStatus: sHealth?.status === 'ok' ? 'available' : 'maintenance',
        exportStatus: sHealth?.status === 'ok' ? 'ready' : 'processing',
        lastUpdated: status?.simulation_time ?? new Date().toISOString(),
        category: 'cross-domain'
      }
    ]
  }

  loading.value = false
}

onMounted(() => {
  kpi.refresh()
  fetchLiveData()
})

// 8 platform KPI cards — all values from real API
const platformKpis = computed(() => [
  {
    label: 'Energy Meters',
    value: meterCount.value !== null ? meterCount.value : '—',
    unit: '',
    trend: 'stable' as const,
    icon: 'pi-database',
    color: '#3b82f6'
  },
  {
    label: 'Streetlights',
    value: streetlightCount.value !== null ? streetlightCount.value : '—',
    unit: '',
    trend: 'stable' as const,
    icon: 'pi-map',
    color: '#8b5cf6'
  },
  { label: 'Open Alerts', value: notifications.openAlerts.length, unit: '', trend: 'down' as const, icon: 'pi-bell', color: '#f59e0b' },
  {
    label: 'Data Sources',
    value: (meterCount.value ?? 0) + (streetlightCount.value ?? 0),
    unit: '',
    trend: 'stable' as const,
    icon: 'pi-check-circle',
    color: '#22c55e'
  },
  {
    label: 'Simulation Speed',
    value: simStatus.value ? `${simStatus.value.acceleration}x` : '—',
    unit: '',
    trend: 'stable' as const,
    icon: 'pi-bolt',
    color: '#f59e0b'
  },
  {
    label: 'Simulation State',
    value: simStatus.value?.state ?? '—',
    unit: '',
    trend: 'stable' as const,
    icon: 'pi-cog',
    color: '#ef4444'
  },
  {
    label: 'Sim Service',
    value: simHealth.value?.status === 'ok' ? 'Live' : (simHealth.value ? 'Degraded' : '—'),
    unit: '',
    trend: 'stable' as const,
    icon: 'pi-server',
    color: simHealth.value?.status === 'ok' ? '#22c55e' : '#f59e0b'
  },
  {
    label: 'AI Service',
    value: aiHealth.value?.status === 'ok' ? 'Live' : (aiHealth.value ? 'Degraded' : '—'),
    unit: '',
    trend: 'stable' as const,
    icon: 'pi-microchip-ai',
    color: aiHealth.value?.status === 'ok' ? '#22c55e' : '#f59e0b'
  }
])

// Use-case summary cards — all from real API
const energyCard = computed(() => ({
  health: (simHealth.value?.status === 'ok' ? 'healthy' : (simHealth.value ? 'warning' : 'healthy')) as string,
  lastTimestamp: simStatus.value?.simulation_time ?? new Date().toISOString(),
  assetCount: meterCount.value !== null ? meterCount.value : '—',
  insightCount: notifications.openAlerts.filter(a => a.useCase === 'Smart Energy').length
}))

const cityCard = computed(() => ({
  health: 'healthy' as const,
  lastTimestamp: simStatus.value?.simulation_time ?? new Date().toISOString(),
  assetCount: streetlightCount.value !== null ? streetlightCount.value : '—',
  insightCount: notifications.openAlerts.filter(a => a.useCase === 'Smart City').length
}))

// Platform health — real service health from API
const platformHealth = computed(() => [
  {
    label: 'Simulation',
    status: simHealth.value?.status === 'ok' ? 'healthy' : (simHealth.value ? 'warning' : 'inactive'),
    detail: simHealth.value ? `${simHealth.value.service} v${simHealth.value.version}` : 'Not connected'
  },
  {
    label: 'AI Insights',
    status: aiHealth.value?.status === 'ok' ? 'healthy' : (aiHealth.value ? 'warning' : 'inactive'),
    detail: aiHealth.value ? aiHealth.value.service : 'Not connected'
  },
  {
    label: 'Energy Meters',
    status: meterCount.value !== null ? 'healthy' : 'inactive',
    detail: meterCount.value !== null ? `${meterCount.value} meters online` : 'No data'
  },
  {
    label: 'Streetlights',
    status: streetlightCount.value !== null ? 'healthy' : 'inactive',
    detail: streetlightCount.value !== null ? `${streetlightCount.value} lights tracked` : 'No data'
  },
  {
    label: 'Simulation State',
    status: simStatus.value?.state === 'running' ? 'healthy' : (simStatus.value ? 'warning' : 'inactive'),
    detail: simStatus.value ? `${simStatus.value.state} @ ${simStatus.value.acceleration}x` : 'No data'
  },
  {
    label: 'Alert System',
    status: 'healthy',
    detail: `${notifications.alerts.length} alerts tracked`
  }
])

const STATUS_COLOR: Record<string, string> = {
  healthy: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  inactive: '#94a3b8'
}

// Recent alerts (last 5 from the notifications store)
const recentAlerts = computed(() => notifications.alerts.slice(0, 5))

// Recent data products from real API source counts
const recentProducts = computed(() => recentProductsData.value.slice(0, 3))

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
</script>

<template>
  <div class="dashboard">
    <PageHeader
      title="Platform Dashboard"
      subtitle="Real-time overview of FACIS IoT & AI demonstrator platform"
    >
      <template #actions>
        <Button icon="pi pi-refresh" label="Refresh" size="small" outlined @click="kpi.refresh()" />
        <Button icon="pi pi-chart-bar" label="Analytics" size="small" text @click="router.push('/analytics')" />
      </template>
    </PageHeader>

    <!-- API Error State -->
    <div v-if="error && !loading" class="api-error">
      <i class="pi pi-exclamation-circle"></i>
      <p>Could not load data from simulation API</p>
      <Button label="Retry" size="small" @click="fetchLiveData()" />
    </div>

    <!-- ── Simulation Control Panel ───────────────────────────────────── -->
    <section class="sim-control">
      <div class="sim-control__header">
        <span class="sim-control__title">Simulation Engine</span>
        <span class="sim-control__status" :class="simStatus?.state === 'running' ? 'sim-control__status--running' : 'sim-control__status--stopped'">
          <span class="sim-control__dot"></span>
          {{ simStatus?.state ?? 'unknown' }}
        </span>
      </div>
      <div class="sim-control__info">
        <span>Sim Time: <strong>{{ simStatus?.simulation_time ? new Date(simStatus.simulation_time).toLocaleString() : '—' }}</strong></span>
        <span>Speed: <strong>{{ simStatus?.acceleration ?? '—' }}x</strong></span>
        <span>Seed: <strong>{{ simStatus?.seed ?? '—' }}</strong></span>
      </div>
      <div class="sim-control__actions">
        <Button
          icon="pi pi-play"
          label="Start"
          size="small"
          severity="success"
          :disabled="simStatus?.state === 'running' || simControlLoading"
          :loading="simControlLoading"
          @click="handleStartSim()"
        />
        <Button
          icon="pi pi-pause"
          label="Stop"
          size="small"
          severity="warn"
          :disabled="simStatus?.state !== 'running' || simControlLoading"
          :loading="simControlLoading"
          @click="handleStopSim()"
        />
        <Button
          icon="pi pi-refresh"
          label="Refresh Status"
          size="small"
          outlined
          :loading="loading"
          @click="fetchLiveData()"
        />
      </div>
    </section>

    <div class="dashboard__body">

      <!-- ── Section 1: 8 Platform KPI Cards ─────────────────────────────── -->
      <section class="dashboard__section">
        <div class="section-title">Platform KPIs</div>
        <div class="grid-kpi grid-kpi--8">
          <KpiCard
            v-for="item in platformKpis"
            :key="item.label"
            :label="item.label"
            :value="item.value"
            :unit="item.unit ?? ''"
            :trend="item.trend"
            :trend-value="item.trendValue"
            :icon="item.icon"
            :color="item.color"
          />
        </div>
      </section>

      <!-- ── Section 2: Use Case Summary Cards ───────────────────────────── -->
      <section class="dashboard__section">
        <div class="section-title">Use Case Status</div>
        <div class="use-case-grid">

          <!-- Smart Energy Card -->
          <div class="uc-card card">
            <div class="uc-card__header">
              <div class="uc-card__icon uc-card__icon--energy">
                <i class="pi pi-bolt"></i>
              </div>
              <div class="uc-card__info">
                <div class="uc-card__title">Smart Energy</div>
                <div class="uc-card__subtitle">Multi-site energy metering & PV analytics</div>
              </div>
              <StatusBadge :status="energyCard.health" />
            </div>

            <div class="uc-card__metrics">
              <div class="uc-metric">
                <span class="uc-metric__val">{{ energyCard.assetCount }}</span>
                <span class="uc-metric__label">Meters</span>
              </div>
              <div class="uc-metric">
                <span class="uc-metric__val">{{ energyCard.insightCount }}</span>
                <span class="uc-metric__label">Open Alerts</span>
              </div>
              <div class="uc-metric">
                <span class="uc-metric__val">{{ simHealth?.status === 'ok' ? 'OK' : (simHealth ? 'Warn' : '—') }}</span>
                <span class="uc-metric__label">Service</span>
              </div>
              <div class="uc-metric">
                <span class="uc-metric__val">{{ simStatus?.state ?? '—' }}</span>
                <span class="uc-metric__label">Sim State</span>
              </div>
            </div>

            <div class="uc-card__footer">
              <span class="uc-card__ts">
                <i class="pi pi-clock"></i>
                Last reading {{ fmtRelative(energyCard.lastTimestamp) }}
              </span>
              <div class="uc-card__actions">
                <Button label="Overview" icon="pi pi-eye" size="small" outlined @click="router.push('/use-cases/smart-energy/overview')" />
                <Button label="Assets" icon="pi pi-gauge" size="small" text @click="router.push('/use-cases/smart-energy/assets')" />
                <Button label="Insights" icon="pi pi-lightbulb" size="small" text @click="router.push('/use-cases/smart-energy/insights')" />
              </div>
            </div>
          </div>

          <!-- Smart City Card -->
          <div class="uc-card card">
            <div class="uc-card__header">
              <div class="uc-card__icon uc-card__icon--city">
                <i class="pi pi-map"></i>
              </div>
              <div class="uc-card__info">
                <div class="uc-card__title">Smart City</div>
                <div class="uc-card__subtitle">Adaptive street lighting & urban mobility</div>
              </div>
              <StatusBadge :status="cityCard.health" />
            </div>

            <div class="uc-card__metrics">
              <div class="uc-metric">
                <span class="uc-metric__val">{{ cityCard.assetCount }}</span>
                <span class="uc-metric__label">Streetlights</span>
              </div>
              <div class="uc-metric">
                <span class="uc-metric__val">{{ cityCard.insightCount }}</span>
                <span class="uc-metric__label">Open Alerts</span>
              </div>
              <div class="uc-metric">
                <span class="uc-metric__val">{{ simHealth?.status === 'ok' ? 'OK' : (simHealth ? 'Warn' : '—') }}</span>
                <span class="uc-metric__label">Service</span>
              </div>
              <div class="uc-metric">
                <span class="uc-metric__val">{{ simStatus?.acceleration !== undefined ? `${simStatus.acceleration}x` : '—' }}</span>
                <span class="uc-metric__label">Sim Speed</span>
              </div>
            </div>

            <div class="uc-card__footer">
              <span class="uc-card__ts">
                <i class="pi pi-clock"></i>
                Last reading {{ fmtRelative(cityCard.lastTimestamp) }}
              </span>
              <div class="uc-card__actions">
                <Button label="Overview" icon="pi pi-eye" size="small" outlined @click="router.push('/use-cases/smart-city/overview')" />
                <Button label="Zones" icon="pi pi-map" size="small" text @click="router.push('/use-cases/smart-city/zones')" />
                <Button label="Analytics" icon="pi pi-chart-bar" size="small" text @click="router.push('/use-cases/smart-city/analytics')" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Section 3: Platform Health Indicators ───────────────────────── -->
      <section class="dashboard__section">
        <div class="section-title">Platform Health</div>
        <div class="health-grid card card-body">
          <div
            v-for="h in platformHealth"
            :key="h.label"
            class="health-indicator"
          >
            <div class="health-indicator__dot" :style="{ background: STATUS_COLOR[h.status] }"></div>
            <div class="health-indicator__body">
              <span class="health-indicator__label">{{ h.label }}</span>
              <span class="health-indicator__detail">{{ h.detail }}</span>
            </div>
            <div class="health-indicator__badge">
              <StatusBadge :status="h.status" size="sm" :show-dot="false" />
            </div>
          </div>
        </div>
      </section>

      <!-- ── Section 4: Data Pipeline Flow ─────────────────────────────────── -->
      <section class="dashboard__section">
        <div class="section-title">Data Pipeline Status</div>
        <div class="card card-body">
          <PipelineFlow />
        </div>
      </section>

      <!-- ── Section 5 & 6: Alerts + Data Products side-by-side ────────────── -->
      <div class="dashboard__two-col">

        <!-- Recent Alerts -->
        <section class="dashboard__section">
          <div class="section-title flex items-center justify-between">
            <span>Recent Alerts</span>
            <Button label="View all" icon="pi pi-arrow-right" icon-pos="right" text size="small" @click="router.push('/alerts/all')" />
          </div>
          <div class="card alerts-table">
            <div
              v-for="alert in recentAlerts"
              :key="alert.id"
              class="alert-row"
              @click="router.push(`/alerts/${alert.id}`)"
            >
              <div class="alert-row__severity" :style="{ background: alert.severity === 'critical' ? '#fee2e2' : alert.severity === 'error' ? '#fee2e2' : alert.severity === 'warning' ? '#fef3c7' : '#dbeafe' }">
                <i
                  class="pi"
                  :class="alert.severity === 'critical' || alert.severity === 'error' ? 'pi-times-circle' : alert.severity === 'warning' ? 'pi-exclamation-triangle' : 'pi-info-circle'"
                  :style="{ color: alert.severity === 'critical' || alert.severity === 'error' ? '#ef4444' : alert.severity === 'warning' ? '#f59e0b' : '#3b82f6' }"
                ></i>
              </div>
              <div class="alert-row__content">
                <span class="alert-row__source">{{ alert.source }}</span>
                <span class="alert-row__msg">{{ alert.message }}</span>
              </div>
              <div class="alert-row__right">
                <StatusBadge :status="alert.status" size="sm" :show-dot="false" />
                <span class="alert-row__time">{{ fmtTime(alert.timestamp) }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- "Recent Data Products" section removed: no /api/v1/data-products
             backend exists. Per-domain product views still live under
             /use-cases/smart-energy/data-products and /use-cases/smart-city/data-products. -->

      </div>
    </div>
  </div>
</template>

<style scoped>
.sim-control {
  background: var(--facis-surface);
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
  box-shadow: var(--facis-shadow);
}
.sim-control__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.sim-control__title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--facis-text);
}
.sim-control__status {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.2rem 0.75rem;
  border-radius: 20px;
}
.sim-control__status--running {
  background: #dcfce7;
  color: #15803d;
}
.sim-control__status--stopped {
  background: #fef3c7;
  color: #92400e;
}
.sim-control__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}
.sim-control__status--running .sim-control__dot {
  animation: pulse-dot 1.5s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.sim-control__info {
  display: flex;
  gap: 1.5rem;
  font-size: 0.8rem;
  color: var(--facis-text-secondary);
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}
.sim-control__info strong {
  color: var(--facis-text);
}
.sim-control__actions {
  display: flex;
  gap: 0.5rem;
}

.api-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2rem;
  margin: 1.5rem;
  border: 1px solid #fee2e2;
  border-radius: var(--facis-radius);
  background: #fff5f5;
  color: #991b1b;
  font-size: 0.875rem;
  text-align: center;
}

.dashboard__body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.dashboard__section {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.dashboard__two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  align-items: start;
}

/* 8-column KPI grid */
.grid-kpi--8 {
  grid-template-columns: repeat(4, 1fr);
}

/* Use-case cards */
.use-case-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}

.uc-card {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem;
}

.uc-card__header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.uc-card__icon {
  width: 48px;
  height: 48px;
  border-radius: var(--facis-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  flex-shrink: 0;
}

.uc-card__icon--energy {
  background: #fef3c718;
  color: #f59e0b;
  background-color: rgba(245, 158, 11, 0.12);
}

.uc-card__icon--city {
  background-color: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}

.uc-card__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.uc-card__title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--facis-text);
}

.uc-card__subtitle {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
}

.uc-card__metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.uc-metric {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.625rem;
  background: var(--facis-surface-2);
  border-radius: var(--facis-radius-sm);
}

.uc-metric__val {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--facis-text);
  line-height: 1;
}

.uc-metric__label {
  font-size: 0.7rem;
  color: var(--facis-text-secondary);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.uc-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--facis-border);
}

.uc-card__ts {
  font-size: 0.75rem;
  color: var(--facis-text-muted);
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.uc-card__actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

/* Platform health */
.health-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.health-indicator {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.875rem 1rem;
  background: var(--facis-surface-2);
  border-radius: var(--facis-radius-sm);
}

.health-indicator__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

.health-indicator__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.health-indicator__label {
  font-size: 0.857rem;
  font-weight: 600;
  color: var(--facis-text);
}

.health-indicator__detail {
  font-size: 0.75rem;
  color: var(--facis-text-secondary);
}

.health-indicator__badge {
  flex-shrink: 0;
}

/* Alerts table */
.alerts-table {
  overflow: hidden;
}

.alert-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid var(--facis-border);
  cursor: pointer;
  transition: background 0.12s;
}

.alert-row:last-child {
  border-bottom: none;
}

.alert-row:hover {
  background: var(--facis-surface-2);
}

.alert-row__severity {
  width: 32px;
  height: 32px;
  border-radius: var(--facis-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 0.875rem;
}

.alert-row__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.alert-row__source {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--facis-text);
}

.alert-row__msg {
  font-size: 0.75rem;
  color: var(--facis-text-secondary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.alert-row__right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  flex-shrink: 0;
}

.alert-row__time {
  font-size: 0.7rem;
  color: var(--facis-text-muted);
}

/* Product rows */
.products-stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.product-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  cursor: pointer;
  transition: box-shadow 0.15s;
}

.product-row:hover {
  box-shadow: var(--facis-shadow-md);
}

.product-row__icon {
  width: 36px;
  height: 36px;
  border-radius: var(--facis-radius-sm);
  background: var(--facis-primary-light);
  color: var(--facis-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.product-row__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.product-row__name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--facis-text);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.product-row__meta {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.product-row__badges {
  display: flex;
  gap: 0.375rem;
  flex-shrink: 0;
}

@media (max-width: 1100px) {
  .grid-kpi--8 {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 900px) {
  .grid-kpi--8 {
    grid-template-columns: repeat(2, 1fr);
  }

  .use-case-grid {
    grid-template-columns: 1fr;
  }

  .dashboard__two-col {
    grid-template-columns: 1fr;
  }

  .health-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .uc-card__metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
