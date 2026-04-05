<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { getStreetlights, getTrafficZones, getCityEvents, getSimHealth } from '@/services/api'

const router = useRouter()
const loading       = ref(true)
const isLive        = ref(false)
const lightCount    = ref(0)
const zoneCount     = ref(0)
const eventZoneCount = ref(0)
const simHealthy    = ref(false)

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [lightsRes, trafficRes, eventsRes, health] = await Promise.all([
      getStreetlights(), getTrafficZones(), getCityEvents(), getSimHealth()
    ])
    lightCount.value     = lightsRes?.count ?? 0
    zoneCount.value      = trafficRes?.count ?? 0
    eventZoneCount.value = eventsRes?.count ?? 0
    simHealthy.value     = health?.status === 'ok' || health?.status === 'healthy'
    isLive.value = true
  } catch {
    // leave defaults
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchData())

const products = computed(() => {
  const now = new Date().toISOString()
  const available = simHealthy.value ? 'available' : 'maintenance'
  return [
    {
      id: 'scdp-001', name: 'Streetlight Telemetry Stream', semanticScope: 'SAREF4CITY / W3C SSN',
      description: `Real-time dimming levels, power draw, and zone assignment from ${lightCount.value} streetlights — 30s resolution`,
      apiStatus: available, exportStatus: 'ready', version: 'v1.2.0', zoneScope: `${zoneCount.value} zones`,
      schema: ['light_id', 'zone_id', 'dimming_level_pct', 'power_w', 'timestamp'],
      exportFormats: ['JSON', 'Parquet', 'CSV'], owner: 'City Platform Team', lastUpdated: now
    },
    {
      id: 'scdp-002', name: 'Traffic Flow Timeseries', semanticScope: 'ITS / DATEX II',
      description: `Hourly traffic index from ${zoneCount.value} monitoring zones — suitable for adaptive lighting correlation`,
      apiStatus: available, exportStatus: 'ready', version: 'v1.0.0', zoneScope: `${zoneCount.value} zones`,
      schema: ['zone_id', 'traffic_index', 'timestamp'],
      exportFormats: ['JSON', 'CSV'], owner: 'Traffic Analytics', lastUpdated: now
    },
    {
      id: 'scdp-003', name: 'City Event Feed', semanticScope: 'NGSI-LD / FIWARE',
      description: `Active event stream from ${eventZoneCount.value} zones — severity-classified incidents with lifecycle tracking`,
      apiStatus: available, exportStatus: 'pending', version: 'v0.9.0', zoneScope: `${eventZoneCount.value} zones`,
      schema: ['zone_id', 'event_type', 'severity', 'active', 'timestamp'],
      exportFormats: ['JSON'], owner: 'Safety & Ops', lastUpdated: now
    },
    {
      id: 'scdp-004', name: 'City Visibility & Fog Index', semanticScope: 'WMO / ISO 19157',
      description: 'Dawn/dusk transitions, fog index, and visibility metrics for context-aware lighting decisions',
      apiStatus: available, exportStatus: 'ready', version: 'v1.0.0', zoneScope: 'City-wide',
      schema: ['fog_index', 'visibility', 'sunrise_time', 'sunset_time', 'timestamp'],
      exportFormats: ['JSON', 'CSV'], owner: 'City Platform Team', lastUpdated: now
    }
  ]
})

const availableCount = computed(() => products.value.filter(p => p.apiStatus === 'available').length)
const exportReadyCount = computed(() => products.value.filter(p => p.exportStatus === 'ready').length)
const totalSchemaFields = computed(() => products.value.reduce((s, p) => s + p.schema.length, 0))

