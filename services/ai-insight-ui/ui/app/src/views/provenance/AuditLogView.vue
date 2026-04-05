<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import DataTablePage from '@/components/common/DataTablePage.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { getSimHealth } from '@/services/api'
import type { AuditEntry } from '@/data/types'

const isLive = ref(false)

// Static base audit entries — inline definitions, no external data file dependency
const baseEntries: AuditEntry[] = [
  { id: 'aud-001', type: 'Schema', timestamp: new Date(Date.now() - 3_600_000).toISOString(), action: 'Schema version published', actor: 'a.bergstrom@facis.local', result: 'success', severity: 'info', details: 'EnergyMeterReading_v2.1.0 published to registry.' },
  { id: 'aud-002', type: 'DataProduct', timestamp: new Date(Date.now() - 7_200_000).toISOString(), action: 'Data product updated', actor: 'system', result: 'success', severity: 'info', details: 'Energy Consumption Timeseries updated with latest meter readings.' },
  { id: 'aud-003', type: 'User', timestamp: new Date(Date.now() - 10_800_000).toISOString(), action: 'User login', actor: 'operator@facis.local', result: 'success', severity: 'info', details: 'User logged in from 10.0.1.22.' },
  { id: 'aud-004', type: 'Integration', timestamp: new Date(Date.now() - 14_400_000).toISOString(), action: 'Modbus adapter config updated', actor: 'r.muller@acme-energy.com', result: 'success', severity: 'info', details: 'Polling interval changed from 60s to 30s on Modbus TCP Gateway.' },
  { id: 'aud-005', type: 'Schema', timestamp: new Date(Date.now() - 21_600_000).toISOString(), action: 'Mapping rule updated', actor: 'a.bergstrom@facis.local', result: 'success', severity: 'info', details: 'IEC-61968 → EnergyMeterReading_v2: unit conversion rule updated.' },
  { id: 'aud-006', type: 'DataProduct', timestamp: new Date(Date.now() - 28_800_000).toISOString(), action: 'Export API access', actor: 'grafana-service@system', result: 'success', severity: 'info', details: 'Energy Consumption Timeseries v2.1.0 queried via API. 8,640 records returned.' },
  { id: 'aud-007', type: 'Integration', timestamp: new Date(Date.now() - 57_600_000).toISOString(), action: 'SunSpec adapter error', actor: 'system', result: 'failure', severity: 'error', details: 'SunSpec inverter connection refused. Auto-recovery failed after 3 attempts.' },
  { id: 'aud-008', type: 'Schema', timestamp: new Date(Date.now() - 72_000_000).toISOString(), action: 'Schema validation run', actor: 'system', result: 'warning', severity: 'warning', details: 'SunSpec/Model101 mapping: 2 optional fields missing from last 48h payloads.' }
]
const sessionEntries = ref<AuditEntry[]>([])

// Append a session audit event
function logAuditEvent(action: string, type: string = 'Access'): void {
  const entry: AuditEntry = {
    id: `aud-sess-${Date.now()}`,
    type,
    timestamp: new Date().toISOString(),
    action,
    actor: sessionStorage.getItem('facis_user') ?? 'current-user@facis.local',
    result: 'success',
    severity: 'info',
    details: `${action} performed by current session user at ${new Date().toLocaleString('en-GB')}.`
  }
  // Persist to sessionStorage
  try {
    const stored = JSON.parse(sessionStorage.getItem('facis_audit_log') ?? '[]') as AuditEntry[]
    stored.unshift(entry)
    sessionStorage.setItem('facis_audit_log', JSON.stringify(stored.slice(0, 50)))
    sessionEntries.value.unshift(entry)
  } catch { /* ignore */ }
}

