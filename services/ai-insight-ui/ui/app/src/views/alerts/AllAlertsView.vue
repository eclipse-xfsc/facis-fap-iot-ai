<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { getMeters, getMeterHistory, getStreetlights, getStreetlightHistory, getCityEvents, getCityEventCurrent } from '@/services/api'
import { detectAnomalies, detectStreetlightAnomalies } from '@/services/analytics'
import type { AlertEvent } from '@/data/types'

const router        = useRouter()
const notifications = useNotificationsStore()
const isLive        = ref(false)

onMounted(async () => {
  // 1. Pull persisted alerts from /api/v1/alerts (the ORCE catch-ring buffer).
  await notifications.loadFromApi()

  // 2. Augment with locally-computed anomalies from the live simulation feeds
  //    so users see something even before any backend error fires.
  try {
    const [metersRes, _lightsRes, eventsRes] = await Promise.all([getMeters(), getStreetlights(), getCityEvents()])

    for (const meter of (metersRes?.meters ?? []).slice(0, 2)) {
      const hist = await getMeterHistory(meter.meter_id)
      if (!hist?.readings?.length) continue
      const anoms = detectAnomalies(hist.readings, meter.meter_id, 'active_power_kw', 'Smart Energy')
      for (const a of anoms.slice(0, 2)) {
        if (notifications.alerts.some(x => x.id === a.id)) continue
        notifications.alerts.unshift({
          id: a.id,
          useCase: 'Smart Energy',
          source: a.meterId,
          category: 'Anomaly Detection',
          severity: a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'warning' : 'info',
          timestamp: a.timestamp,
          status: 'open',
          message: a.explanation
        })
      }
    }

    for (const z of (eventsRes?.zones ?? []).slice(0, 3)) {
      const curr = await getCityEventCurrent(z.zone_id)
      if (!curr || !curr.active) continue
      const alertId = `live-event-${z.zone_id}`
      if (!notifications.alerts.some(x => x.id === alertId)) {
        notifications.alerts.unshift({
          id: alertId,
          useCase: 'Smart City',
          source: z.zone_id,
          category: 'City Event',
          severity: curr.severity === 'high' ? 'error' : curr.severity === 'medium' ? 'warning' : 'info',
          timestamp: curr.timestamp,
          status: 'open',
          message: `Active ${curr.event_type} event in ${z.zone_id} — severity: ${curr.severity}`
        })
      }
    }

    isLive.value = true
  } catch { /* keep whatever loadFromApi populated */ }
})

const searchQuery   = ref('')

const activeFilters = ref<{ severity: string | null; status: string | null; useCase: string | null }>({
  severity: null,
  status:   null,
  useCase:  null
})

const filtered = computed(() => {
  let result = [...notifications.alerts]
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(a =>
      a.source.toLowerCase().includes(q) ||
      a.message.toLowerCase().includes(q) ||
      a.useCase.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q)
    )
  }
  if (activeFilters.value.severity) result = result.filter(a => a.severity === activeFilters.value.severity)
  if (activeFilters.value.status)   result = result.filter(a => a.status   === activeFilters.value.status)
  if (activeFilters.value.useCase)  result = result.filter(a => a.useCase  === activeFilters.value.useCase)
  return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
})

const summary = computed(() => ({
  total:    notifications.alerts.length,
  open:     notifications.openAlerts.length,
  critical: notifications.criticalAlerts.length,
  resolved: notifications.alerts.filter(a => a.status === 'resolved').length
}))

function setFilter(key: 'severity' | 'status' | 'useCase', val: string): void {
  activeFilters.value[key] = activeFilters.value[key] === val ? null : val
}

function isActive(key: 'severity' | 'status' | 'useCase', val: string): boolean {
  return activeFilters.value[key] === val
}

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch { return ts }
}

