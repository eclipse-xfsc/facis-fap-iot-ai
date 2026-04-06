<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import DataTablePage from '@/components/common/DataTablePage.vue'
import {
  getStreetlights,
  getStreetlightCurrent,
  type SimStreetlight,
  type SimStreetlightCurrent
} from '@/services/api'

const router = useRouter()

// ─── Live data state ──────────────────────────────────────────────────────────
const isLive = ref(false)
const loading = ref(false)
const error = ref(false)
const liveStreetlights = ref<SimStreetlight[]>([])
const liveCurrentMap = ref<Record<string, SimStreetlightCurrent>>({})

async function fetchData(): Promise<void> {
  loading.value = true
  error.value = false
  const res = await getStreetlights()

  if (!res) {
    error.value = true
    loading.value = false
    return
  }

  liveStreetlights.value = res.streetlights

  // Fetch current for every light (in parallel, cap at 30 to avoid flooding)
  const lights = res.streetlights.slice(0, 30)
  const currents = await Promise.all(lights.map(l => getStreetlightCurrent(l.light_id)))
  for (let i = 0; i < lights.length; i++) {
    if (currents[i]) liveCurrentMap.value[lights[i].light_id] = currents[i]!
  }
  isLive.value = true
  loading.value = false
}

onMounted(fetchData)

// ─── Computed zones from live streetlights ────────────────────────────────────
interface LiveZoneRow {
  zoneId: string
  zoneName: string
  lightCount: number
  status: string
  avgDimmingLevel: number
  contextActivityLevel: string
  lastUpdate: string
  dataQuality: number
}

const liveZoneRows = computed<LiveZoneRow[]>(() => {
  const grouped: Record<string, SimStreetlight[]> = {}
  for (const light of liveStreetlights.value) {
    if (!grouped[light.zone_id]) grouped[light.zone_id] = []
    grouped[light.zone_id].push(light)
  }
  return Object.entries(grouped).map(([zoneId, lights]) => {
    const currents = lights.map(l => liveCurrentMap.value[l.light_id]).filter(Boolean) as SimStreetlightCurrent[]
    const avgDimming = currents.length
      ? Math.round(currents.reduce((s, c) => s + c.dimming_level_pct, 0) / currents.length)
      : 50
    const lastTs = currents.length ? currents[0].timestamp : new Date().toISOString()
    return {
      zoneId,
      zoneName: zoneId,
      lightCount: lights.length,
      status: 'active',
      avgDimmingLevel: avgDimming,
      contextActivityLevel: avgDimming > 70 ? 'high' : avgDimming > 40 ? 'medium' : 'low',
      lastUpdate: lastTs,
      dataQuality: 98.5
    }
  })
})

// ─── Computed luminaire rows from live data ───────────────────────────────────
interface LiveLuminaireRow {
  lightId: string
  zoneId: string
  state: string
  dimmingLevel: number
  timestamp: string
  healthStatus: string
}

const liveLuminaireRows = computed<LiveLuminaireRow[]>(() =>
  liveStreetlights.value.map(l => {
    const cur = liveCurrentMap.value[l.light_id]
    return {
      lightId: l.light_id,
      zoneId: l.zone_id,
      state: cur ? (cur.dimming_level_pct < 100 ? 'dimmed' : 'on') : 'on',
      dimmingLevel: cur?.dimming_level_pct ?? 100,
      timestamp: cur?.timestamp ?? new Date().toISOString(),
      healthStatus: 'healthy'
    }
  })
)

const zones = computed(() => liveZoneRows.value)
const luminaires = computed(() => liveLuminaireRows.value)

// ─── View toggle ──────────────────────────────────────────────────────────────
const activeView = ref<'zones' | 'luminaires'>('zones')

// ─── Zone columns ─────────────────────────────────────────────────────────────
const zoneColumns = [
  { field: 'zoneId', header: 'Zone ID', sortable: true },
  { field: 'zoneName', header: 'Zone Name', sortable: true },
  { field: 'lightCount', header: 'Luminaires', type: 'number' as const, sortable: true },
  { field: 'status', header: 'Status', type: 'status' as const, sortable: true },
  { field: 'avgDimmingLevel', header: 'Avg Dimming (%)', type: 'number' as const, sortable: true },
  { field: 'contextActivityLevel', header: 'Activity Level', sortable: true },
  { field: 'lastUpdate', header: 'Last Update', type: 'date' as const, sortable: true },
  { field: 'dataQuality', header: 'Quality (%)', type: 'number' as const, sortable: true }
]

