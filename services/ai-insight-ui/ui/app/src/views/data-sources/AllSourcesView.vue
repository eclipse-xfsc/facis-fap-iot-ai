<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import DataTablePage from '@/components/common/DataTablePage.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import type { DataSource } from '@/data/types'
import {
  getMeters,
  getMeterCurrent,
  getPVSystems,
  getPVCurrent,
  getWeatherStations,
  getWeatherCurrent,
  getLoads,
  getLoadCurrent
} from '@/services/api'

const loading = ref(true)
const error = ref(false)
const apiAvailable = ref(false)
const sources = ref<DataSource[]>([])

async function fetchData(): Promise<void> {
  loading.value = true
  error.value = false
  const [metersResp, pvResp, weatherResp, loadsResp] = await Promise.all([
      getMeters(),
      getPVSystems(),
      getWeatherStations(),
      getLoads()
  ])

  if (!metersResp && !pvResp && !weatherResp && !loadsResp) {
    error.value = true
    loading.value = false
    return
  }

  const built: DataSource[] = []

  if (metersResp?.meters?.length) {
      // Fetch current readings in parallel
      const currs = await Promise.all(metersResp.meters.map(m => getMeterCurrent(m.meter_id)))
      for (let i = 0; i < metersResp.meters.length; i++) {
        const m = metersResp.meters[i]
        const cur = currs[i]
        built.push({
          id: m.meter_id,
          name: `${m.type} — ${m.meter_id}`,
          useCase: 'energy',
          sourceType: 'Smart Meter',
          protocol: 'Simulation REST',
          objectRef: `/api/v1/meters/${m.meter_id}`,
          lastTimestamp: cur?.timestamp ?? new Date().toISOString(),
          status: 'healthy',
          qualityIndicator: 99.0,
          siteId: 'simulation'
        })
      }
    }

    if (pvResp?.systems?.length) {
      const pvCurrs = await Promise.all(pvResp.systems.map(s => getPVCurrent(s.system_id)))
      for (let i = 0; i < pvResp.systems.length; i++) {
        const s = pvResp.systems[i]
        const cur = pvCurrs[i]
        built.push({
          id: s.system_id,
          name: `PV System — ${s.system_id}`,
          useCase: 'energy',
          sourceType: 'PV Inverter',
          protocol: 'Simulation REST',
          objectRef: `/api/v1/pv/${s.system_id}`,
          lastTimestamp: cur?.timestamp ?? new Date().toISOString(),
          status: 'healthy',
          qualityIndicator: 99.0,
          siteId: 'simulation'
        })
      }
    }

    if (weatherResp?.stations?.length) {
      const wCurrs = await Promise.all(weatherResp.stations.map(st => getWeatherCurrent(st.station_id)))
      for (let i = 0; i < weatherResp.stations.length; i++) {
        const st = weatherResp.stations[i]
        const cur = wCurrs[i]
        built.push({
          id: st.station_id,
          name: `Weather Station — ${st.station_id}`,
          useCase: 'energy',
          sourceType: 'Weather Sensor',
          protocol: 'Simulation REST',
          objectRef: `/api/v1/weather/${st.station_id}`,
          lastTimestamp: cur?.timestamp ?? new Date().toISOString(),
          status: 'healthy',
          qualityIndicator: 98.0,
          siteId: 'simulation'
        })
      }
    }

    if (loadsResp?.devices?.length) {
      const lCurrs = await Promise.all(loadsResp.devices.map(d => getLoadCurrent(d.device_id)))
      for (let i = 0; i < loadsResp.devices.length; i++) {
        const d = loadsResp.devices[i]
        const cur = lCurrs[i]
        built.push({
          id: d.device_id,
          name: `${d.device_type} — ${d.device_id}`,
          useCase: 'energy',
          sourceType: 'Flexible Load',
          protocol: 'Simulation REST',
          objectRef: `/api/v1/loads/${d.device_id}`,
          lastTimestamp: cur?.timestamp ?? new Date().toISOString(),
          status: cur?.state === 'off' ? 'warning' : 'healthy',
          qualityIndicator: 97.0,
          siteId: 'simulation'
        })
      }
    }

  if (built.length > 0) apiAvailable.value = true
  sources.value = built
  loading.value = false
}

onMounted(fetchData)

const selectedSource = ref<DataSource | null>(null)
const showDetail = ref(false)

const columns = [
  { field: 'id', header: 'Source ID', sortable: true, width: '130px' },
  { field: 'name', header: 'Name', sortable: true },
  { field: 'useCase', header: 'Use Case', sortable: true, width: '120px' },
  { field: 'sourceType', header: 'Type', sortable: true, width: '180px' },
  { field: 'protocol', header: 'Protocol', sortable: true, width: '160px' },
  { field: 'objectRef', header: 'Object Ref', sortable: false },
  { field: 'lastTimestamp', header: 'Last Seen', type: 'date' as const, sortable: true, width: '160px' },
  { field: 'status', header: 'Status', type: 'status' as const, sortable: true, width: '110px' },
  { field: 'qualityIndicator', header: 'Quality (%)', type: 'number' as const, sortable: true, width: '110px' },
  { field: 'actions', header: '', type: 'actions' as const, sortable: false, width: '80px' }
]

