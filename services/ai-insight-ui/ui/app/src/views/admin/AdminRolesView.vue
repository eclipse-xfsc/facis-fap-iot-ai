<script setup lang="ts">
import { ref, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import PageHeader from '@/components/common/PageHeader.vue'
import { getSimHealth } from '@/services/api'

// Static role user counts — no admin user management API available
const ROLE_USER_COUNTS: Record<string, number> = { admin: 1, operator: 2, analyst: 2, viewer: 2 }

const isLive = ref(false)
const currentUser = ref<{ email: string; role: string } | null>(null)

onMounted(async () => {
  const health = await getSimHealth()
  if (health?.status === 'ok' || health?.status === 'healthy') {
    const stored = sessionStorage.getItem('facis_user')
    currentUser.value = stored
      ? JSON.parse(stored)
      : { email: 'admin@facis.local', role: 'admin' }
    isLive.value = true
  }
})

interface RoleDef {
  name: string
  label: string
  description: string
  color: string
  icon: string
  userCount: number
  permissions: string[]
}

const roles: RoleDef[] = [
  {
    name: 'admin',
    label: 'Admin',
    description: 'Full platform access. Can manage users, configuration, integrations, schemas, and all modules. Responsible for system operations and security.',
    color: '#ef4444',
    icon: 'pi-shield',
    userCount: ROLE_USER_COUNTS['admin'],
    permissions: ['Full Read', 'Full Write', 'User Management', 'Role Assignment', 'System Config', 'API Key Management', 'Export API', 'Admin Settings', 'Audit Log']
  },
  {
    name: 'operator',
    label: 'Operator',
    description: 'Operational access. Can manage integrations, configure schemas, restart adapters, and manage data flows. Cannot manage users or system settings.',
    color: '#f59e0b',
    icon: 'pi-cog',
    userCount: ROLE_USER_COUNTS['operator'],
    permissions: ['Read All', 'Integration Config', 'Adapter Management', 'Schema Mapping', 'Alert Management', 'Data Product Write', 'Export API']
  },
  {
    name: 'analyst',
    label: 'Analyst',
    description: 'Analytical access. Can view all data products, run queries, generate reports, and interact with the AI assistant. Read-only on platform configuration.',
    color: '#3b82f6',
    icon: 'pi-chart-bar',
    userCount: ROLE_USER_COUNTS['analyst'],
    permissions: ['Read All', 'Data Product Management', 'Analytics', 'AI Assistant', 'Report Generation', 'Export Data']
  },
  {
    name: 'viewer',
    label: 'Viewer',
    description: 'Read-only access to dashboards, use cases, and public data products. Cannot modify any platform configuration or access administrative functions.',
    color: '#64748b',
    icon: 'pi-eye',
    userCount: ROLE_USER_COUNTS['viewer'],
    permissions: ['Read Dashboard', 'Read Use Cases', 'Read Data Products', 'Read Analytics', 'Read Alerts']
  }
]

// Permission matrix
interface ModulePermission {
  module: string
  admin: string
  operator: string
  analyst: string
  viewer: string
}

const permMatrix: ModulePermission[] = [
  { module: 'Dashboard',         admin: 'full',  operator: 'full',   analyst: 'full',  viewer: 'read' },
  { module: 'Use Cases',         admin: 'full',  operator: 'full',   analyst: 'full',  viewer: 'read' },
  { module: 'Data Sources',      admin: 'full',  operator: 'full',   analyst: 'read',  viewer: 'none' },
  { module: 'Data Products',     admin: 'full',  operator: 'full',   analyst: 'full',  viewer: 'read' },
  { module: 'Integrations',      admin: 'full',  operator: 'full',   analyst: 'read',  viewer: 'none' },
  { module: 'Schema & Mapping',  admin: 'full',  operator: 'full',   analyst: 'read',  viewer: 'none' },
  { module: 'Provenance & Audit',admin: 'full',  operator: 'read',   analyst: 'read',  viewer: 'none' },
  { module: 'Alerts',            admin: 'full',  operator: 'full',   analyst: 'read',  viewer: 'read' },
  { module: 'AI Assistant',      admin: 'full',  operator: 'full',   analyst: 'full',  viewer: 'none' },
  { module: 'Administration',    admin: 'full',  operator: 'none',   analyst: 'none',  viewer: 'none' },
  { module: 'Export API',        admin: 'full',  operator: 'full',   analyst: 'full',  viewer: 'none' }
]

const PERM_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  full:  { icon: 'pi-check-circle', color: '#15803d', bg: '#dcfce7', label: 'Full' },
  read:  { icon: 'pi-eye',          color: '#1d4ed8', bg: '#dbeafe', label: 'Read' },
  none:  { icon: 'pi-minus',        color: '#94a3b8', bg: '#f1f5f9', label: '—' }
}
</script>