const zoneFilters = [
  { label: 'Active', value: 'active', field: 'status' },
  { label: 'Dimmed', value: 'dimmed', field: 'status' },
  { label: 'Fault', value: 'fault', field: 'status' },
  { label: 'High Activity', value: 'high', field: 'contextActivityLevel' },
  { label: 'Low Activity', value: 'low', field: 'contextActivityLevel' }
]

// ─── Luminaire columns ────────────────────────────────────────────────────────
const luminaireColumns = [
  { field: 'lightId', header: 'Light ID', sortable: true },
  { field: 'zoneId', header: 'Zone', sortable: true },
  { field: 'state', header: 'State', type: 'status' as const, sortable: true },
  { field: 'dimmingLevel', header: 'Dimming (%)', type: 'number' as const, sortable: true },
  { field: 'timestamp', header: 'Last Update', type: 'date' as const, sortable: true },
  { field: 'healthStatus', header: 'Health', type: 'status' as const, sortable: true }
]

const luminaireFilters = [
  { label: 'On', value: 'on', field: 'state' },
  { label: 'Dimmed', value: 'dimmed', field: 'state' },
  { label: 'Fault', value: 'fault', field: 'state' },
  { label: 'Healthy', value: 'healthy', field: 'healthStatus' },
  { label: 'Warning', value: 'warning', field: 'healthStatus' }
]

// ─── Summary stats ────────────────────────────────────────────────────────────
const zoneStats = computed(() => ({
  total: zones.value.length,
  active: zones.value.filter(z => z.status === 'active').length,
  dimmed: zones.value.filter(z => z.status === 'dimmed').length,
  fault: zones.value.filter(z => z.status === 'fault').length
}))

