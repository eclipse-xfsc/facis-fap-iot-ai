<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import DataTablePage from '@/components/common/DataTablePage.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import { getMeters, getMeterCurrent, getLoads, type SimMeter, type SimDevice } from '@/services/api'

const router = useRouter()

const loading = ref(true)
const error = ref(false)

// Merged row type displayed in the table
interface AssetRow {
  meterId: string
  deviceType: string
  site: string
  protocol: string
  lastTimestamp: string
  status: string
  dataQuality: number
  powerKw?: number
}

const assetRows = ref<AssetRow[]>([])

async function fetchData(): Promise<void> {
  loading.value = true
  error.value = false
  const [metersResp, loadsResp] = await Promise.all([getMeters(), getLoads()])

  if (!metersResp && !loadsResp) {
    error.value = true
    loading.value = false
    return
  }

  if (metersResp?.meters?.length) {
    // Fetch current reading for each meter in parallel (capped at first 10 for performance)
    const meterSlice = metersResp.meters.slice(0, 10)
    const currentReadings = await Promise.all(
      meterSlice.map(m => getMeterCurrent(m.meter_id))
    )

    const meterRows: AssetRow[] = meterSlice.map((m: SimMeter, idx) => {
      const cur = currentReadings[idx]
      const totalW = cur
        ? cur.readings.active_power_l1_w + cur.readings.active_power_l2_w + cur.readings.active_power_l3_w
        : 0
      return {
        meterId: m.meter_id,
        deviceType: m.type,
        site: 'Simulation',
        protocol: 'Simulation REST',
        lastTimestamp: cur?.timestamp ?? new Date().toISOString(),
        status: 'healthy',
        dataQuality: 99.0,
        powerKw: totalW / 1000
      }
    })

    const loadRows: AssetRow[] = (loadsResp?.devices ?? []).map((d: SimDevice) => ({
      meterId: d.device_id,
      deviceType: d.device_type,
      site: 'Simulation',
      protocol: 'Simulation REST',
      lastTimestamp: new Date().toISOString(),
      status: 'healthy',
      dataQuality: 98.0,
      powerKw: d.rated_power_kw
    }))

    assetRows.value = [...meterRows, ...loadRows]
  } else if (loadsResp?.devices?.length) {
    assetRows.value = loadsResp.devices.map((d: SimDevice) => ({
      meterId: d.device_id,
      deviceType: d.device_type,
      site: 'Simulation',
      protocol: 'Simulation REST',
      lastTimestamp: new Date().toISOString(),
      status: 'healthy',
      dataQuality: 98.0,
      powerKw: d.rated_power_kw
    }))
  } else {
    error.value = true
  }

  loading.value = false
}

onMounted(fetchData)

const columns = [
  { field: 'meterId', header: 'Asset ID', sortable: true },
  { field: 'deviceType', header: 'Device Type', sortable: true },
  { field: 'site', header: 'Site', sortable: true },
  { field: 'protocol', header: 'Protocol', sortable: true },
  { field: 'lastTimestamp', header: 'Last Reading', type: 'date' as const, sortable: true },
  { field: 'status', header: 'Status', type: 'status' as const, sortable: true },
  { field: 'dataQuality', header: 'Data Quality (%)', type: 'number' as const, sortable: true },
  { field: '_actions', header: '', type: 'actions' as const, sortable: false, width: '80px' }
]

const filters = [
  { label: 'Healthy', value: 'healthy', field: 'status' },
  { label: 'Warning', value: 'warning', field: 'status' },
  { label: 'Error', value: 'error', field: 'status' }
]

const summaryKpis = computed(() => [
  {
    label: 'Total Assets',
    value: assetRows.value.length,
    unit: '',
    trend: 'stable' as const,
    icon: 'pi-gauge',
    color: '#3b82f6'
  },
  {
    label: 'Healthy',
    value: assetRows.value.filter(m => m.status === 'healthy').length,
    unit: '',
    trend: 'stable' as const,
    icon: 'pi-check-circle',
    color: '#22c55e'
  },
  {
    label: 'Warning',
    value: assetRows.value.filter(m => m.status === 'warning').length,
    unit: '',
    trend: 'stable' as const,
    icon: 'pi-exclamation-triangle',
    color: '#f59e0b'
  },
  {
    label: 'Error / Offline',
    value: assetRows.value.filter(m => m.status === 'error').length,
    unit: '',
    trend: 'stable' as const,
    icon: 'pi-times-circle',
    color: '#ef4444'
  },
  {
    label: 'Avg Data Quality',
    value: assetRows.value.length > 0
      ? (assetRows.value.reduce((s, m) => s + m.dataQuality, 0) / assetRows.value.length).toFixed(1)
      : '—',
    unit: '%',
    trend: 'up' as const,
    trendValue: '+0.3%',
    icon: 'pi-check-circle',
    color: '#22c55e'
  }
])

function onRowSelect(row: Record<string, unknown>): void {
  router.push(`/use-cases/smart-energy/assets/${row['meterId']}`)
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Energy Assets"
      subtitle="Smart meters, PV inverters and industrial monitoring devices across all sites"
      :breadcrumbs="[{ label: 'Use Cases' }, { label: 'Smart Energy' }, { label: 'Assets' }]"
    >
      <template #actions>
        <Button icon="pi pi-refresh" size="small" text :loading="loading" @click="fetchData()" />
      </template>
    </PageHeader>

    <!-- API error state -->
    <div v-if="error && !loading" class="api-error">
      <i class="pi pi-exclamation-circle"></i>
      <p>Could not load data from simulation API</p>
      <Button label="Retry" size="small" @click="fetchData()" />
    </div>
    <div v-else-if="assetRows.length > 0 && !loading" class="live-banner">
      <i class="pi pi-circle-fill live-banner__dot"></i>
      Live asset list from simulation API
    </div>

    <div class="view-body">
      <!-- Summary KPIs -->
      <div class="grid-kpi" style="grid-template-columns: repeat(5, 1fr)">
        <KpiCard
          v-for="item in summaryKpis"
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

      <!-- Assets Table -->
      <DataTablePage
        title="Energy Assets"
        :subtitle="`${assetRows.length} devices registered`"
        :columns="columns"
        :data="assetRows as unknown as Record<string, unknown>[]"
        :filters="filters"
        :search-fields="['meterId', 'deviceType', 'site', 'protocol']"
        empty-icon="pi-gauge"
        empty-title="No assets found"
        empty-message="No energy assets match the current filters."
        @row-select="onRowSelect"
      >
        <template #actions="{ row }">
          <Button
            icon="pi pi-eye"
            v-tooltip="'View Detail'"
            text
            rounded
            size="small"
            @click="router.push(`/use-cases/smart-energy/assets/${row['meterId']}`)"
          />
        </template>
      </DataTablePage>
    </div>
  </div>
</template>

<style scoped>
.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }

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
</style>
