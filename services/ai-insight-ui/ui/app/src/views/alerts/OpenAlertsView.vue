<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useNotificationsStore } from '@/stores/notifications'
import type { AlertEvent } from '@/data/types'

const router        = useRouter()
const notifications = useNotificationsStore()

const openAlerts = computed(() => notifications.openAlerts)
const criticalOpen = computed(() => openAlerts.value.filter(a => a.severity === 'critical').length)
const errorOpen    = computed(() => openAlerts.value.filter(a => a.severity === 'error').length)
const warningOpen  = computed(() => openAlerts.value.filter(a => a.severity === 'warning').length)

// Sorted: critical first, then by timestamp desc
const sortedAlerts = computed(() =>
  [...openAlerts.value].sort((a, b) => {
    const severityOrder: Record<string, number> = { critical: 0, error: 1, warning: 2, info: 3 }
    const sA = severityOrder[a.severity] ?? 4
    const sB = severityOrder[b.severity] ?? 4
    if (sA !== sB) return sA - sB
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  })
)

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch { return ts }
}

function timeSince(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Open Alerts"
      :subtitle="`${openAlerts.length} alerts requiring attention — sorted by severity`"
      :breadcrumbs="[{ label: 'Alerts & Events' }, { label: 'Open' }]"
    >
      <template #actions>
        <Button
          v-if="openAlerts.length > 0"
          icon="pi pi-check-square"
          label="Acknowledge All"
          size="small"
          outlined
          @click="openAlerts.forEach(a => notifications.acknowledge(a.id))"
        />
      </template>
    </PageHeader>

    <div class="view-body">
      <!-- Count header badge -->
      <div class="count-header">
        <div class="count-badge-large" :class="{ 'count-badge-large--empty': openAlerts.length === 0 }">
          <i :class="openAlerts.length === 0 ? 'pi pi-check-circle' : 'pi pi-bell'" />
          <span>{{ openAlerts.length }} Open Alert{{ openAlerts.length !== 1 ? 's' : '' }}</span>
        </div>
      </div>

      <!-- KPIs -->
      <div class="grid-kpi">
        <KpiCard label="Open Alerts" :value="openAlerts.length" trend="stable" icon="pi-bell" color="#005fff" />
        <KpiCard label="Critical" :value="criticalOpen" trend="stable" icon="pi-times-circle" color="#ef4444" />
        <KpiCard label="Error" :value="errorOpen" trend="stable" icon="pi-exclamation-circle" color="#ef4444" />
        <KpiCard label="Warning" :value="warningOpen" trend="stable" icon="pi-exclamation-triangle" color="#f59e0b" />
      </div>

      <!-- Empty state -->
      <div v-if="openAlerts.length === 0" class="card card-body empty-state-card">
        <div class="empty-icon"><i class="pi pi-check-circle"></i></div>
        <div class="empty-title">All Clear</div>
        <p class="empty-msg">No open alerts. All alerts have been acknowledged or resolved.</p>
      </div>

      <!-- Table -->
      <div v-else class="card">
        <div class="table-meta">
          <span class="table-title">{{ sortedAlerts.length }} open alerts — sorted by severity</span>
        </div>
        <DataTable
          :value="sortedAlerts"
          row-hover
          removable-sort
          scrollable
          @row-click="(e) => router.push(`/alerts/${(e.data as AlertEvent).id}`)"
        >
          <Column field="severity" header="Severity" sortable style="width:110px">
            <template #body="{ data }"><StatusBadge :status="data.severity" size="sm" /></template>
          </Column>

          <Column field="id" header="Event ID" sortable style="width:120px">
            <template #body="{ data }"><code class="id-code">{{ data.id }}</code></template>
          </Column>

          <Column field="useCase" header="Use Case" sortable style="width:130px">
            <template #body="{ data }">
              <span :class="['uc-badge', data.useCase === 'Smart Energy' ? 'uc-badge--energy' : data.useCase === 'Smart City' ? 'uc-badge--city' : 'uc-badge--platform']">
                {{ data.useCase }}
              </span>
            </template>
          </Column>

          <Column field="source" header="Source" sortable style="width:180px" />

          <Column field="category" header="Category" sortable style="width:140px" />

          <Column field="message" header="Message">
            <template #body="{ data }">
              <span class="msg-text">{{ data.message }}</span>
            </template>
          </Column>

          <Column field="timestamp" header="Time" sortable style="width:140px">
            <template #body="{ data }">
              <div class="time-col">
                <span class="ts">{{ formatDate(data.timestamp) }}</span>
                <span class="ts-ago">{{ timeSince(data.timestamp) }}</span>
              </div>
            </template>
          </Column>

          <Column header="Actions" style="width:150px">
            <template #body="{ data }">
              <div class="row-actions" @click.stop>
                <Button
                  icon="pi pi-eye"
                  text
                  size="small"
                  @click="router.push(`/alerts/${data.id}`)"
                />
                <Button
                  label="Ack"
                  icon="pi pi-check"
                  size="small"
                  severity="success"
                  text
                  @click="notifications.acknowledge(data.id)"
                />
                <Button
                  label="Resolve"
                  icon="pi pi-times"
                  size="small"
                  text
                  severity="secondary"
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
.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }

.count-header { display: flex; align-items: center; }
.count-badge-large { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 1rem; font-weight: 700; padding: 0.5rem 1.25rem; border-radius: var(--facis-radius-sm); background: var(--facis-error-light); color: #991b1b; }
.count-badge-large--empty { background: var(--facis-success-light); color: #15803d; }

.table-meta { display: flex; align-items: center; padding: 0.875rem 1.25rem; border-bottom: 1px solid var(--facis-border); }
.table-title { font-size: 0.875rem; font-weight: 600; color: var(--facis-text); }

.id-code { font-family: var(--facis-font-mono); font-size: 0.75rem; background: var(--facis-surface-2); padding: 0.1rem 0.35rem; border-radius: 3px; }
.uc-badge { font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 20px; white-space: nowrap; }
.uc-badge--energy   { background: #fef3c7; color: #92400e; }
.uc-badge--city     { background: #f3e8ff; color: #7c3aed; }
.uc-badge--platform { background: var(--facis-surface-2); color: var(--facis-text-secondary); }
.msg-text { font-size: 0.8rem; color: var(--facis-text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.time-col { display: flex; flex-direction: column; gap: 0.1rem; }
.ts { font-size: 0.78rem; color: var(--facis-text-secondary); }
.ts-ago { font-size: 0.72rem; color: var(--facis-text-muted); }
.row-actions { display: flex; align-items: center; gap: 0.125rem; }

.empty-state-card { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem; gap: 0.75rem; }
.empty-icon { font-size: 2.5rem; color: var(--facis-success); }
.empty-title { font-size: 1.1rem; font-weight: 600; color: var(--facis-text); }
.empty-msg { font-size: 0.875rem; color: var(--facis-text-secondary); text-align: center; }
</style>
