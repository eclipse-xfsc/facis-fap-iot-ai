<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import DataTablePage from '@/components/common/DataTablePage.vue'

interface Session {
  id: string
  userName: string
  role: string
  ip: string
  location: string
  lastActivity: string
  userAgent: string
  status: 'active' | 'idle' | 'expired'
}

interface AccessEvent {
  id: string
  type: 'login' | 'logout' | 'role_change' | 'failed_login' | 'api_key_created' | 'permission_denied'
  timestamp: string
  actor: string
  target?: string
  ip: string
  result: 'success' | 'failure'
  details: string
}

const sessions: Session[] = [
  { id: 'sess-001', userName: 'a.bergstrom@facis.local',  role: 'admin',    ip: '10.0.1.10', location: 'Stockholm, SE', lastActivity: new Date(Date.now() - 120_000).toISOString(),   userAgent: 'Chrome 123 / macOS',   status: 'active' },
  { id: 'sess-002', userName: 'r.muller@acme-energy.com', role: 'operator', ip: '10.0.2.44', location: 'Berlin, DE',    lastActivity: new Date(Date.now() - 600_000).toISOString(),   userAgent: 'Firefox 124 / Windows', status: 'active' },
  { id: 'sess-003', userName: 'p.nair@facis.local',       role: 'analyst',  ip: '10.0.1.22', location: 'Mumbai, IN',    lastActivity: new Date(Date.now() - 1_800_000).toISOString(), userAgent: 'Chrome 123 / Linux',    status: 'idle' },
  { id: 'sess-004', userName: 'j.eriksson@city.gov',      role: 'viewer',   ip: '10.0.3.5',  location: 'Gothenburg, SE',lastActivity: new Date(Date.now() - 3_600_000).toISOString(), userAgent: 'Safari 17 / macOS',     status: 'idle' }
]

const events: AccessEvent[] = [
  { id: 'ev-001', type: 'login',            timestamp: new Date(Date.now() - 120_000).toISOString(),    actor: 'a.bergstrom@facis.local',  ip: '10.0.1.10', result: 'success', details: 'Logged in from Stockholm, SE.' },
  { id: 'ev-002', type: 'login',            timestamp: new Date(Date.now() - 600_000).toISOString(),    actor: 'r.muller@acme-energy.com', ip: '10.0.2.44', result: 'success', details: 'Logged in from Berlin, DE.' },
  { id: 'ev-003', type: 'role_change',      timestamp: new Date(Date.now() - 3_600_000).toISOString(),  actor: 'a.bergstrom@facis.local',  ip: '10.0.1.10', result: 'success', details: 'Role updated.', target: 'p.nair@facis.local → analyst' },
  { id: 'ev-004', type: 'failed_login',     timestamp: new Date(Date.now() - 7_200_000).toISOString(),  actor: 'unknown@external.com',     ip: '185.23.1.9',result: 'failure', details: 'Invalid credentials. 3 consecutive failures.' },
  { id: 'ev-005', type: 'api_key_created',  timestamp: new Date(Date.now() - 14_400_000).toISOString(), actor: 'a.bergstrom@facis.local',  ip: '10.0.1.10', result: 'success', details: 'New API key issued for grafana-service.' },
  { id: 'ev-006', type: 'permission_denied',timestamp: new Date(Date.now() - 28_800_000).toISOString(), actor: 'j.eriksson@city.gov',      ip: '10.0.3.5',  result: 'failure', details: 'Access to Administration module denied. Viewer role insufficient.' },
  { id: 'ev-007', type: 'logout',           timestamp: new Date(Date.now() - 43_200_000).toISOString(), actor: 'p.nair@facis.local',       ip: '10.0.1.22', result: 'success', details: 'Session terminated.' },
  { id: 'ev-008', type: 'failed_login',     timestamp: new Date(Date.now() - 57_600_000).toISOString(), actor: 'unknown@external.com',     ip: '91.102.0.4',result: 'failure', details: 'Invalid credentials.' }
]

const stats = computed(() => ({
  activeSessions: sessions.filter(s => s.status === 'active').length,
  failedLogins24h: events.filter(e => e.type === 'failed_login' && Date.now() - new Date(e.timestamp).getTime() < 86_400_000).length,
  roleChanges7d: events.filter(e => e.type === 'role_change' && Date.now() - new Date(e.timestamp).getTime() < 604_800_000).length,
  apiKeysActive: 2
}))

const sessionColumns = [
  { field: 'userName', header: 'User', sortable: true },
  { field: 'role', header: 'Role', sortable: true, width: '100px' },
  { field: 'ip', header: 'IP Address', sortable: true, width: '130px' },
  { field: 'location', header: 'Location', sortable: true, width: '130px' },
  { field: 'lastActivity', header: 'Last Activity', type: 'date' as const, sortable: true },
  { field: 'userAgent', header: 'Client', sortable: false },
  { field: 'status', header: 'Status', type: 'status' as const, sortable: true, width: '100px' },
  { field: 'id', header: 'Actions', type: 'actions' as const, sortable: false, width: '80px' }
]

