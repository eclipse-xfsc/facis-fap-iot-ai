<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import DataTablePage from '@/components/common/DataTablePage.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { getMeters, getPVSystems, getStreetlights } from '@/services/api'

const isLive = ref(false)
const error = ref(false)
const meterCount = ref(0)
const pvCount = ref(0)
const lightCount = ref(0)

async function fetchData(): Promise<void> {
  error.value = false
  const [meters, pv, lights] = await Promise.all([getMeters(), getPVSystems(), getStreetlights()])
  if (!meters && !pv && !lights) { error.value = true; return }
  meterCount.value = meters?.count ?? 0
  pvCount.value = pv?.count ?? 0
  lightCount.value = lights?.count ?? 0
  isLive.value = meterCount.value > 0 || pvCount.value > 0 || lightCount.value > 0
}

onMounted(fetchData)

// Static schema definitions — metadata not available from API
const schemas = computed(() => [
  { id: 'sch-001', name: 'EnergyMeterReading_v2', useCase: 'Smart Energy', version: '2.1.0', status: 'active', validationLevel: 'full', format: 'json', fieldsCount: 13, liveSourceCount: meterCount.value, lastUpdated: new Date(Date.now() - 86_400_000).toISOString() },
  { id: 'sch-002', name: 'DALILightingZoneStatus_v1', useCase: 'Smart City', version: '1.0.1', status: 'active', validationLevel: 'full', format: 'json', fieldsCount: 9, liveSourceCount: lightCount.value, lastUpdated: new Date(Date.now() - 172_800_000).toISOString() },
  { id: 'sch-003', name: 'SunSpecPVInverter_v1', useCase: 'Smart Energy', version: '1.3.0', status: 'active', validationLevel: 'partial', format: 'json', fieldsCount: 8, liveSourceCount: pvCount.value, lastUpdated: new Date(Date.now() - 259_200_000).toISOString() },
  { id: 'sch-004', name: 'WeatherObservation_v1', useCase: 'Smart Energy', version: '1.0.0', status: 'active', validationLevel: 'full', format: 'json', fieldsCount: 7, liveSourceCount: null, lastUpdated: new Date(Date.now() - 86_400_000).toISOString() },
  { id: 'sch-005', name: 'TrafficFlowIndex_v1', useCase: 'Smart City', version: '1.1.0', status: 'draft', validationLevel: 'partial', format: 'json', fieldsCount: 4, liveSourceCount: null, lastUpdated: new Date(Date.now() - 604_800_000).toISOString() },
  { id: 'sch-006', name: 'CityEventRecord_v1', useCase: 'Smart City', version: '0.9.0', status: 'deprecated', validationLevel: 'none', format: 'json', fieldsCount: 3, liveSourceCount: null, lastUpdated: new Date(Date.now() - 7_776_000_000).toISOString() }
])

const columns = [
  { field: 'name', header: 'Schema Name', sortable: true },
  { field: 'useCase', header: 'Use Case', sortable: true },
  { field: 'version', header: 'Version', sortable: true, width: '110px' },
  { field: 'status', header: 'Status', type: 'status' as const, sortable: true, width: '110px' },
  { field: 'validationLevel', header: 'Validation', sortable: true, width: '120px' },
  { field: 'format', header: 'Format', sortable: true, width: '90px' },
  { field: 'fieldsCount', header: 'Fields', type: 'number' as const, sortable: true, width: '80px' },
  { field: 'lastUpdated', header: 'Last Updated', type: 'date' as const, sortable: true },
  { field: 'id', header: 'Actions', type: 'actions' as const, sortable: false, width: '100px' }
]

const filters = [
  { label: 'Active', value: 'active', field: 'status' },
  { label: 'Draft', value: 'draft', field: 'status' },
  { label: 'Deprecated', value: 'deprecated', field: 'status' },
  { label: 'Smart Energy', value: 'Smart Energy', field: 'useCase' },
  { label: 'Smart City', value: 'Smart City', field: 'useCase' }
]

const VALIDATION_COLORS: Record<string, string> = {
  full: '#15803d',
  partial: '#92400e',
  none: '#94a3b8'
}

function validationBg(level: string): string {
  const map: Record<string, string> = { full: '#dcfce7', partial: '#fef3c7', none: '#f1f5f9' }
  return map[level] ?? '#f1f5f9'
}

function formatBadge(format: string): string {
  return format.toUpperCase()
}

const FORMAT_COLORS: Record<string, string> = {
  json: '#3b82f6',
  avro: '#8b5cf6',
  protobuf: '#f97316'
}

const stats = computed(() => ({
  active: schemas.value.filter((s: { status: string }) => s.status === 'active').length,
  draft: schemas.value.filter((s: { status: string }) => s.status === 'draft').length,
  deprecated: schemas.value.filter((s: { status: string }) => s.status === 'deprecated').length
}))
</script>

<template>
  <div class="view-page">
    <div v-if="error" class="api-error">
      <i class="pi pi-exclamation-circle"></i>
      <p>Could not load data from simulation API</p>
      <Button label="Retry" size="small" @click="fetchData()" />
    </div>
    <div v-else-if="isLive" class="live-banner">
      <span class="live-dot"></span> Computed from live data — source counts derived from simulation API
    </div>
    <PageHeader
      title="Local Schemas"
      subtitle="Platform-managed canonical schemas for harmonised data representation"
      :breadcrumbs="[{ label: 'Schema & Mapping' }, { label: 'Local Schemas' }]"
    >
      <template #actions>
        <Button label="New Schema" icon="pi pi-plus" size="small" />
      </template>
    </PageHeader>

    <div class="view-body">
      <!-- Summary row -->
      <div class="schema-summary">
        <div class="ss-pill ss-pill--active">
          <i class="pi pi-check-circle"></i>
          <span>{{ stats.active }} Active</span>
        </div>
        <div class="ss-pill ss-pill--draft">
          <i class="pi pi-pencil"></i>
          <span>{{ stats.draft }} Draft</span>
        </div>
        <div class="ss-pill ss-pill--deprecated">
          <i class="pi pi-history"></i>
          <span>{{ stats.deprecated }} Deprecated</span>
        </div>
      </div>

      <DataTablePage
        title="Canonical Schema Registry"
        subtitle="All local schemas — click a row to view details"
        :columns="columns"
        :data="schemas as unknown as Record<string, unknown>[]"
        :filters="filters"
        :search-fields="['name', 'useCase', 'version']"
        empty-icon="pi-file"
        empty-title="No schemas found"
      >
        <template #actions>
          <Button icon="pi pi-eye" text size="small" v-tooltip.top="'View Schema'" />
          <Button icon="pi pi-download" text size="small" v-tooltip.top="'Download'" />
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
  gap: 1rem;
}

.schema-summary {
  display: flex;
  gap: 0.625rem;
  flex-wrap: wrap;
}

.ss-pill {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.786rem;
  font-weight: 600;
  padding: 0.35rem 0.875rem;
  border-radius: 20px;
}

.ss-pill--active     { background: var(--facis-success-light); color: #15803d; }
.ss-pill--draft      { background: var(--facis-warning-light); color: #92400e; }
.ss-pill--deprecated { background: var(--facis-surface-2); color: var(--facis-text-secondary); border: 1px solid var(--facis-border); }
.api-error {
  display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
  padding: 2rem; margin: 1.5rem; border: 1px solid #fee2e2;
  border-radius: var(--facis-radius); background: #fff5f5;
  color: #991b1b; font-size: 0.875rem; text-align: center;
}
</style>