function rowClass(row: AlertEvent): string {
  if (row.severity === 'critical' && row.status === 'open') return 'row--critical'
  if (row.severity === 'error' && row.status === 'open') return 'row--error'
  return ''
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="All Alerts"
      subtitle="Platform-wide alert and event log — click a row to view detail"
      :breadcrumbs="[{ label: 'Alerts & Events' }, { label: 'All' }]"
    >
      <template #actions>
        <Button
          icon="pi pi-check-square"
          label="Acknowledge All Open"
          size="small"
          outlined
          @click="notifications.markAllRead()"
        />
      </template>
    </PageHeader>

    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> Augmented with real anomaly detection from live meter + city event data
    </div>

    <div class="view-body">
      <!-- KPIs -->
      <div class="grid-kpi">
        <KpiCard label="Total Alerts" :value="summary.total" trend="stable" icon="pi-bell" color="#005fff" />
        <KpiCard label="Open" :value="summary.open" trend="stable" icon="pi-circle" color="#ef4444" />
        <KpiCard
          label="Critical"
          :value="summary.critical"
          trend="stable"
          icon="pi-times-circle"
          color="#ef4444"
        />
        <KpiCard label="Resolved" :value="summary.resolved" trend="stable" icon="pi-check-circle" color="#22c55e" />
      </div>

      <!-- Filter bar -->
      <div class="filter-bar">
        <div class="filter-group">
          <span class="filter-group__label">Severity:</span>
          <button
            v-for="sev in ['critical', 'error', 'warning', 'info']"
            :key="sev"
            class="filter-chip"
            :class="{ 'filter-chip--active': isActive('severity', sev) }"
            @click="setFilter('severity', sev)"
          >{{ sev }}</button>
        </div>
        <div class="filter-group">
          <span class="filter-group__label">Status:</span>
          <button
            v-for="st in ['open', 'acknowledged', 'resolved']"
            :key="st"
            class="filter-chip"
            :class="{ 'filter-chip--active': isActive('status', st) }"
            @click="setFilter('status', st)"
          >{{ st }}</button>
        </div>
        <div class="filter-group">
          <span class="filter-group__label">Use Case:</span>
          <button
            v-for="uc in ['Smart Energy', 'Smart City', 'Platform']"
            :key="uc"
            class="filter-chip"
            :class="{ 'filter-chip--active': isActive('useCase', uc) }"
            @click="setFilter('useCase', uc)"
          >{{ uc }}</button>
        </div>
        <span class="p-input-icon-left search-wrap" style="margin-left:auto">
          <i class="pi pi-search"></i>
          <InputText v-model="searchQuery" placeholder="Search alerts..." size="small" style="padding-left:2rem; width:220px" />
        </span>
      </div>

      <!-- Table -->
      <div class="card">
        <div class="table-meta">
          <span class="table-title">{{ filtered.length }} of {{ notifications.alerts.length }} alerts</span>
          <span v-if="notifications.unreadCount > 0" class="unread-badge">
            {{ notifications.unreadCount }} unread
          </span>
        </div>
        <DataTable
          :value="filtered"
          row-hover
          removable-sort
          scrollable
          :row-class="(data) => rowClass(data as AlertEvent)"
          @row-click="(e) => router.push(`/alerts/${(e.data as AlertEvent).id}`)"
        >
          <template #empty>
            <div class="empty-row">No alerts match your current filters.</div>
          </template>

          <Column field="id" header="Event ID" sortable style="width:120px">
            <template #body="{ data }"><code class="id-code">{{ data.id }}</code></template>
          </Column>

          <Column field="useCase" header="Use Case" sortable style="width:130px">
            <template #body="{ data }">
              <span class="uc-badge" :class="`uc-badge--${data.useCase === 'Smart Energy' ? 'energy' : data.useCase === 'Smart City' ? 'city' : 'platform'}`">
                {{ data.useCase }}
              </span>
            </template>
          </Column>

          <Column field="source" header="Source" sortable style="width:180px" />

          <Column field="category" header="Category" sortable style="width:140px" />

          <Column field="severity" header="Severity" sortable style="width:110px">
            <template #body="{ data }"><StatusBadge :status="data.severity" size="sm" /></template>
          </Column>

          <Column field="timestamp" header="Timestamp" sortable style="width:150px">
            <template #body="{ data }"><span class="ts">{{ formatDate(data.timestamp) }}</span></template>
          </Column>

          <Column field="status" header="Status" sortable style="width:130px">
            <template #body="{ data }"><StatusBadge :status="data.status" size="sm" /></template>
          </Column>

          <Column field="message" header="Message">
            <template #body="{ data }">
              <span class="msg-text">{{ data.message }}</span>
            </template>
          </Column>

          <Column header="Actions" style="width:130px">
            <template #body="{ data }">
              <div class="row-actions" @click.stop>
                <Button
                  icon="pi pi-eye"
                  text
                  size="small"
                  title="View detail"
                  @click="router.push(`/alerts/${data.id}`)"
                />
                <Button
                  v-if="data.status === 'open'"
                  icon="pi pi-check"
                  text
                  size="small"
                  severity="success"
                  title="Acknowledge"
                  @click="notifications.acknowledge(data.id)"
                />
                <Button
                  v-if="data.status !== 'resolved'"
                  icon="pi pi-times"
                  text
                  size="small"
                  severity="secondary"
                  title="Resolve"
                  @click="notifications.resolve(data.id)"
                />
              </div>
            </template>
          </Column>
        </DataTable>
      </div>
    </div>
  </div>
</template>

<style scoped>
.live-banner { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #15803d; background: #dcfce7; padding: 0.375rem 1.5rem; border-bottom: 1px solid #bbf7d0; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }

.filter-bar { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; background: var(--facis-surface); border: 1px solid var(--facis-border); border-radius: var(--facis-radius); padding: 0.75rem 1.25rem; box-shadow: var(--facis-shadow); }
.filter-group { display: flex; align-items: center; gap: 0.375rem; }
.filter-group__label { font-size: 0.75rem; font-weight: 500; color: var(--facis-text-secondary); white-space: nowrap; }
.filter-chip { font-size: 0.75rem; font-weight: 500; padding: 0.2rem 0.625rem; border-radius: 20px; border: 1px solid var(--facis-border); background: var(--facis-surface); color: var(--facis-text-secondary); cursor: pointer; transition: all 0.15s; text-transform: capitalize; }
.filter-chip:hover { border-color: var(--facis-primary); color: var(--facis-primary); }
.filter-chip--active { background: var(--facis-primary-light); border-color: var(--facis-primary); color: var(--facis-primary); }
.search-wrap { position: relative; display: flex; align-items: center; }
.search-wrap .pi-search { position: absolute; left: 0.6rem; color: var(--facis-text-muted); font-size: 0.8rem; z-index: 1; }

.table-meta { display: flex; align-items: center; justify-content: space-between; padding: 0.875rem 1.25rem; border-bottom: 1px solid var(--facis-border); }
.table-title { font-size: 0.875rem; font-weight: 600; color: var(--facis-text); }
.unread-badge { font-size: 0.75rem; font-weight: 700; background: var(--facis-error-light); color: #991b1b; padding: 0.15rem 0.5rem; border-radius: 20px; }

.id-code { font-family: var(--facis-font-mono); font-size: 0.75rem; background: var(--facis-surface-2); padding: 0.1rem 0.35rem; border-radius: 3px; }
.uc-badge { font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 20px; white-space: nowrap; }
.uc-badge--energy   { background: #fef3c7; color: #92400e; }
.uc-badge--city     { background: #f3e8ff; color: #7c3aed; }
.uc-badge--platform { background: var(--facis-surface-2); color: var(--facis-text-secondary); }
.ts { font-size: 0.78rem; color: var(--facis-text-secondary); }
.msg-text { font-size: 0.8rem; color: var(--facis-text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.row-actions { display: flex; align-items: center; gap: 0.25rem; }
.empty-row { padding: 2rem; text-align: center; color: var(--facis-text-secondary); font-size: 0.875rem; }

:deep(.row--critical) { background: #fff1f2 !important; }
:deep(.row--error)    { background: #fff8f8 !important; }
</style>
