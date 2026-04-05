<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { getMeters, getPVSystems, getWeatherStations, getLoads, getSimHealth } from '@/services/api'

const router = useRouter()
const loading = ref(true)
const isLive  = ref(false)

const meterCount   = ref(0)
const pvCount      = ref(0)
const stationCount = ref(0)
const loadCount    = ref(0)
const simHealthy   = ref(false)

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [metersRes, pvRes, stationsRes, loadsRes, health] = await Promise.all([
      getMeters(), getPVSystems(), getWeatherStations(), getLoads(), getSimHealth()
    ])
    meterCount.value   = metersRes?.count ?? 0
    pvCount.value      = pvRes?.count ?? 0
    stationCount.value = stationsRes?.count ?? 0
    loadCount.value    = loadsRes?.count ?? 0
    simHealthy.value   = health?.status === 'ok' || health?.status === 'healthy'
    isLive.value = true
  } catch {
    // leave defaults
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchData())

// Derive product list from real source counts
const products = computed(() => {
  const now = new Date().toISOString()
  const items = [
    {
      id: 'edp-001', name: 'Energy Consumption Timeseries', description: `Harmonised active power + energy readings from ${meterCount.value} metering points — 5-minute resolution`,
      sourceCount: meterCount.value, apiStatus: simHealthy.value ? 'available' : 'maintenance', exportStatus: 'ready',
      version: 'v2.1.0', category: 'energy', lastUpdated: now, semanticScope: 'IEC-61968 CIM'
    },
    {
      id: 'edp-002', name: 'PV Generation Forecast', description: `ML-augmented solar forecast from ${pvCount.value} PV system(s) — irradiance-normalised`,
      sourceCount: pvCount.value + stationCount.value, apiStatus: pvCount.value > 0 ? 'available' : 'maintenance', exportStatus: pvCount.value > 0 ? 'ready' : 'pending',
      version: 'v1.3.0', category: 'energy', lastUpdated: now, semanticScope: 'SunSpec / SAREF4ENER'
    },
    {
      id: 'edp-003', name: 'Market Price Timeseries', description: 'Day-ahead spot prices + tariff classification enriched with peak/off-peak labels',
      sourceCount: 1, apiStatus: 'available', exportStatus: 'ready',
      version: 'v1.0.1', category: 'energy', lastUpdated: now, semanticScope: 'ENTSO-E Transparency'
    },
    {
      id: 'edp-004', name: 'Flexible Load Telemetry', description: `Real-time device state + power draw from ${loadCount.value} deferrable loads — duty cycle included`,
      sourceCount: loadCount.value, apiStatus: loadCount.value > 0 ? 'available' : 'maintenance', exportStatus: 'ready',
      version: 'v1.1.0', category: 'energy', lastUpdated: now, semanticScope: 'SAREF4BLDG'
    },
    {
      id: 'edp-005', name: 'Weather Context — Energy', description: `Temperature, irradiance, humidity from ${stationCount.value} weather station(s) — enriched with HDD/CDD`,
      sourceCount: stationCount.value, apiStatus: stationCount.value > 0 ? 'available' : 'maintenance', exportStatus: 'ready',
      version: 'v1.0.0', category: 'energy', lastUpdated: now, semanticScope: 'WMO / ISO 15099'
    }
  ]
  return items
})

const summaryKpis = computed(() => [
  { label: 'Total Products', value: products.value.length, icon: 'pi-box', color: '#3b82f6', trend: 'stable' as const },
  { label: 'API Available', value: products.value.filter(p => p.apiStatus === 'available').length, icon: 'pi-check-circle', color: '#22c55e', trend: 'stable' as const },
  { label: 'Export Ready', value: products.value.filter(p => p.exportStatus === 'ready').length, icon: 'pi-download', color: '#22c55e', trend: 'stable' as const },
  { label: 'Total Sources', value: products.value.reduce((s, p) => s + p.sourceCount, 0), icon: 'pi-database', color: '#8b5cf6', trend: 'stable' as const }
])