const filters = [
  { label: 'Energy', value: 'energy', field: 'useCase' },
  { label: 'Smart City', value: 'smart-city', field: 'useCase' },
  { label: 'MQTT', value: 'MQTT/JSON', field: 'protocol' },
  { label: 'Modbus', value: 'Modbus TCP', field: 'protocol' },
  { label: 'Healthy', value: 'healthy', field: 'status' },
  { label: 'Warning', value: 'warning', field: 'status' },
  { label: 'Error', value: 'error', field: 'status' }
]

function openDetail(row: Record<string, unknown>): void {
  selectedSource.value = row as unknown as DataSource
  showDetail.value = true
}

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
  } catch {
    return ts
  }
}

function qualityColor(q: number): string {
  if (q >= 95) return 'var(--facis-success)'
  if (q >= 80) return 'var(--facis-warning)'
  return 'var(--facis-error)'
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="All Data Sources"
      subtitle="All connected and registered data sources across use cases"
      :breadcrumbs="[{ label: 'Data Sources' }, { label: 'All Sources' }]"
    >
      <template #actions>
        <Button icon="pi pi-refresh" size="small" text :loading="loading" @click="fetchData()" />
      </template>
    </PageHeader>

    <!-- API source banner -->
    <div v-if="error && !loading" class="api-error">
      <i class="pi pi-exclamation-circle"></i>
      <p>Could not load data from simulation API</p>
      <Button label="Retry" size="small" @click="fetchData()" />
    </div>
    <div v-else-if="apiAvailable && !loading" class="live-banner">
      <i class="pi pi-circle-fill live-banner__dot"></i>
      Live source list from simulation API
    </div>

    <div class="view-body">
      <DataTablePage
        :title="`${sources.length} registered sources`"
        :subtitle="'Click a row to view source details'"
        :columns="columns"
        :data="sources as unknown as Record<string, unknown>[]"
        :filters="filters"
        :search-fields="['name', 'id', 'protocol', 'sourceType', 'objectRef']"
        empty-icon="pi-database"
        empty-title="No data sources found"
        empty-message="Adjust your filters or search query."
        @row-select="openDetail"
      >
        <template #actions="{ row }">
          <Button
            icon="pi pi-info-circle"
            text
            size="small"
            severity="secondary"
            @click.stop="openDetail(row)"
          />
        </template>
      </DataTablePage>
    </div>

    <!-- Source Detail Dialog -->
    <Dialog
      v-model:visible="showDetail"
      modal
      :header="selectedSource?.name ?? 'Source Detail'"
      :style="{ width: '620px' }"
      :breakpoints="{ '960px': '90vw' }"
    >
      <div v-if="selectedSource" class="detail-body">
        <div class="detail-header-row">
          <StatusBadge :status="selectedSource.status" />
          <span
            class="quality-chip"
            :style="{ color: qualityColor(selectedSource.qualityIndicator), background: qualityColor(selectedSource.qualityIndicator) + '18' }"
          >
            Quality: {{ selectedSource.qualityIndicator.toFixed(1) }}%
          </span>
        </div>

        <div class="detail-grid">
          <div class="detail-row">
            <span class="detail-label">Source ID</span>
            <code class="detail-code">{{ selectedSource.id }}</code>
          </div>
          <div class="detail-row">
            <span class="detail-label">Use Case</span>
            <span>{{ selectedSource.useCase }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Source Type</span>
            <span>{{ selectedSource.sourceType }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Protocol</span>
            <span class="protocol-tag">{{ selectedSource.protocol }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Object Reference</span>
            <code class="detail-code detail-code--break">{{ selectedSource.objectRef }}</code>
          </div>
          <div class="detail-row">
            <span class="detail-label">Site ID</span>
            <span>{{ selectedSource.siteId }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Last Timestamp</span>
            <span>{{ formatDate(selectedSource.lastTimestamp) }}</span>
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Close" outlined size="small" @click="showDetail = false" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; }

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

.api-error {
  display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
  padding: 2rem; margin: 1.5rem; border: 1px solid #fee2e2;
  border-radius: var(--facis-radius); background: #fff5f5;
  color: #991b1b; font-size: 0.875rem; text-align: center;
}

.detail-body { display: flex; flex-direction: column; gap: 1rem; }
.detail-header-row { display: flex; align-items: center; gap: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--facis-border); }
.quality-chip { font-size: 0.75rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 20px; }

.detail-grid { display: flex; flex-direction: column; }
.detail-row { display: flex; align-items: flex-start; gap: 1rem; padding: 0.625rem 0; border-bottom: 1px solid var(--facis-border); }
.detail-row:last-child { border-bottom: none; }
.detail-label { font-size: 0.8rem; font-weight: 500; color: var(--facis-text-secondary); min-width: 150px; padding-top: 0.1rem; }

.protocol-tag { font-size: 0.75rem; font-weight: 600; background: var(--facis-primary-light); color: var(--facis-primary); padding: 0.2rem 0.6rem; border-radius: 4px; }
.detail-code { font-family: var(--facis-font-mono); font-size: 0.8rem; background: var(--facis-surface-2); padding: 0.15rem 0.4rem; border-radius: 4px; color: var(--facis-text); }
.detail-code--break { word-break: break-all; }
</style>
