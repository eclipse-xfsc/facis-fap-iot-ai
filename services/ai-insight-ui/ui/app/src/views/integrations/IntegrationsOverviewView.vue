<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import PipelineFlow from '@/components/common/PipelineFlow.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { getSimHealth, getAiHealth, type SimHealth, type AiHealth } from '@/services/api'

const simHealth = ref<SimHealth | null>(null)
const aiHealth = ref<AiHealth | null>(null)
const error = ref(false)

async function fetchHealth(): Promise<void> {
  error.value = false
  const [sh, ah] = await Promise.all([getSimHealth(), getAiHealth()])
  if (!sh && !ah) { error.value = true; return }
  simHealth.value = sh
  aiHealth.value = ah
}

onMounted(fetchHealth)

const simUp = computed(() => simHealth.value?.status === 'ok' || simHealth.value?.status === 'healthy')
const aiUp = computed(() => aiHealth.value?.status === 'ok' || aiHealth.value?.status === 'healthy')

// Build integration list from real health API results
const integrations = computed(() => [
  { id: 'int-sim-rest', name: 'Simulation REST API', protocol: 'REST', direction: 'inbound' as const, status: simUp.value ? 'active' as const : 'error' as const, lastActivity: new Date().toISOString(), errorCount: simUp.value ? 0 : 1 },
  { id: 'int-ai-rest', name: 'AI Analytics Service', protocol: 'REST', direction: 'bidirectional' as const, status: aiUp.value ? 'active' as const : 'error' as const, lastActivity: new Date().toISOString(), errorCount: aiUp.value ? 0 : 1 }
])

const summary = computed(() => ({
  active: integrations.value.filter(i => i.status === 'active').length,
  error: integrations.value.filter(i => i.status === 'error').length,
  inactive: integrations.value.filter(i => i.status === 'inactive').length,
  totalErrors: integrations.value.reduce((a, i) => a + i.errorCount, 0)
}))

const PROTOCOL_COLORS: Record<string, string> = {
  'MQTT 5.0':       '#22c55e',
  'Modbus TCP':     '#f59e0b',
  'REST/XML':       '#3b82f6',
  'WebSocket':      '#8b5cf6',
  'SunSpec/Modbus': '#ef4444',
  'Kafka':          '#0ea5e9',
  'DALI/IP':        '#f97316',
  'Zigbee/MQTT':    '#14b8a6'
}

const DIRECTION_ICONS: Record<string, string> = {
  inbound: 'pi-arrow-down-left',
  outbound: 'pi-arrow-up-right',
  bidirectional: 'pi-arrow-right-arrow-left'
}

const DIRECTION_LABEL: Record<string, string> = {
  inbound: 'Inbound',
  outbound: 'Outbound',
  bidirectional: 'Bidirectional'
}

function protocolColor(protocol: string): string {
  return PROTOCOL_COLORS[protocol] ?? '#64748b'
}

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
}

const simStatus = computed(() => simUp.value ? 'healthy' as const : 'warning' as const)
const aiStatus = computed(() => aiUp.value ? 'healthy' as const : 'warning' as const)

const energySteps = computed(() => [
  { label: 'Source', icon: 'pi-database', status: simStatus.value, detail: simHealth.value ? `v${simHealth.value.version}` : 'MQTT/Modbus' },
  { label: 'Ingestion', icon: 'pi-arrow-right-arrow-left', status: 'healthy' as const, detail: 'Node-RED' },
  { label: 'Harmonization', icon: 'pi-sitemap', status: 'healthy' as const, detail: 'Schema v2' },
  { label: 'Aggregation', icon: 'pi-objects-column', status: 'healthy' as const, detail: '15-min intervals' },
  { label: 'Analytics', icon: 'pi-chart-bar', status: aiStatus.value, detail: aiHealth.value ? aiHealth.value.service : 'AI Service' },
  { label: 'Data Product', icon: 'pi-box', status: 'healthy' as const, detail: 'Published' }
])

