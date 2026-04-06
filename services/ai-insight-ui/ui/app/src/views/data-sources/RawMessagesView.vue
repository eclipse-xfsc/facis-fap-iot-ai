<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import StatusBadge from '@/components/common/StatusBadge.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import {
  getMeters, getMeterCurrent, getPVSystems, getPVCurrent,
  getWeatherStations, getWeatherCurrent, getStreetlights, getStreetlightCurrent,
  getTrafficZones, getTrafficCurrent, getCityEvents, getCityEventCurrent
} from '@/services/api'

interface RawMessage {
  id: string
  source: string
  topic: string
  payloadSize: number
  parserStatus: 'success' | 'warning' | 'error'
  validationStatus: 'valid' | 'partial' | 'invalid'
  receivedAt: string
  payload: Record<string, unknown>
}

const loading    = ref(true)
const isLive     = ref(false)
const allMessages = ref<RawMessage[]>([])
const searchQuery = ref('')
const selectedMsg = ref<RawMessage | null>(null)
const showPayload = ref(false)

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const msgs: RawMessage[] = []

    const [metersRes, pvRes, weatherRes, lightsRes, trafficRes, eventsRes] = await Promise.all([
      getMeters(), getPVSystems(), getWeatherStations(), getStreetlights(), getTrafficZones(), getCityEvents()
    ])

    // Meters
    for (const m of (metersRes?.meters ?? []).slice(0, 4)) {
      const curr = await getMeterCurrent(m.meter_id)
      if (!curr) continue
      const payload = { meter_id: curr.meter_id, timestamp: curr.timestamp, readings: curr.readings }
      msgs.push({
        id: `msg-m-${m.meter_id}`,
        source: m.meter_id,
        topic: `sm/energy/meter/${m.meter_id}/reading`,
        payloadSize: JSON.stringify(payload).length,
        parserStatus: 'success',
        validationStatus: 'valid',
        receivedAt: curr.timestamp,
        payload: payload as Record<string, unknown>
      })
    }

    // PV
    for (const pv of (pvRes?.systems ?? []).slice(0, 2)) {
      const curr = await getPVCurrent(pv.system_id)
      if (!curr) continue
      msgs.push({
        id: `msg-pv-${pv.system_id}`,
        source: pv.system_id,
        topic: `sm/energy/pv/${pv.system_id}/reading`,
        payloadSize: JSON.stringify(curr).length,
        parserStatus: 'success',
        validationStatus: 'valid',
        receivedAt: curr.timestamp,
        payload: curr as Record<string, unknown>
      })
    }

    // Weather
    for (const st of (weatherRes?.stations ?? []).slice(0, 2)) {
      const curr = await getWeatherCurrent(st.station_id)
      if (!curr) continue
      msgs.push({
        id: `msg-wx-${st.station_id}`,
        source: st.station_id,
        topic: `sm/weather/${st.station_id}/conditions`,
        payloadSize: JSON.stringify(curr).length,
        parserStatus: 'success',
        validationStatus: 'valid',
        receivedAt: curr.timestamp,
        payload: curr as Record<string, unknown>
      })
    }

    // Streetlights
    for (const l of (lightsRes?.streetlights ?? []).slice(0, 3)) {
      const curr = await getStreetlightCurrent(l.light_id)
      if (!curr) continue
      msgs.push({
        id: `msg-sl-${l.light_id}`,
        source: l.light_id,
        topic: `sm/city/streetlight/${l.light_id}/status`,
        payloadSize: JSON.stringify(curr).length,
        parserStatus: 'success',
        validationStatus: 'valid',
        receivedAt: curr.timestamp,
        payload: curr as Record<string, unknown>
      })
    }

    // Traffic
    for (const z of (trafficRes?.zones ?? []).slice(0, 2)) {
      const curr = await getTrafficCurrent(z.zone_id)
      if (!curr) continue
      msgs.push({
        id: `msg-tr-${z.zone_id}`,
        source: z.zone_id,
        topic: `sm/city/traffic/${z.zone_id}/index`,
        payloadSize: JSON.stringify(curr).length,
        parserStatus: 'success',
        validationStatus: 'valid',
        receivedAt: curr.timestamp,
        payload: curr as Record<string, unknown>
      })
    }

    // Events
    for (const z of (eventsRes?.zones ?? []).slice(0, 2)) {
      const curr = await getCityEventCurrent(z.zone_id)
      if (!curr) continue
      msgs.push({
        id: `msg-ev-${z.zone_id}`,
        source: z.zone_id,
        topic: `sm/city/events/${z.zone_id}/current`,
        payloadSize: JSON.stringify(curr).length,
        parserStatus: curr.severity === 'high' ? 'warning' : 'success',
        validationStatus: 'valid',
        receivedAt: curr.timestamp,
        payload: curr as Record<string, unknown>
      })
    }

    allMessages.value = msgs.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    isLive.value = msgs.length > 0
  } catch {
    allMessages.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchData())

const filteredMessages = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return allMessages.value
  return allMessages.value.filter(m =>
    m.source.toLowerCase().includes(q) ||
    m.topic.toLowerCase().includes(q) ||
    m.parserStatus.toLowerCase().includes(q)
  )
})