const luminaireStats = computed(() => ({
  total: luminaires.value.length,
  on: luminaires.value.filter((l: { state: string }) => l.state === 'on').length,
  dimmed: luminaires.value.filter((l: { state: string }) => l.state === 'dimmed').length,
  fault: luminaires.value.filter((l: { state: string }) => l.state === 'fault').length
}))
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Lighting Zones"
      subtitle="All managed lighting zones and individual luminaires"
      :breadcrumbs="[{ label: 'Use Cases' }, { label: 'Smart City' }, { label: 'Zones' }]"
    >
      <template #actions>
        <div class="view-toggle">
          <button
            class="view-toggle-btn"
            :class="{ 'view-toggle-btn--active': activeView === 'zones' }"
            @click="activeView = 'zones'"
          >
            <i class="pi pi-map"></i> Zones
          </button>
          <button
            class="view-toggle-btn"
            :class="{ 'view-toggle-btn--active': activeView === 'luminaires' }"
            @click="activeView = 'luminaires'"
          >
            <i class="pi pi-lightbulb"></i> Luminaires
          </button>
        </div>
      </template>
    </PageHeader>

    <div class="view-body">
      <!-- Data source banner -->
      <div v-if="loading" class="data-banner data-banner--loading">
        <i class="pi pi-spin pi-spinner"></i> Loading live data from simulation API...
      </div>
      <div v-else-if="isLive" class="data-banner data-banner--live">
        <i class="pi pi-wifi"></i> Live data from simulation API
      </div>
      <div v-else-if="error" class="api-error">
        <i class="pi pi-exclamation-circle"></i>
        <p>Could not load data from simulation API</p>
        <Button label="Retry" size="small" @click="fetchData()" />
      </div>

      <!-- Summary chips -->
      <div v-if="activeView === 'zones'" class="summary-chips">
        <div class="summary-chip summary-chip--total">
          <span class="summary-chip__val">{{ zoneStats.total }}</span>
          <span class="summary-chip__lbl">Total</span>
        </div>
        <div class="summary-chip summary-chip--green">
          <span class="summary-chip__val">{{ zoneStats.active }}</span>
          <span class="summary-chip__lbl">Active</span>
        </div>
        <div class="summary-chip summary-chip--yellow">
          <span class="summary-chip__val">{{ zoneStats.dimmed }}</span>
          <span class="summary-chip__lbl">Dimmed</span>
        </div>
        <div class="summary-chip summary-chip--red">
          <span class="summary-chip__val">{{ zoneStats.fault }}</span>
          <span class="summary-chip__lbl">Fault</span>
        </div>
      </div>

      <div v-if="activeView === 'luminaires'" class="summary-chips">
        <div class="summary-chip summary-chip--total">
          <span class="summary-chip__val">{{ luminaireStats.total }}</span>
          <span class="summary-chip__lbl">Total</span>
        </div>
        <div class="summary-chip summary-chip--green">
          <span class="summary-chip__val">{{ luminaireStats.on }}</span>
          <span class="summary-chip__lbl">On / Active</span>
        </div>
        <div class="summary-chip summary-chip--yellow">
          <span class="summary-chip__val">{{ luminaireStats.dimmed }}</span>
          <span class="summary-chip__lbl">Dimmed</span>
        </div>
        <div class="summary-chip summary-chip--red">
          <span class="summary-chip__val">{{ luminaireStats.fault }}</span>
          <span class="summary-chip__lbl">Fault</span>
        </div>
      </div>

      <!-- Zones table -->
      <template v-if="activeView === 'zones'">
        <DataTablePage
          :title="`${zones.length} zones managed`"
          subtitle="Click a row to view zone detail"
          :columns="zoneColumns"
          :data="zones as unknown as Record<string, unknown>[]"
          :filters="zoneFilters"
          :search-fields="['zoneId', 'zoneName', 'status', 'contextActivityLevel']"
          empty-icon="pi-map"
          empty-title="No zones found"
          @row-select="(row) => router.push(`/use-cases/smart-city/zones/${row['zoneId']}`)"
        />
      </template>

      <!-- Luminaires table -->
      <template v-if="activeView === 'luminaires'">
        <DataTablePage
          :title="`${luminaires.length} luminaires`"
          subtitle="Individual luminaire telemetry"
          :columns="luminaireColumns"
          :data="luminaires as unknown as Record<string, unknown>[]"
          :filters="luminaireFilters"
          :search-fields="['lightId', 'zoneId', 'state', 'healthStatus']"
          :rows-per-page="20"
          empty-icon="pi-lightbulb"
          empty-title="No luminaires found"
          @row-select="(row) => router.push(`/use-cases/smart-city/zones/${row['zoneId']}`)"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }

.data-banner {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.8rem; font-weight: 500; padding: 0.5rem 1rem;
  border-radius: var(--facis-radius-sm); border: 1px solid;
}
.data-banner--loading { background: #f0f9ff; border-color: #bae6fd; color: #0369a1; }
.data-banner--live { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }

.view-toggle { display: flex; border: 1px solid var(--facis-border); border-radius: var(--facis-radius-sm); overflow: hidden; }
.view-toggle-btn {
  display: flex; align-items: center; gap: 0.375rem;
  padding: 0.375rem 0.875rem; font-size: 0.8rem; font-weight: 500;
  border: none; background: var(--facis-surface); color: var(--facis-text-secondary);
  cursor: pointer; transition: all 0.12s;
}
.view-toggle-btn + .view-toggle-btn { border-left: 1px solid var(--facis-border); }
.view-toggle-btn:hover { background: var(--facis-surface-2); color: var(--facis-text); }
.view-toggle-btn--active { background: var(--facis-primary-light); color: var(--facis-primary); }

.summary-chips { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.summary-chip {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 1rem; border-radius: var(--facis-radius-sm);
  border: 1px solid var(--facis-border); background: var(--facis-surface);
}
.summary-chip__val { font-size: 1.1rem; font-weight: 700; color: var(--facis-text); }
.summary-chip__lbl { font-size: 0.75rem; color: var(--facis-text-secondary); }
.summary-chip--green .summary-chip__val { color: #15803d; }
.summary-chip--yellow .summary-chip__val { color: #92400e; }
.summary-chip--red .summary-chip__val { color: #991b1b; }

.api-error {
  display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
  padding: 2rem; margin: 1.5rem; border: 1px solid #fee2e2;
  border-radius: var(--facis-radius); background: #fff5f5;
  color: #991b1b; font-size: 0.875rem; text-align: center;
}
</style>