const EVENT_TYPE_CONFIG: Record<AccessEvent['type'], { icon: string; color: string; bg: string; label: string }> = {
  login:              { icon: 'pi-sign-in',            color: '#15803d', bg: '#dcfce7', label: 'Login' },
  logout:             { icon: 'pi-sign-out',           color: '#64748b', bg: '#f1f5f9', label: 'Logout' },
  role_change:        { icon: 'pi-user-edit',          color: '#7c3aed', bg: '#ede9fe', label: 'Role Change' },
  failed_login:       { icon: 'pi-ban',                color: '#991b1b', bg: '#fee2e2', label: 'Failed Login' },
  api_key_created:    { icon: 'pi-key',                color: '#1d4ed8', bg: '#dbeafe', label: 'API Key' },
  permission_denied:  { icon: 'pi-lock',               color: '#92400e', bg: '#fef3c7', label: 'Access Denied' }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit'
  })
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Access Control"
      subtitle="Active sessions, recent access events, and security summary"
      :breadcrumbs="[{ label: 'Administration' }, { label: 'Access Control' }]"
    />

    <div class="view-body">
      <!-- Security KPIs -->
      <div class="grid-kpi">
        <KpiCard
          label="Active Sessions"
          :value="stats.activeSessions"
          unit=""
          trend="stable"
          icon="pi-users"
          color="#3b82f6"
        />
        <KpiCard
          label="Failed Logins (24h)"
          :value="stats.failedLogins24h"
          unit=""
          :trend="stats.failedLogins24h > 3 ? 'up' : 'stable'"
          icon="pi-ban"
          color="#ef4444"
        />
        <KpiCard
          label="Role Changes (7d)"
          :value="stats.roleChanges7d"
          unit=""
          trend="stable"
          icon="pi-user-edit"
          color="#8b5cf6"
        />
        <KpiCard
          label="Active API Keys"
          :value="stats.apiKeysActive"
          unit=""
          trend="stable"
          icon="pi-key"
          color="#f59e0b"
        />
      </div>

      <!-- Active sessions table -->
      <DataTablePage
        title="Active Sessions"
        :subtitle="`${stats.activeSessions} sessions currently active`"
        :columns="sessionColumns"
        :data="sessions as unknown as Record<string, unknown>[]"
        empty-icon="pi-users"
        empty-title="No active sessions"
      >
        <template #actions>
          <Button
            icon="pi pi-times"
            text
            size="small"
            severity="danger"
            v-tooltip.top="'Terminate Session'"
          />
        </template>
      </DataTablePage>

      <!-- Recent access events -->
      <div class="card card-body">
        <div class="events-header">
          <h3 class="section-label">Recent Access Events</h3>
        </div>

        <div class="events-list">
          <div v-for="event in events" :key="event.id" class="event-row">
            <div
              class="event-type-badge"
              :style="{
                background: EVENT_TYPE_CONFIG[event.type].bg,
                color: EVENT_TYPE_CONFIG[event.type].color
              }"
            >
              <i :class="`pi ${EVENT_TYPE_CONFIG[event.type].icon}`"></i>
              <span>{{ EVENT_TYPE_CONFIG[event.type].label }}</span>
            </div>

            <div class="event-body">
              <div class="eb-actor">{{ event.actor }}</div>
              <div class="eb-detail">{{ event.details }}</div>
              <div v-if="event.target" class="eb-target">
                <i class="pi pi-arrow-right"></i>
                <span>{{ event.target }}</span>
              </div>
            </div>

            <div class="event-meta">
              <span class="em-ip">{{ event.ip }}</span>
              <span class="em-time">{{ relativeTime(event.timestamp) }}</span>
              <StatusBadge :status="event.result" size="sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-page { display: flex; flex-direction: column; }

.view-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--facis-text);
}

.events-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.875rem;
}

.events-list {
  display: flex;
  flex-direction: column;
}

.event-row {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.875rem 0;
  border-bottom: 1px solid var(--facis-border);
}

.event-row:last-child {
  border-bottom: none;
}

.event-type-badge {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.714rem;
  font-weight: 600;
  padding: 0.25rem 0.625rem;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 110px;
  justify-content: center;
}

.event-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.eb-actor {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--facis-text);
}

.eb-detail {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
  line-height: 1.4;
}

.eb-target {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  color: var(--facis-primary);
  margin-top: 0.1rem;
}

.eb-target .pi { font-size: 0.65rem; }

.event-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  flex-shrink: 0;
  min-width: 130px;
}

.em-ip {
  font-size: 0.75rem;
  font-family: var(--facis-font-mono);
  color: var(--facis-text-secondary);
}

.em-time {
  font-size: 0.714rem;
  color: var(--facis-text-muted);
}
</style>