const citySteps = [
  { label: 'Source', icon: 'pi-database', status: 'healthy' as const, detail: 'DALI/Zigbee' },
  { label: 'Ingestion', icon: 'pi-arrow-right-arrow-left', status: 'healthy' as const, detail: 'Node-RED' },
  { label: 'Harmonization', icon: 'pi-sitemap', status: 'warning' as const, detail: 'Partial schema' },
  { label: 'Aggregation', icon: 'pi-objects-column', status: 'healthy' as const, detail: 'Zone level' },
  { label: 'Analytics', icon: 'pi-chart-bar', status: 'healthy' as const, detail: 'Running' },
  { label: 'Data Product', icon: 'pi-box', status: 'healthy' as const, detail: 'Published' }
]
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Integrations Overview"
      subtitle="Connected adapters, protocols, and data pipeline health"
      :breadcrumbs="[{ label: 'Integrations' }, { label: 'Overview' }]"
    />

    <div v-if="error" class="api-error">
      <i class="pi pi-exclamation-circle"></i>
      <p>Could not load data from simulation API</p>
      <Button label="Retry" size="small" @click="fetchHealth()" />
    </div>

    <div class="view-body">
      <!-- KPI row -->
      <div class="grid-kpi">
        <KpiCard label="Active Integrations" :value="summary.active" unit="" trend="stable" icon="pi-check-circle" color="#22c55e" />
        <KpiCard label="Errors" :value="summary.error" unit="" trend="stable" icon="pi-times-circle" color="#ef4444" />
        <KpiCard label="Total Error Events" :value="summary.totalErrors" unit="" trend="stable" icon="pi-exclamation-triangle" color="#f59e0b" />
        <KpiCard label="Inactive" :value="summary.inactive" unit="" trend="stable" icon="pi-pause-circle" color="#94a3b8" />
      </div>

      <!-- Integration cards grid -->
      <div class="section-header">
        <h3 class="section-title">Connected Integrations</h3>
      </div>
      <div class="integrations-grid">
        <div
          v-for="integration in integrations"
          :key="integration.id"
          class="integration-card"
          :class="`integration-card--${integration.status}`"
        >
          <div class="integration-card__header">
            <div class="integration-card__protocol-badge" :style="{ background: `${protocolColor(integration.protocol)}18`, color: protocolColor(integration.protocol) }">
              {{ integration.protocol }}
            </div>
            <StatusBadge :status="integration.status" size="sm" />
          </div>

          <div class="integration-card__name">{{ integration.name }}</div>

          <div class="integration-card__meta">
            <div class="integration-card__direction">
              <i :class="`pi ${DIRECTION_ICONS[integration.direction]}`"></i>
              <span>{{ DIRECTION_LABEL[integration.direction] }}</span>
            </div>
            <div class="integration-card__activity">
              <i class="pi pi-clock"></i>
              <span>{{ formatRelative(integration.lastActivity) }}</span>
            </div>
          </div>

          <div v-if="integration.errorCount > 0" class="integration-card__errors">
            <i class="pi pi-exclamation-triangle"></i>
            {{ integration.errorCount }} error{{ integration.errorCount !== 1 ? 's' : '' }}
          </div>
        </div>
      </div>

      <!-- Pipeline summary -->
      <div class="card card-body">
        <div class="pipeline-section-title">Smart Energy Pipeline</div>
        <PipelineFlow :steps="energySteps" />
      </div>

      <div class="card card-body">
        <div class="pipeline-section-title">Smart City Pipeline</div>
        <PipelineFlow :steps="citySteps" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-page { display: flex; flex-direction: column; }

.view-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section-header {
  margin-bottom: -0.5rem;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--facis-text);
}

.integrations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}

.integration-card {
  background: var(--facis-surface);
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  box-shadow: var(--facis-shadow);
  padding: 1.125rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  transition: box-shadow 0.15s;
}

.integration-card:hover {
  box-shadow: var(--facis-shadow-md);
}

.integration-card--error {
  border-left: 3px solid var(--facis-error);
}

.integration-card--active {
  border-left: 3px solid var(--facis-success);
}

.integration-card--inactive {
  border-left: 3px solid var(--facis-text-muted);
}

.integration-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.integration-card__protocol-badge {
  font-size: 0.714rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 20px;
  white-space: nowrap;
}

.integration-card__name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--facis-text);
  line-height: 1.3;
}

.integration-card__meta {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.integration-card__direction,
.integration-card__activity {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
}

.integration-card__direction i,
.integration-card__activity i {
  font-size: 0.75rem;
  color: var(--facis-text-muted);
}

.integration-card__errors {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--facis-error);
  background: var(--facis-error-light);
  padding: 0.25rem 0.625rem;
  border-radius: 20px;
  width: fit-content;
}

.pipeline-section-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--facis-text);
  margin-bottom: 1rem;
}
.api-error {
  display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
  padding: 2rem; margin: 1.5rem; border: 1px solid #fee2e2;
  border-radius: var(--facis-radius); background: #fff5f5;
  color: #991b1b; font-size: 0.875rem; text-align: center;
}
</style>
