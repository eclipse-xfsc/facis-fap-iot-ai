<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import DataTablePage from '@/components/common/DataTablePage.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { getMeters, getPVSystems, getStreetlights } from '@/services/api'

const router = useRouter()
const isLive = ref(false)
const error = ref(false)
const liveSourceCount = ref(0)

async function fetchData(): Promise<void> {
  error.value = false
  const [meters, pv, lights] = await Promise.all([getMeters(), getPVSystems(), getStreetlights()])
  if (!meters && !pv && !lights) { error.value = true; return }
  liveSourceCount.value = (meters?.count ?? 0) + (pv?.count ?? 0) + (lights?.count ?? 0)
  isLive.value = liveSourceCount.value > 0
}

onMounted(fetchData)

const STRATEGY_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  deterministic: { color: '#1d4ed8', bg: '#dbeafe', label: 'Deterministic' },
  'ai-driven':   { color: '#7c3aed', bg: '#ede9fe', label: 'AI-Driven' },
  hybrid:        { color: '#0f766e', bg: '#ccfbf1', label: 'Hybrid' }
}

const columns = [
  { field: 'remoteSchema', header: 'Remote Schema', sortable: true },
  { field: 'localSchema', header: 'Local Schema', sortable: true },
  { field: 'strategy', header: 'Strategy', sortable: true },
  { field: 'rulesCount', header: 'Rules', type: 'number' as const, sortable: true, width: '80px' },
  { field: 'validationStatus', header: 'Validation', type: 'status' as const, sortable: true, width: '120px' },
  { field: 'lastUpdated', header: 'Last Updated', type: 'date' as const, sortable: true },
  { field: 'id', header: 'Actions', type: 'actions' as const, sortable: false, width: '100px' }
]

const filters = [
  { label: 'Deterministic', value: 'deterministic', field: 'strategy' },
  { label: 'AI-Driven', value: 'ai-driven', field: 'strategy' },
  { label: 'Hybrid', value: 'hybrid', field: 'strategy' },
  { label: 'Valid', value: 'valid', field: 'validationStatus' },
  { label: 'Warning', value: 'warning', field: 'validationStatus' }
]

const mappings = [
  { id: 'map-001', remoteSchema: 'Modbus/EnergyMeter', localSchema: 'EnergyMeterReading_v2', strategy: 'deterministic', rulesCount: 14, validationStatus: 'valid', lastUpdated: new Date(Date.now() - 86_400_000).toISOString() },
  { id: 'map-002', remoteSchema: 'DALI/ZoneController', localSchema: 'DALILightingZoneStatus_v1', strategy: 'deterministic', rulesCount: 10, validationStatus: 'valid', lastUpdated: new Date(Date.now() - 172_800_000).toISOString() },
  { id: 'map-003', remoteSchema: 'SunSpec/Inverter', localSchema: 'SunSpecPVInverter_v1', strategy: 'ai-driven', rulesCount: 9, validationStatus: 'warning', lastUpdated: new Date(Date.now() - 259_200_000).toISOString() },
  { id: 'map-004', remoteSchema: 'REST/TrafficFlow', localSchema: 'TrafficFlowIndex_v1', strategy: 'hybrid', rulesCount: 6, validationStatus: 'valid', lastUpdated: new Date(Date.now() - 86_400_000).toISOString() }
]

const stats = computed(() => ({
  total: mappings.length,
  valid: mappings.filter(m => m.validationStatus === 'valid').length,
  warning: mappings.filter(m => m.validationStatus === 'warning').length,
  aiDriven: mappings.filter(m => m.strategy === 'ai-driven').length
}))

function navigateToDetail(row: Record<string, unknown>): void {
  router.push(`/schemas/mappings/${row['id']}`)
}
</script>