function formatDate(ts: string): string {
  try { return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  catch { return ts }
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Energy Data Products"
      subtitle="Published energy domain data products — derived from live simulation source inventory"
      :breadcrumbs="[{ label: 'Use Cases' }, { label: 'Smart Energy' }, { label: 'Data Products' }]"
    >
      <template #actions>
        <Button label="API Docs" icon="pi pi-code" size="small" outlined />
        <Button label="New Product" icon="pi pi-plus" size="small" />
      </template>
    </PageHeader>

    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> Product inventory derived from live API source counts
    </div>

    <div class="view-body">
      <div v-if="loading" class="loading-state">
        <i class="pi pi-spin pi-spinner" style="font-size:1.5rem;color:var(--facis-primary)"></i>
        <span>Loading data product inventory…</span>
      </div>

      <template v-else>
        <div class="grid-kpi" style="grid-template-columns: repeat(4,1fr)">
          <KpiCard v-for="kpi in summaryKpis" :key="kpi.label" :label="kpi.label" :value="kpi.value" :icon="kpi.icon" :color="kpi.color" :trend="kpi.trend" />
        </div>

        <div class="products-grid">
          <div v-for="p in products" :key="p.id" class="product-card card" @click="router.push(`/use-cases/smart-energy/data-products/${p.id}`)">
            <div class="product-card__header">
              <div class="product-card__icon"><i class="pi pi-box"></i></div>
              <div class="product-card__statuses">
                <StatusBadge :status="p.apiStatus" size="sm" />
                <StatusBadge :status="p.exportStatus" size="sm" />
              </div>
            </div>
            <div class="product-card__name">{{ p.name }}</div>
            <div class="product-card__scope">{{ p.semanticScope }}</div>
            <div class="product-card__desc">{{ p.description }}</div>
            <div class="product-card__meta">
              <span class="meta-chip">{{ p.version }}</span>
              <span class="meta-chip">{{ p.sourceCount }} source{{ p.sourceCount !== 1 ? 's' : '' }}</span>
              <span class="meta-chip">{{ p.category }}</span>
            </div>
            <div class="product-card__footer">
              <span class="product-card__updated">Updated: {{ formatDate(p.lastUpdated) }}</span>
              <Button icon="pi pi-arrow-right" text size="small" @click.stop="router.push(`/use-cases/smart-energy/data-products/${p.id}`)" />
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.live-banner { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #15803d; background: #dcfce7; padding: 0.375rem 1.5rem; border-bottom: 1px solid #bbf7d0; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.loading-state { display: flex; align-items: center; justify-content: center; gap: 0.75rem; padding: 4rem; color: var(--facis-text-secondary); font-size: 0.875rem; }
.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
.products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.25rem; }
.product-card { padding: 1.125rem; display: flex; flex-direction: column; gap: 0.6rem; cursor: pointer; transition: box-shadow 0.15s, border-color 0.15s; }
.product-card:hover { box-shadow: var(--facis-shadow-md); border-color: var(--facis-primary); }
.product-card__header { display: flex; align-items: center; justify-content: space-between; }
.product-card__icon { width: 38px; height: 38px; border-radius: var(--facis-radius-sm); background: var(--facis-primary-light); color: var(--facis-primary); display: flex; align-items: center; justify-content: center; font-size: 1rem; }
.product-card__statuses { display: flex; gap: 0.4rem; }
.product-card__name { font-size: 0.9rem; font-weight: 700; color: var(--facis-text); }
.product-card__scope { font-size: 0.75rem; color: var(--facis-primary); font-weight: 500; }
.product-card__desc { font-size: 0.78rem; color: var(--facis-text-secondary); line-height: 1.55; flex: 1; }
.product-card__meta { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.meta-chip { font-size: 0.7rem; font-weight: 500; padding: 0.18rem 0.5rem; border-radius: 20px; background: var(--facis-surface-2); border: 1px solid var(--facis-border); color: var(--facis-text-secondary); }
.product-card__footer { display: flex; align-items: center; justify-content: space-between; padding-top: 0.5rem; border-top: 1px solid var(--facis-border); }
.product-card__updated { font-size: 0.72rem; color: var(--facis-text-muted); }
</style>