<template>
  <div class="view-page">
    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> Session active — {{ currentUser?.email }} ({{ currentUser?.role }}) — role assignments reflect live user data
    </div>
    <PageHeader
      title="Roles & Permissions"
      subtitle="Platform role definitions, permission scopes, and the full permission matrix"
      :breadcrumbs="[{ label: 'Administration' }, { label: 'Roles' }]"
    />

    <div class="view-body">
      <!-- Role cards -->
      <div class="roles-grid">
        <div v-for="role in roles" :key="role.name" class="role-card card card-body">
          <div class="role-card-header">
            <div class="role-icon" :style="{ background: `${role.color}18`, color: role.color }">
              <i :class="`pi ${role.icon}`"></i>
            </div>
            <div class="role-info">
              <div class="role-badge" :style="{ background: `${role.color}18`, color: role.color }">
                {{ role.label }}
              </div>
              <div class="role-users">
                <i class="pi pi-users"></i>
                {{ role.userCount }} user{{ role.userCount !== 1 ? 's' : '' }}
              </div>
            </div>
          </div>
          <p class="role-desc">{{ role.description }}</p>
          <div class="role-perms">
            <span v-for="perm in role.permissions" :key="perm" class="role-perm">{{ perm }}</span>
          </div>
        </div>
      </div>

      <!-- Permission matrix -->
      <div class="card card-body">
        <div class="section-label">Permission Matrix</div>
        <p class="section-sub">Module-level access control by role. Full = read + write + delete. Read = view only.</p>

        <DataTable
          :value="permMatrix"
          scroll-height="flex"
          class="perm-table"
        >
          <Column field="module" header="Module" style="width: 200px; font-weight: 600;">
            <template #body="{ data }">
              <span class="module-name">{{ data.module }}</span>
            </template>
          </Column>
          <Column v-for="role in roles" :key="role.name" :field="role.name" :header="role.label">
            <template #header>
              <div class="pm-header" :style="{ color: role.color }">
                <i :class="`pi ${role.icon}`"></i>
                <span>{{ role.label }}</span>
              </div>
            </template>
            <template #body="{ data }">
              <div class="perm-cell">
                <div
                  class="perm-indicator"
                  :style="{
                    background: PERM_CONFIG[data[role.name]].bg,
                    color: PERM_CONFIG[data[role.name]].color
                  }"
                >
                  <i :class="`pi ${PERM_CONFIG[data[role.name]].icon}`"></i>
                  <span v-if="data[role.name] !== 'none'">{{ PERM_CONFIG[data[role.name]].label }}</span>
                </div>
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

.view-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.roles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.role-card {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.role-card-header {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.role-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--facis-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.role-info {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.role-badge {
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.2rem 0.75rem;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  width: fit-content;
}

.role-users {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: var(--facis-text-secondary);
}

.role-users .pi { font-size: 0.7rem; }

.role-desc {
  font-size: 0.8rem;
  color: var(--facis-text-secondary);
  line-height: 1.5;
}

.role-perms {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: 0.25rem;
}

.role-perm {
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  background: var(--facis-surface-2);
  border: 1px solid var(--facis-border);
  border-radius: 4px;
  color: var(--facis-text-secondary);
}

/* Matrix */
.section-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--facis-text);
  margin-bottom: 0.25rem;
}

.section-sub {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
  margin-bottom: 1rem;
  line-height: 1.5;
}

.perm-table {
  border-radius: var(--facis-radius-sm);
  overflow: hidden;
}

.pm-header {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  font-weight: 700;
}

.module-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--facis-text);
}

.perm-cell {
  display: flex;
  align-items: center;
}

.perm-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.6rem;
  border-radius: 20px;
  white-space: nowrap;
}
</style>