<template>
  <div class="view-page">
    <div v-if="error" class="api-error">
      <i class="pi pi-exclamation-circle"></i>
      <p>Could not load data from simulation API</p>
      <Button label="Retry" size="small" @click="fetchData()" />
    </div>
    <div v-else-if="isLive" class="live-banner">
      <span class="live-dot"></span> Live — {{ liveSourceCount }} active data sources mapped through these transformation rules
    </div>
    <PageHeader
      title="Schema Mappings"
      subtitle="Transformation rules between external and canonical schemas"
      :breadcrumbs="[{ label: 'Schema & Mapping' }, { label: 'Mappings' }]"
    >
      <template #actions>
        <Button label="New Mapping" icon="pi pi-plus" size="small" />
      </template>
    </PageHeader>

    <div class="view-body">
      <!-- Summary tiles -->
      <div class="mapping-stats-row">
        <div class="msr-tile">
          <span class="msr-value">{{ stats.total }}</span>
          <span class="msr-label">Total Mappings</span>
        </div>
        <div class="msr-divider"></div>
        <div class="msr-tile">
          <span class="msr-value msr-value--green">{{ stats.valid }}</span>
          <span class="msr-label">Valid</span>
        </div>
        <div class="msr-divider"></div>
        <div class="msr-tile">
          <span class="msr-value msr-value--orange">{{ stats.warning }}</span>
          <span class="msr-label">Warnings</span>
        </div>
        <div class="msr-divider"></div>
        <div class="msr-tile">
          <span class="msr-value msr-value--purple">{{ stats.aiDriven }}</span>
          <span class="msr-label">AI-Driven</span>
        </div>
      </div>

      <!-- Strategy legend -->
      <div class="strategy-legend">
        <span class="sl-label">Strategy types:</span>
        <span
          v-for="(cfg, key) in STRATEGY_CONFIG"
          :key="key"
          class="strategy-badge"
          :style="{ background: cfg.bg, color: cfg.color }"
        >{{ cfg.label }}</span>
      </div>

      <DataTablePage
        title="Mapping Registry"
        subtitle="Click any row to view full transformation detail and sample payload compare"
        :columns="columns"
        :data="mappings as unknown as Record<string, unknown>[]"
        :search-fields="['remoteSchema', 'localSchema', 'strategy']"
        :filters="filters"
        empty-icon="pi-arrows-h"
        empty-title="No mappings configured"
        @row-select="navigateToDetail"
      >
        <template #actions="{ row }">
          <Button
            icon="pi pi-eye"
            text
            size="small"
            v-tooltip.top="'View Detail'"
            @click.stop="navigateToDetail(row)"
          />
          <Button
            icon="pi pi-check-circle"
            text
            size="small"
            v-tooltip.top="'Re-validate'"
          />
        </template>
      </DataTablePage>
    </div>
  </div>
</template>

<style scoped>
.live-banner { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #15803d; background: #dcfce7; padding: 0.375rem 1.5rem; border-bottom: 1px solid #bbf7d0; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.view-page { display: flex; flex-direction: column; }

.view-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.mapping-stats-row {
  display: flex;
  align-items: center;
  gap: 0;
  background: var(--facis-surface);
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  box-shadow: var(--facis-shadow);
  padding: 1rem 1.5rem;
  width: fit-content;
}

.msr-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
  padding: 0 1.5rem;
}

.msr-divider {
  width: 1px;
  height: 36px;
  background: var(--facis-border);
  flex-shrink: 0;
}

.msr-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--facis-text);
  line-height: 1;
}

.msr-value--green  { color: var(--facis-success); }
.msr-value--orange { color: var(--facis-warning); }
.msr-value--purple { color: #7c3aed; }

.msr-label {
  font-size: 0.714rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--facis-text-secondary);
  font-weight: 500;
}

.strategy-legend {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex-wrap: wrap;
}

.sl-label {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
}

.strategy-badge {
  font-size: 0.714rem;
  font-weight: 600;
  padding: 0.2rem 0.625rem;
  border-radius: 20px;
}
.api-error {
  display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
  padding: 2rem; margin: 1.5rem; border: 1px solid #fee2e2;
  border-radius: var(--facis-radius); background: #fff5f5;
  color: #991b1b; font-size: 0.875rem; text-align: center;
}
</style>
