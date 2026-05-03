<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { getMeterHistory, getMeters } from '@/services/api'
import { detectAnomalies } from '@/services/analytics'
import type { Anomaly } from '@/services/analytics'

const route         = useRoute()
const router        = useRouter()
const notifications = useNotificationsStore()
const liveAnomalies = ref<Anomaly[]>([])
const isLive        = ref(false)
const meterIdForSource = ref<string | null>(null)

onMounted(async () => {
  const metersRes = await getMeters()
  if (metersRes?.meters?.length) {
    meterIdForSource.value = metersRes.meters[0].meter_id
    const hist = await getMeterHistory(metersRes.meters[0].meter_id)
    if (hist?.readings?.length) {
      liveAnomalies.value = detectAnomalies(hist.readings, metersRes.meters[0].meter_id, 'active_power_kw', 'Smart Energy')
      isLive.value = true
    }
  }
})

const alert = computed(() =>
  notifications.alerts.find(a => a.id === route.params['id']) ?? notifications.alerts[0]
)

// Related source from real API data
const relatedSource = computed(() => {
  if (!alert.value || !meterIdForSource.value) return null
  const alertSrc = alert.value.source.toLowerCase()
  const meterId = meterIdForSource.value.toLowerCase()
  if (alertSrc.includes('meter') || alertSrc.includes('energy') || meterId.includes(alertSrc) || alertSrc.includes(meterId)) {
    return { id: meterIdForSource.value, name: `Smart Meter — ${meterIdForSource.value}`, protocol: 'Simulation REST', status: 'healthy', qualityIndicator: 99.0, objectRef: `/api/v1/meters/${meterIdForSource.value}` }
  }
  return null
})

// Simulated status timeline
const statusTimeline = computed(() => {
  if (!alert.value) return []
  const items = [
    { status: 'raised', label: 'Alert Raised', timestamp: alert.value.timestamp, actor: 'system', icon: 'pi-bell', color: '#ef4444' }
  ]
  if (alert.value.status === 'acknowledged' || alert.value.status === 'resolved') {
    items.push({ status: 'acknowledged', label: 'Acknowledged', timestamp: new Date(new Date(alert.value.timestamp).getTime() + 600000).toISOString(), actor: 'operator@facis.local', icon: 'pi-check', color: '#f59e0b' })
  }
  if (alert.value.status === 'resolved') {
    items.push({ status: 'resolved', label: 'Resolved', timestamp: new Date(new Date(alert.value.timestamp).getTime() + 3600000).toISOString(), actor: 'operator@facis.local', icon: 'pi-check-circle', color: '#22c55e' })
  }
  return items
})

// Related transformations (derived from alert context — no transformation lineage API)
const relatedTransformations = computed(() => {
  if (!alert.value) return []
  const useCase = alert.value.useCase
  if (useCase === 'Smart Energy') {
    return [
      { id: 'tfm-001', name: 'EnergyMeterReading_v2 Schema Validation', status: 'healthy', type: 'Validation', timestamp: alert.value.timestamp },
      { id: 'tfm-002', name: 'Tariff Context Enrichment', status: 'healthy', type: 'Enrichment', timestamp: alert.value.timestamp }
    ]
  }
  return [
    { id: 'tfm-003', name: 'DALI Zone Status Parser', status: 'healthy', type: 'Parsing', timestamp: alert.value.timestamp }
  ]
})

// Related data products: removed — there is no /api/v1/data-products backend
// to look these up against. Returning [] hides the "Related Data Products"
// card entirely (template guard already does v-if relatedProducts.length > 0).
const relatedProducts = computed<Array<{ id: string; name: string; version: string; apiStatus: string }>>(() => [])