onMounted(async () => {
  // Load session audit entries
  try {
    const stored = JSON.parse(sessionStorage.getItem('facis_audit_log') ?? '[]') as AuditEntry[]
    sessionEntries.value = stored
  } catch { /* ignore */ }

  // Log this page view
  logAuditEvent('Audit Log viewed', 'Access')

  // Check live system status
  const health = await getSimHealth()
  if (health?.status === 'ok' || health?.status === 'healthy') {
    logAuditEvent('Simulation health check', 'System')
    isLive.value = true
  }
})

const allEntries = computed(() =>
  [...sessionEntries.value, ...baseEntries]
    .filter((e, i, arr) => arr.findIndex(x => x.id === e.id) === i)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
)

// Expanded row tracking
const expandedRowId = ref<string | null>(null)

function toggleRow(id: string): void {
  expandedRowId.value = expandedRowId.value === id ? null : id
}

const columns = [
  { field: 'severity', header: 'Level', type: 'status' as const, sortable: true, width: '90px' },
  { field: 'type', header: 'Type', sortable: true, width: '110px' },
  { field: 'timestamp', header: 'Timestamp', type: 'date' as const, sortable: true, width: '160px' },
  { field: 'action', header: 'Action', sortable: true },
  { field: 'actor', header: 'Actor', sortable: true, width: '200px' },
  { field: 'result', header: 'Result', type: 'status' as const, sortable: true, width: '100px' },
  { field: 'id', header: 'Details', type: 'actions' as const, sortable: false, width: '80px' }
]

const filters = [
  { label: 'Schema', value: 'Schema', field: 'type' },
  { label: 'User', value: 'User', field: 'type' },
  { label: 'Integration', value: 'Integration', field: 'type' },
  { label: 'Access', value: 'Access', field: 'type' },
  { label: 'Errors', value: 'error', field: 'severity' },
  { label: 'Warnings', value: 'warning', field: 'severity' },
  { label: 'Failures', value: 'failure', field: 'result' }
]

const stats = computed(() => ({
  total: allEntries.value.length,
  today: allEntries.value.filter(e => Date.now() - new Date(e.timestamp).getTime() < 86_400_000).length,
  errors: allEntries.value.filter(e => e.severity === 'error').length,
  failures: allEntries.value.filter(e => e.result === 'failure').length
}))

function getExpandedEntry(row: Record<string, unknown>): AuditEntry | undefined {
  return allEntries.value.find(e => e.id === (row as unknown as AuditEntry).id)
}
</script>