function formatDate(ts: string): string {
  try { return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  catch { return ts }
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="City Data Products"
      subtitle="Published smart city domain data products — derived from live zone and streetlight inventory"
      :breadcrumbs="[{ label: 'Use Cases' }, { label: 'Smart City' }, { label: 'Data Products' }]"
    />

    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> Product inventory derived from live streetlight + traffic API counts
    </div>

    <div class="view-body">
      <div v-if="loading" class="loading-state">
        <i class="pi pi-spin pi-spinner" style="font-size:1.5rem;color:var(--facis-primary)"></i>
        <span>Loading city data product inventory…</span>
      </div>

      <template v-else>
        <div class="grid-kpi" style="grid-template-columns: repeat(auto-fill, minmax(175px,1fr))">
          <KpiCard label="Total Products"  :value="products.length"    trend="stable" icon="pi-box" color="#3b82f6" />
          <KpiCard label="API Available"   :value="availableCount"     trend="stable" icon="pi-check-circle" color="#22c55e" />
          <KpiCard label="Export Ready"    :value="exportReadyCount"   trend="stable" icon="pi-download" color="#8b5cf6" />
          <KpiCard label="Schema Fields"   :value="totalSchemaFields"  trend="stable" icon="pi-list" color="#0ea5e9" />
          <KpiCard label="Light Sources"   :value="lightCount"         trend="stable" icon="pi-lightbulb" color="#f59e0b" />
          <KpiCard label="Monitored Zones" :value="zoneCount"          trend="stable" icon="pi-map" color="#7c3aed" />
        </div>

        <div class="product-cards">
          <div
            v-for="product in products"
            :key="product.id"
            class="product-card"
            @click="router.push(`/use-cases/smart-city/data-products/${product.id}`)"
          >
            <div class="product-card__header">
              <div class="product-card__icon"><i class="pi pi-box"></i></div>
              <div class="product-card__statuses">
                <StatusBadge :status="product.apiStatus" size="sm" />
                <StatusBadge :status="product.exportStatus" size="sm" />
              </div>
            </div>
            <div class="product-card__name">{{ product.name }}</div>
            <div class="product-card__scope">{{ product.semanticScope }}</div>
            <div class="product-card__desc">{{ product.description }}</div>
            <div class="product-card__meta">
              <span class="meta-chip">v{{ product.version }}</span>
              <span class="meta-chip">{{ product.schema.length }} fields</span>
              <span class="meta-chip">{{ product.zoneScope }}</span>
              <span class="meta-chip">{{ product.exportFormats.length }} formats</span>
            </div>
            <div class="product-card__footer">
              <span class="product-card__owner"><i class="pi pi-user"></i> {{ product.owner }}</span>
              <span class="product-card__updated">{{ formatDate(product.lastUpdated) }}</span>
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
.product-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.25rem; }
.product-card { background: var(--facis-surface); border: 1px solid var(--facis-border); border-radius: var(--facis-radius); box-shadow: var(--facis-shadow); padding: 1.125rem; display: flex; flex-direction: column; gap: 0.6rem; cursor: pointer; transition: box-shadow 0.15s, border-color 0.15s; }
.product-card:hover { box-shadow: var(--facis-shadow-md); border-color: var(--facis-primary); }
.product-card__header { display: flex; align-items: center; justify-content: space-between; }
.product-card__icon { width: 38px; height: 38px; border-radius: var(--facis-radius-sm); background: #f3e8ff; color: #7c3aed; display: flex; align-items: center; justify-content: center; font-size: 1rem; }
.product-card__statuses { display: flex; gap: 0.4rem; }
.product-card__name { font-size: 0.9rem; font-weight: 700; color: var(--facis-text); }
.product-card__scope { font-size: 0.75rem; color: #7c3aed; font-weight: 500; }
.product-card__desc { font-size: 0.78rem; color: var(--facis-text-secondary); line-height: 1.55; flex: 1; }
.product-card__meta { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.meta-chip { font-size: 0.7rem; font-weight: 500; padding: 0.18rem 0.5rem; border-radius: 20px; background: var(--facis-surface-2); border: 1px solid var(--facis-border); color: var(--facis-text-secondary); }
.product-card__footer { display: flex; align-items: center; justify-content: space-between; padding-top: 0.5rem; border-top: 1px solid var(--facis-border); }
.product-card__owner { font-size: 0.72rem; color: var(--facis-text-secondary); display: flex; align-items: center; gap: 0.25rem; }
.product-card__updated { font-size: 0.72rem; color: var(--facis-text-muted); }
</style>