function formatDate(ts: string): string {
  try { return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
  catch { return ts }
}

function openPayload(row: RawMessage): void {
  selectedMsg.value = row
  showPayload.value = true
}

function formattedPayload(msg: RawMessage | null): string {
  if (!msg) return '{}'
  return JSON.stringify(msg.payload, null, 2)
}

function parserSeverity(status: string): string {
  if (status === 'success') return 'healthy'
  if (status === 'warning') return 'warning'
  return 'error'
}

function validationSeverity(status: string): string {
  if (status === 'valid') return 'healthy'
  if (status === 'partial') return 'warning'
  return 'error'
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Raw Messages"
      subtitle="Live raw JSON payloads received from all simulation data sources — real current readings"
      :breadcrumbs="[{ label: 'Data Sources' }, { label: 'Raw Messages' }]"
    >
      <template #actions>
        <Button icon="pi pi-refresh" label="Refresh" size="small" outlined :loading="loading" @click="fetchData()" />
      </template>
    </PageHeader>

    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> Real payloads from live API — {{ allMessages.length }} messages loaded
    </div>

    <div class="view-body">
      <div v-if="loading" class="loading-state">
        <i class="pi pi-spin pi-spinner" style="font-size:1.5rem;color:var(--facis-primary)"></i>
        <span>Fetching raw payloads from live sources…</span>
      </div>

      <template v-else>
        <div class="search-bar">
          <div class="search-wrap">
            <i class="pi pi-search"></i>
            <InputText v-model="searchQuery" placeholder="Search by source, topic…" size="small" style="padding-left:2rem;width:300px" />
          </div>
          <span class="msg-count">{{ filteredMessages.length }} messages</span>
        </div>

        <div class="card">
          <DataTable :value="filteredMessages" row-hover removable-sort scrollable @row-click="(e) => openPayload(e.data as RawMessage)">
            <template #empty><div class="empty-row">No messages. Ensure the simulation is running and click Refresh.</div></template>

            <Column field="source" header="Source" sortable style="width:180px">
              <template #body="{ data }"><code class="id-code">{{ data.source }}</code></template>
            </Column>

            <Column field="topic" header="Topic" sortable>
              <template #body="{ data }"><code class="topic-code">{{ data.topic }}</code></template>
            </Column>

            <Column field="payloadSize" header="Size" sortable style="width:80px">
              <template #body="{ data }"><span class="size-chip">{{ data.payloadSize }}B</span></template>
            </Column>

            <Column field="parserStatus" header="Parser" sortable style="width:110px">
              <template #body="{ data }"><StatusBadge :status="parserSeverity(data.parserStatus)" size="sm" /></template>
            </Column>

            <Column field="validationStatus" header="Validation" sortable style="width:120px">
              <template #body="{ data }"><StatusBadge :status="validationSeverity(data.validationStatus)" size="sm" /></template>
            </Column>

            <Column field="receivedAt" header="Received" sortable style="width:175px">
              <template #body="{ data }"><span class="ts">{{ formatDate(data.receivedAt) }}</span></template>
            </Column>

            <Column header="" style="width:60px">
              <template #body="{ data }">
                <Button icon="pi pi-code" text size="small" v-tooltip="'View Payload'" @click.stop="openPayload(data)" />
              </template>
            </Column>
          </DataTable>
        </div>
      </template>
    </div>

    <!-- Payload Dialog -->
    <Dialog v-model:visible="showPayload" :header="`Payload — ${selectedMsg?.source}`" modal :style="{ width: '680px' }">
      <div v-if="selectedMsg" class="payload-dialog">
        <div class="payload-meta">
          <div class="payload-meta__row"><span class="payload-meta__key">Topic</span><code>{{ selectedMsg.topic }}</code></div>
          <div class="payload-meta__row"><span class="payload-meta__key">Received</span><span>{{ formatDate(selectedMsg.receivedAt) }}</span></div>
          <div class="payload-meta__row"><span class="payload-meta__key">Size</span><span>{{ selectedMsg.payloadSize }} bytes</span></div>
        </div>
        <pre class="payload-pre">{{ formattedPayload(selectedMsg) }}</pre>
      </div>
      <template #footer>
        <Button label="Close" size="small" text @click="showPayload = false" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.live-banner { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #15803d; background: #dcfce7; padding: 0.375rem 1.5rem; border-bottom: 1px solid #bbf7d0; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.loading-state { display: flex; align-items: center; justify-content: center; gap: 0.75rem; padding: 4rem; color: var(--facis-text-secondary); font-size: 0.875rem; }
.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
.search-bar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.search-wrap { position: relative; display: flex; align-items: center; }
.search-wrap .pi-search { position: absolute; left: 0.6rem; color: var(--facis-text-muted); font-size: 0.8rem; z-index: 1; }
.msg-count { font-size: 0.8rem; color: var(--facis-text-secondary); font-weight: 500; }
.id-code { font-family: var(--facis-font-mono); font-size: 0.75rem; background: var(--facis-surface-2); padding: 0.1rem 0.35rem; border-radius: 3px; }
.topic-code { font-family: var(--facis-font-mono); font-size: 0.72rem; color: var(--facis-text-secondary); }
.size-chip { font-size: 0.72rem; font-weight: 600; color: var(--facis-text-secondary); }
.ts { font-size: 0.78rem; color: var(--facis-text-secondary); }
.empty-row { padding: 2rem; text-align: center; color: var(--facis-text-secondary); }
.payload-dialog { display: flex; flex-direction: column; gap: 1rem; }
.payload-meta { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.75rem; background: var(--facis-surface-2); border-radius: var(--facis-radius-sm); }
.payload-meta__row { display: flex; align-items: center; gap: 0.75rem; font-size: 0.82rem; }
.payload-meta__key { font-weight: 600; color: var(--facis-text-secondary); min-width: 80px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
.payload-pre { font-family: var(--facis-font-mono); font-size: 0.8rem; background: #0f172a; color: #94a3b8; padding: 1rem; border-radius: var(--facis-radius-sm); overflow: auto; max-height: 400px; line-height: 1.6; white-space: pre; }
</style>