<template>
  <div class="view-page">
    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> Session actions logged in real time — {{ sessionEntries.length }} session events recorded
    </div>
    <PageHeader
      title="Audit Log"
      subtitle="Immutable chronological record of all platform actions, schema changes, and access events"
      :breadcrumbs="[{ label: 'Provenance & Audit' }, { label: 'Audit Log' }]"
    >
      <template #actions>
        <Button label="Export CSV" icon="pi pi-download" size="small" outlined />
      </template>
    </PageHeader>

    <div class="view-body">
      <!-- Summary pills -->
      <div class="audit-summary">
        <div class="as-pill">
          <i class="pi pi-list"></i>
          <span><strong>{{ stats.total }}</strong> Total Events</span>
        </div>
        <div class="as-pill">
          <i class="pi pi-calendar"></i>
          <span><strong>{{ stats.today }}</strong> Today</span>
        </div>
        <div class="as-pill as-pill--error">
          <i class="pi pi-times-circle"></i>
          <span><strong>{{ stats.errors }}</strong> Errors</span>
        </div>
        <div class="as-pill as-pill--failure">
          <i class="pi pi-ban"></i>
          <span><strong>{{ stats.failures }}</strong> Failures</span>
        </div>
      </div>

      <DataTablePage
        title="Event Log"
        subtitle="Click the expand button on any row to see full event details"
        :columns="columns"
        :data="allEntries as unknown as Record<string, unknown>[]"
        :filters="filters"
        :search-fields="['action', 'actor', 'type', 'details']"
        empty-icon="pi-history"
        empty-title="No audit events"
      >
        <template #actions="{ row }">
          <Button
            :icon="expandedRowId === (row as unknown as AuditEntry).id ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
            text
            size="small"
            v-tooltip.top="'View Details'"
            @click.stop="toggleRow((row as unknown as AuditEntry).id)"
          />
        </template>
      </DataTablePage>

      <!-- Expanded detail panel -->
      <Transition name="slide-fade">
        <div v-if="expandedRowId" class="expanded-detail">
          <div v-for="entry in allEntries.filter(e => e.id === expandedRowId)" :key="entry.id" class="ed-content">
            <div class="ed-header">
              <div class="ed-title-group">
                <StatusBadge :status="entry.severity" />
                <span class="ed-type">{{ entry.type }}</span>
                <span class="ed-action">{{ entry.action }}</span>
              </div>
              <Button icon="pi pi-times" text size="small" @click="expandedRowId = null" />
            </div>
            <div class="ed-grid">
              <div class="ed-field">
                <span class="ed-label">Actor</span>
                <span class="ed-value">{{ entry.actor }}</span>
              </div>
              <div class="ed-field">
                <span class="ed-label">Timestamp</span>
                <span class="ed-value">{{ new Date(entry.timestamp).toLocaleString('en-GB') }}</span>
              </div>
              <div class="ed-field">
                <span class="ed-label">Result</span>
                <StatusBadge :status="entry.result" size="sm" />
              </div>
              <div class="ed-field">
                <span class="ed-label">Event ID</span>
                <span class="ed-value ed-mono">{{ entry.id }}</span>
              </div>
            </div>
            <div class="ed-details-box">
              <span class="ed-label">Full Details</span>
              <p class="ed-details-text">{{ entry.details }}</p>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.live-banner { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #15803d; background: #dcfce7; padding: 0.375rem 1.5rem; border-bottom: 1px solid #bbf7d0; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.view-page { display: flex; flex-direction: column; }

.view-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.audit-summary {
  display: flex;
  gap: 0.625rem;
  flex-wrap: wrap;
}

.as-pill {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.786rem;
  padding: 0.35rem 0.875rem;
  border-radius: 20px;
  background: var(--facis-surface);
  border: 1px solid var(--facis-border);
  color: var(--facis-text-secondary);
}

.as-pill--error   { background: var(--facis-error-light); border-color: #fca5a5; color: #991b1b; }
.as-pill--failure { background: var(--facis-error-light); border-color: #fca5a5; color: #991b1b; }

.as-pill .pi { font-size: 0.75rem; }

/* Expanded detail */
.expanded-detail {
  background: var(--facis-surface);
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  box-shadow: var(--facis-shadow-md);
  overflow: hidden;
}

.ed-content {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.ed-title-group {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex-wrap: wrap;
}

.ed-type {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  background: var(--facis-surface-2);
  border-radius: 4px;
  color: var(--facis-text-secondary);
}

.ed-action {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--facis-text);
}

.ed-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.75rem;
  background: var(--facis-surface-2);
  border-radius: var(--facis-radius-sm);
  padding: 0.875rem 1rem;
}

.ed-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.ed-label {
  font-size: 0.714rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--facis-text-muted);
  font-weight: 500;
}

.ed-value {
  font-size: 0.875rem;
  color: var(--facis-text);
}

.ed-mono {
  font-family: var(--facis-font-mono);
  font-size: 0.786rem;
}

.ed-details-box {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.ed-details-text {
  font-size: 0.875rem;
  color: var(--facis-text-secondary);
  line-height: 1.6;
  padding: 0.875rem 1rem;
  background: var(--facis-surface-2);
  border-radius: var(--facis-radius-sm);
  border-left: 3px solid var(--facis-primary);
}

/* Transition */
.slide-fade-enter-active {
  transition: all 0.2s ease;
}
.slide-fade-leave-active {
  transition: all 0.15s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