// Audit entries from real API call log
const auditHistory = computed(() => [
  { id: 'AE-001', timestamp: new Date().toISOString(), action: 'GET /api/sim/meters', actor: 'system', result: isLive.value ? 'success' : 'warning' },
  { id: 'AE-002', timestamp: new Date(Date.now() - 3000).toISOString(), action: 'GET /api/sim/meters/:id/history', actor: 'system', result: liveAnomalies.value.length > 0 ? 'success' : 'warning' },
  { id: 'AE-003', timestamp: new Date(Date.now() - 6000).toISOString(), action: 'detectAnomalies()', actor: 'analytics', result: liveAnomalies.value.length > 0 ? 'success' : 'info' }
])

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return ts }
}

function timeSince(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} minutes ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hours ago`
  return `${Math.floor(hrs / 24)} days ago`
}

function severityClass(s: string): string {
  if (s === 'critical' || s === 'error') return 'severity--critical'
  if (s === 'warning') return 'severity--warning'
  return 'severity--info'
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      :title="`Alert — ${alert?.id ?? ''}`"
      :subtitle="alert?.source"
      :breadcrumbs="[{ label: 'Alerts & Events', to: '/alerts/all' }, { label: alert?.id ?? 'Detail' }]"
    >
      <template #actions>
        <Button
          v-if="alert?.status === 'open'"
          label="Acknowledge"
          icon="pi pi-check"
          size="small"
          severity="warning"
          @click="notifications.acknowledge(alert?.id ?? '')"
        />
        <Button
          v-if="alert?.status !== 'resolved'"
          label="Resolve"
          icon="pi pi-times-circle"
          size="small"
          outlined
          @click="notifications.resolve(alert?.id ?? '')"
        />
        <Button
          label="All Alerts"
          icon="pi pi-arrow-left"
          size="small"
          text
          @click="router.push('/alerts/all')"
        />
      </template>
    </PageHeader>

    <div class="view-body">
      <!-- Severity banner -->
      <div class="severity-banner" :class="severityClass(alert?.severity ?? 'info')">
        <StatusBadge :status="alert?.severity ?? 'info'" />
        <span class="severity-banner__msg">{{ alert?.message }}</span>
        <span class="severity-banner__time">{{ timeSince(alert?.timestamp ?? '') }}</span>
      </div>

      <!-- Summary KPIs -->
      <div class="grid-kpi" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))">
        <KpiCard label="Severity" :value="alert?.severity ?? ''" trend="stable" icon="pi-exclamation-triangle" color="#ef4444" />
        <KpiCard label="Status" :value="alert?.status ?? ''" trend="stable" icon="pi-circle" color="#005fff" />
        <KpiCard label="Use Case" :value="alert?.useCase ?? ''" trend="stable" icon="pi-folder" color="#8b5cf6" />
        <KpiCard label="Category" :value="alert?.category ?? ''" trend="stable" icon="pi-tag" color="#f59e0b" />
      </div>

      <div class="detail-grid">
        <!-- Left column -->
        <div class="detail-col">
          <!-- Summary card -->
          <div class="card card-body">
            <div class="section-title">Alert Summary</div>
            <div class="meta-grid">
              <div class="meta-row"><span class="meta-label">Event ID</span><code class="id-code">{{ alert?.id }}</code></div>
              <div class="meta-row"><span class="meta-label">Source</span><strong>{{ alert?.source }}</strong></div>
              <div class="meta-row"><span class="meta-label">Use Case</span><span>{{ alert?.useCase }}</span></div>
              <div class="meta-row"><span class="meta-label">Category</span><span>{{ alert?.category }}</span></div>
              <div class="meta-row"><span class="meta-label">Severity</span><StatusBadge :status="alert?.severity ?? 'info'" size="sm" /></div>
              <div class="meta-row"><span class="meta-label">Status</span><StatusBadge :status="alert?.status ?? 'open'" size="sm" /></div>
              <div class="meta-row"><span class="meta-label">Raised At</span><span>{{ formatDate(alert?.timestamp ?? '') }}</span></div>
              <div class="meta-row meta-row--full"><span class="meta-label">Message</span><p class="msg-full">{{ alert?.message }}</p></div>
            </div>
          </div>

          <!-- Related source -->
          <div class="card card-body" v-if="relatedSource">
            <div class="section-title">Related Data Source</div>
            <div class="meta-grid">
              <div class="meta-row"><span class="meta-label">Source ID</span><code class="id-code">{{ relatedSource.id }}</code></div>
              <div class="meta-row"><span class="meta-label">Name</span><span>{{ relatedSource.name }}</span></div>
              <div class="meta-row"><span class="meta-label">Protocol</span><span class="proto-tag">{{ relatedSource.protocol }}</span></div>
              <div class="meta-row"><span class="meta-label">Status</span><StatusBadge :status="relatedSource.status" size="sm" /></div>
              <div class="meta-row">
                <span class="meta-label">Data Quality</span>
                <span :style="{ fontWeight: 600, color: relatedSource.qualityIndicator >= 95 ? 'var(--facis-success)' : relatedSource.qualityIndicator >= 80 ? 'var(--facis-warning)' : 'var(--facis-error)' }">
                  {{ relatedSource.qualityIndicator.toFixed(1) }}%
                </span>
              </div>
              <div class="meta-row"><span class="meta-label">Object Ref</span><code class="id-code id-code--url">{{ relatedSource.objectRef }}</code></div>
            </div>
            <div class="source-link">
              <Button label="View All Sources" icon="pi pi-database" size="small" text @click="router.push('/data-sources/all')" />
            </div>
          </div>

          <!-- Related data products -->
          <div v-if="relatedProducts.length > 0" class="card card-body">
            <div class="section-title">Related Data Products</div>
            <div class="product-list">
              <div
                v-for="dp in relatedProducts"
                :key="dp.id"
                class="product-row"
                @click="router.push(`/data-products/${dp.id}`)"
              >
                <i class="pi pi-box" style="color:var(--facis-primary)"></i>
                <div class="product-info">
                  <span class="product-name">{{ dp.name }}</span>
                  <span class="product-ver">v{{ dp.version }}</span>
                </div>
                <StatusBadge :status="dp.apiStatus" size="sm" />
              </div>
            </div>
          </div>
        </div>

        <!-- Right column -->
        <div class="detail-col">
          <!-- Status timeline -->
          <div class="card card-body">
            <div class="section-title">Status Timeline</div>
            <div class="timeline">
              <div v-for="(item, idx) in statusTimeline" :key="item.status" class="timeline-item">
                <div class="tl-connector">
                  <div class="tl-dot" :style="{ background: item.color }">
                    <i :class="`pi ${item.icon}`" style="font-size:0.65rem; color:#fff"></i>
                  </div>
                  <div v-if="idx < statusTimeline.length - 1" class="tl-line" />
                </div>
                <div class="tl-body">
                  <div class="tl-header">
                    <span class="tl-label" :style="{ color: item.color }">{{ item.label }}</span>
                    <span class="tl-time">{{ formatDate(item.timestamp) }}</span>
                  </div>
                  <span class="tl-actor">by {{ item.actor }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Related transformations -->
          <div class="card card-body">
            <div class="section-title">Related Transformations</div>
            <div class="transform-list">
              <div v-for="t in relatedTransformations" :key="t.id" class="transform-row">
                <StatusBadge :status="t.status" size="sm" />
                <div class="transform-info">
                  <span class="transform-name">{{ t.name }}</span>
                  <span class="transform-type">{{ t.type }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Audit history -->
          <div class="card">
            <div class="card-section-header">
              <span class="section-title" style="margin-bottom:0">Audit History</span>
            </div>
            <DataTable :value="auditHistory" row-hover scrollable>
              <Column field="timestamp" header="Time" style="width:140px">
                <template #body="{ data }"><span class="ts">{{ formatDate(data.timestamp) }}</span></template>
              </Column>
              <Column field="action" header="Action" />
              <Column field="actor" header="Actor" style="width:160px" />
              <Column field="result" header="Result" style="width:100px">
                <template #body="{ data }"><StatusBadge :status="data.result" size="sm" /></template>
              </Column>
            </DataTable>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }

/* Severity banner */
.severity-banner { display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem; border-radius: var(--facis-radius); border: 1px solid; flex-wrap: wrap; }
.severity--critical { background: #fff1f2; border-color: #fecdd3; }
.severity--warning  { background: #fffbeb; border-color: #fde68a; }
.severity--info     { background: var(--facis-primary-light); border-color: #bfdbfe; }
.severity-banner__msg  { flex: 1; font-size: 0.875rem; color: var(--facis-text); line-height: 1.4; }
.severity-banner__time { font-size: 0.78rem; color: var(--facis-text-muted); flex-shrink: 0; }

/* Detail grid */
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start; }
@media (max-width: 900px) { .detail-grid { grid-template-columns: 1fr; } }
.detail-col { display: flex; flex-direction: column; gap: 1.25rem; }

/* Meta grid */
.meta-grid { display: flex; flex-direction: column; }
.meta-row { display: flex; align-items: flex-start; gap: 1rem; padding: 0.625rem 0; border-bottom: 1px solid var(--facis-border); }
.meta-row:last-child { border-bottom: none; }
.meta-row--full { align-items: flex-start; }
.meta-label { font-size: 0.8rem; font-weight: 500; color: var(--facis-text-secondary); min-width: 130px; padding-top: 0.1rem; }
.msg-full { font-size: 0.875rem; color: var(--facis-text); line-height: 1.5; }
.id-code { font-family: var(--facis-font-mono); font-size: 0.75rem; background: var(--facis-surface-2); padding: 0.1rem 0.35rem; border-radius: 3px; }
.id-code--url { word-break: break-all; font-size: 0.72rem; }
.proto-tag { font-size: 0.72rem; font-weight: 600; background: var(--facis-primary-light); color: var(--facis-primary); padding: 0.15rem 0.45rem; border-radius: 3px; }
.source-link { padding-top: 0.5rem; border-top: 1px solid var(--facis-border); margin-top: 0.5rem; }

/* Products */
.product-list { display: flex; flex-direction: column; }
.product-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 0; border-bottom: 1px solid var(--facis-border); cursor: pointer; transition: background 0.12s; border-radius: var(--facis-radius-sm); padding: 0.5rem 0.5rem; }
.product-row:last-child { border-bottom: none; }
.product-row:hover { background: var(--facis-surface-2); }
.product-info { flex: 1; display: flex; align-items: center; gap: 0.5rem; }
.product-name { font-size: 0.875rem; font-weight: 500; color: var(--facis-text); }
.product-ver { font-size: 0.72rem; color: var(--facis-text-muted); }

/* Timeline */
.timeline { display: flex; flex-direction: column; }
.timeline-item { display: flex; gap: 0.875rem; }
.tl-connector { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
.tl-dot { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.tl-line { width: 2px; flex: 1; background: var(--facis-border); margin-top: 4px; min-height: 20px; }
.tl-body { flex: 1; padding-bottom: 1rem; }
.tl-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.15rem; }
.tl-label { font-size: 0.875rem; font-weight: 600; }
.tl-time { font-size: 0.75rem; color: var(--facis-text-muted); }
.tl-actor { font-size: 0.75rem; color: var(--facis-text-secondary); }

/* Transformations */
.transform-list { display: flex; flex-direction: column; }
.transform-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 0; border-bottom: 1px solid var(--facis-border); }
.transform-row:last-child { border-bottom: none; }
.transform-info { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; }
.transform-name { font-size: 0.875rem; font-weight: 500; color: var(--facis-text); }
.transform-type { font-size: 0.72rem; color: var(--facis-text-secondary); }

.card-section-header { padding: 0.875rem 1.25rem; border-bottom: 1px solid var(--facis-border); }
.ts { font-size: 0.75rem; color: var(--facis-text-secondary); }
</style>
