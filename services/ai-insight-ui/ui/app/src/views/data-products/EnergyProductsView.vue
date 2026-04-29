<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import DataTablePage from '@/components/common/DataTablePage.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import { getMeters, getPVSystems, getLoads } from '@/services/api'

const router = useRouter()
const loading = ref(true)
const error = ref(false)
const meterCount = ref(0)
const pvCount = ref(0)
const loadCount = ref(0)

async function fetchData(): Promise<void> {
  loading.value = true
  error.value = false
  const [m, pv, loads] = await Promise.all([getMeters(), getPVSystems(), getLoads()])

  if (!m && !pv && !loads) {
    error.value = true
    loading.value = false
    return
  }

  meterCount.value = m?.count ?? 0
  pvCount.value = pv?.count ?? 0
  loadCount.value = loads?.devices?.length ?? 0
  loading.value = false
}

onMounted(fetchData)

const products = computed(() => [
  { id: 'dp-001', name: 'Energy Consumption Timeseries', useCase: 'Smart Energy', semanticScope: 'Energy Metering', version: '2.1.0', sourceCount: meterCount.value, apiStatus: 'available', exportStatus: 'ready', lastUpdated: new Date().toISOString() },
  { id: 'dp-002', name: 'PV Generation Forecast', useCase: 'Smart Energy', semanticScope: 'PV Systems', version: '1.3.0', sourceCount: pvCount.value, apiStatus: 'available', exportStatus: 'ready', lastUpdated: new Date().toISOString() },
  { id: 'dp-005', name: 'Energy Flexibility Profile', useCase: 'Smart Energy', semanticScope: 'Flexible Loads', version: '0.9.0', sourceCount: loadCount.value, apiStatus: 'available', exportStatus: 'processing', lastUpdated: new Date().toISOString() }
].filter(p => p.sourceCount > 0))

const stats = computed(() => ({
  total: products.value.length,
  available: products.value.filter(p => p.apiStatus === 'available').length,
  totalSources: products.value.reduce((a, p) => a + p.sourceCount, 0)
}))

const columns = [
  { field: 'name', header: 'Product', sortable: true },
  { field: 'useCase', header: 'Use Case', sortable: true, width: '140px' },
  { field: 'semanticScope', header: 'Semantic Scope', sortable: true },
  { field: 'version', header: 'Version', sortable: true, width: '100px' },
  { field: 'sourceCount', header: 'Sources', type: 'number' as const, sortable: true, width: '90px' },
  { field: 'apiStatus', header: 'API', type: 'status' as const, sortable: true, width: '120px' },
  { field: 'exportStatus', header: 'Export', type: 'status' as const, sortable: true, width: '110px' },
  { field: 'lastUpdated', header: 'Updated', type: 'date' as const, sortable: true, width: '160px' },
  { field: 'actions', header: '', type: 'actions' as const, sortable: false, width: '80px' }
]

const filters = [
  { label: 'API Available', value: 'available', field: 'apiStatus' },
  { label: 'Export Ready', value: 'ready', field: 'exportStatus' }
]
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Energy Data Products"
      subtitle="Harmonised datasets for Smart Energy use case — metering, PV, weather, and market data"
      :breadcrumbs="[{ label: 'Data Products' }, { label: 'Energy' }]"
    >
      <template #actions>
        <Button icon="pi pi-refresh" size="small" text :loading="loading" @click="fetchData()" />
      </template>
    </PageHeader>

    <div v-if="error && !loading" class="api-error">
      <i class="pi pi-exclamation-circle"></i>
      <p>Could not load data from simulation API</p>
      <Button label="Retry" size="small" @click="fetchData()" />
    </div>

    <div class="view-body">
      <div class="grid-kpi">
        <KpiCard label="Energy Products" :value="stats.total" trend="stable" icon="pi-bolt" color="#f59e0b" />
        <KpiCard label="API Available" :value="stats.available" trend="stable" icon="pi-check-circle" color="#22c55e" />
        <KpiCard label="Contributing Sources" :value="stats.totalSources" trend="stable" icon="pi-database" color="#005fff" />
      </div>

      <DataTablePage
        :title="`${products.length} energy data products`"
        subtitle="Click a row to view full product detail and access API endpoint"
        :columns="columns"
        :data="products as unknown as Record<string, unknown>[]"
        :filters="filters"
        :search-fields="['name', 'semanticScope', 'version']"
        empty-icon="pi-bolt"
        empty-title="No energy products found"
        @row-select="(row) => router.push(`/data-products/${row['id']}`)"
      >
        <template #actions="{ row }">
          <Button
            icon="pi pi-arrow-right"
            text
            size="small"
            severity="secondary"
            @click.stop="router.push(`/data-products/${row['id']}`)"
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
  display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
  padding: 2rem; margin: 1.5rem; border: 1px solid #fee2e2;
  border-radius: var(--facis-radius); background: #fff5f5;
  color: #991b1b; font-size: 0.875rem; text-align: center;
}
</style>
