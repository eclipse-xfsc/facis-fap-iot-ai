<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import DataTablePage from '@/components/common/DataTablePage.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import { getStreetlights, getTrafficZones } from '@/services/api'

const router = useRouter()
const loading = ref(true)
const error = ref(false)
const streetlightCount = ref(0)
const trafficCount = ref(0)

async function fetchData(): Promise<void> {
  loading.value = true
  error.value = false
  const [lights, traffic] = await Promise.all([getStreetlights(), getTrafficZones()])

  if (!lights && !traffic) {
    error.value = true
    loading.value = false
    return
  }

  streetlightCount.value = lights?.count ?? 0
  trafficCount.value = traffic?.count ?? 0
  loading.value = false
}

onMounted(fetchData)

const products = computed(() => [
  { id: 'dp-003', name: 'Smart Lighting Status', useCase: 'Smart City', semanticScope: 'Public Lighting', version: '1.0.1', sourceCount: streetlightCount.value, apiStatus: 'available', exportStatus: 'ready', lastUpdated: new Date().toISOString() },
  { id: 'dp-004', name: 'Urban Traffic Index', useCase: 'Smart City', semanticScope: 'Urban Mobility', version: '1.1.0', sourceCount: trafficCount.value, apiStatus: 'available', exportStatus: 'ready', lastUpdated: new Date().toISOString() }
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
      title="Smart City Data Products"
      subtitle="Harmonised datasets for Smart City use case — lighting, mobility, and urban sensor fusion"
      :breadcrumbs="[{ label: 'Data Products' }, { label: 'Smart City' }]"
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
        <KpiCard label="City Products" :value="stats.total" trend="stable" icon="pi-map" color="#8b5cf6" />
        <KpiCard label="API Available" :value="stats.available" trend="stable" icon="pi-check-circle" color="#22c55e" />
        <KpiCard label="Contributing Sources" :value="stats.totalSources" trend="stable" icon="pi-database" color="#005fff" />
      </div>

      <DataTablePage
        :title="`${products.length} smart city data products`"
        subtitle="Click a row to view full product detail and access API endpoint"
        :columns="columns"
        :data="products as unknown as Record<string, unknown>[]"
        :filters="filters"
        :search-fields="['name', 'semanticScope', 'version']"
        empty-icon="pi-map"
        empty-title="No smart city products found"
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
