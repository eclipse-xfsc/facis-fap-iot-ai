<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Checkbox from 'primevue/checkbox'
import PageHeader from '@/components/common/PageHeader.vue'
import DataTablePage from '@/components/common/DataTablePage.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { getAdminUsers, getAdminRoles } from '@/services/api'
import { auth } from '@/auth'
import type { User, UserRole } from '@/data/types'

const users = ref<User[]>([])
const isLive = ref(false)
const currentUser = ref<{ email: string; role: string } | null>(null)
const loadError = ref<string | null>(null)

function deriveRole(_username: string, roleNames: string[]): UserRole {
  if (roleNames.includes('admin')) return 'admin'
  if (roleNames.includes('operator')) return 'operator'
  if (roleNames.includes('analyst')) return 'analyst'
  return 'viewer'
}

onMounted(async () => {
  currentUser.value = auth.user ? { email: auth.user.email, role: auth.user.role } : null

  // Phase-5 backend: /api/v1/admin/users (Keycloak proxy). Returns one entry per
  // realm user. Roles are not embedded per-user in that payload (Keycloak's
  // /users endpoint does not include role mappings). For now we coarse-classify
  // by email domain — a per-user role lookup would require N+1 admin calls.
  const [usersResp, _rolesResp] = await Promise.all([getAdminUsers(), getAdminRoles()])
  if (!usersResp) {
    loadError.value = 'Could not reach admin API'
    return
  }
  isLive.value = true
  users.value = usersResp.users.map(u => ({
    id: u.id,
    firstName: u.firstName || u.username,
    lastName: u.lastName || '',
    email: u.email || '',
    role: deriveRole(u.username, []),
    lastActive: u.createdTimestamp ? new Date(u.createdTimestamp).toISOString() : '—',
    status: u.enabled ? 'active' : 'invited'
  }))
})

const columns = [
  { field: 'firstName', header: 'First Name', sortable: true },
  { field: 'lastName', header: 'Last Name', sortable: true },
  { field: 'email', header: 'Email', sortable: true },
  { field: 'role', header: 'Role', sortable: true, width: '110px' },
  { field: 'status', header: 'Status', type: 'status' as const, sortable: true, width: '110px' },
  { field: 'lastActive', header: 'Last Active', type: 'date' as const, sortable: true },
  { field: 'id', header: 'Actions', type: 'actions' as const, sortable: false, width: '100px' }
]

const filters = [
  { label: 'Admin', value: 'admin', field: 'role' },
  { label: 'Operator', value: 'operator', field: 'role' },
  { label: 'Analyst', value: 'analyst', field: 'role' },
  { label: 'Viewer', value: 'viewer', field: 'role' },
  { label: 'Active', value: 'active', field: 'status' },
  { label: 'Invited', value: 'invited', field: 'status' }
]

const ROLE_OPTIONS: { label: string; value: UserRole }[] = [
  { label: 'Admin', value: 'admin' },
  { label: 'Operator', value: 'operator' },
  { label: 'Analyst', value: 'analyst' },
  { label: 'Viewer', value: 'viewer' }
]

const SCOPE_OPTIONS = [
  'Dashboard', 'Use Cases', 'Data Sources', 'Data Products',
  'Integrations', 'Schema & Mapping', 'Provenance & Audit',
  'Administration', 'AI Assistant', 'Export API'
]

const ROLE_COLORS: Record<UserRole, string> = {
  admin:    '#ef4444',
  operator: '#f59e0b',
  analyst:  '#3b82f6',
  viewer:   '#64748b'
}

// ─── Invite Dialog ───────────────────────────────────────────────────────────
const showInviteDialog = ref(false)
const inviteSending = ref(false)
const inviteForm = reactive({
  firstName: '',
  lastName: '',
  email: '',
  role: 'viewer' as UserRole,
  expiry: null as Date | null,
  message: ''
})

function openInvite(): void {
  Object.assign(inviteForm, { firstName: '', lastName: '', email: '', role: 'viewer', expiry: null, message: '' })
  showInviteDialog.value = true
}

function sendInvite(): void {
  if (!inviteForm.email || !inviteForm.firstName) return
  inviteSending.value = true
  setTimeout(() => {
    users.value.push({
      id: `u-${Date.now()}`,
      firstName: inviteForm.firstName,
      lastName: inviteForm.lastName,
      email: inviteForm.email,
      role: inviteForm.role,
      lastActive: '—',
      status: 'invited'
    })
    inviteSending.value = false
    showInviteDialog.value = false
  }, 1200)
}

// ─── Manage Dialog ───────────────────────────────────────────────────────────
const showManageDialog = ref(false)
const manageSaving = ref(false)
const manageTarget = ref<User | null>(null)
const manageForm = reactive({
  firstName: '',
  lastName: '',
  email: '',
  role: 'viewer' as UserRole,
  expiry: null as Date | null,
  scopes: [] as string[]
})

function openManage(row: Record<string, unknown>): void {
  const u = row as unknown as User
  manageTarget.value = u
  Object.assign(manageForm, {
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    role: u.role,
    expiry: null,
    scopes: ['Dashboard', 'Use Cases', 'Data Products']
  })
  showManageDialog.value = true
}

function saveManage(): void {
  if (!manageTarget.value) return
  manageSaving.value = true
  setTimeout(() => {
    const idx = users.value.findIndex(u => u.id === manageTarget.value!.id)
    if (idx !== -1) {
      users.value[idx] = {
        ...users.value[idx],
        firstName: manageForm.firstName,
        lastName: manageForm.lastName,
        email: manageForm.email,
        role: manageForm.role
      }
    }
    manageSaving.value = false
    showManageDialog.value = false
  }, 1000)
}
</script>

<template>
  <div class="view-page">
    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> Live — logged in as {{ currentUser?.email }} ({{ currentUser?.role }})
    </div>
    <PageHeader
      title="User Management"
      subtitle="Manage platform users, roles, and access permissions"
      :breadcrumbs="[{ label: 'Administration' }, { label: 'Users' }]"
    >
      <template #actions>
        <Button label="Invite User" icon="pi pi-user-plus" size="small" @click="openInvite" />
      </template>
    </PageHeader>

    <div class="view-body">
      <!-- Role distribution summary -->
      <div class="role-chips">
        <div v-for="opt in ROLE_OPTIONS" :key="opt.value" class="role-chip" :style="{ background: `${ROLE_COLORS[opt.value]}18`, color: ROLE_COLORS[opt.value] }">
          <span class="rc-role">{{ opt.label }}</span>
          <span class="rc-count">{{ users.filter(u => u.role === opt.value).length }}</span>
        </div>
      </div>

      <DataTablePage
        title="Platform Users"
        :subtitle="`${users.length} users registered`"
        :columns="columns"
        :data="users as unknown as Record<string, unknown>[]"
        :filters="filters"
        :search-fields="['firstName', 'lastName', 'email', 'role']"
        empty-icon="pi-users"
        empty-title="No users found"
      >
        <template #actions="{ row }">
          <Button
            icon="pi pi-pencil"
            text
            size="small"
            v-tooltip.top="'Manage User'"
            @click.stop="openManage(row)"
          />
          <Button
            icon="pi pi-trash"
            text
            size="small"
            severity="danger"
            v-tooltip.top="'Deactivate'"
          />
        </template>
      </DataTablePage>
    </div>

    <!-- ─── Invite Dialog ─────────────────────────────────────────────────── -->
    <Dialog
      v-model:visible="showInviteDialog"
      header="Invite New User"
      :style="{ width: '520px' }"
      modal
    >
      <div class="dialog-form">
        <div class="df-row">
          <div class="df-field">
            <label class="df-label">First Name <span class="df-req">*</span></label>
            <InputText v-model="inviteForm.firstName" placeholder="Alice" />
          </div>
          <div class="df-field">
            <label class="df-label">Last Name</label>
            <InputText v-model="inviteForm.lastName" placeholder="Bergström" />
          </div>
        </div>
        <div class="df-field">
          <label class="df-label">Email Address <span class="df-req">*</span></label>
          <InputText v-model="inviteForm.email" placeholder="user@company.com" type="email" style="width: 100%" />
        </div>
        <div class="df-row">
          <div class="df-field">
            <label class="df-label">Role</label>
            <Select
              v-model="inviteForm.role"
              :options="ROLE_OPTIONS"
              option-label="label"
              option-value="value"
              placeholder="Select role"
            />
          </div>
          <div class="df-field">
            <label class="df-label">Access Expiry (optional)</label>
            <DatePicker v-model="inviteForm.expiry" placeholder="No expiry" date-format="dd/mm/yy" />
          </div>
        </div>
        <div class="df-field">
          <label class="df-label">Personal Message (optional)</label>
          <Textarea
            v-model="inviteForm.message"
            placeholder="Welcome to FACIS. You have been granted access to the platform..."
            :rows="3"
            style="width: 100%; resize: vertical"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" outlined size="small" @click="showInviteDialog = false" />
        <Button
          label="Send Invitation"
          icon="pi pi-send"
          :loading="inviteSending"
          :disabled="!inviteForm.email || !inviteForm.firstName"
          size="small"
          @click="sendInvite"
        />
      </template>
    </Dialog>

    <!-- ─── Manage Dialog ────────────────────────────────────────────────── -->
    <Dialog
      v-model:visible="showManageDialog"
      :header="`Manage — ${manageTarget?.firstName} ${manageTarget?.lastName}`"
      :style="{ width: '560px' }"
      modal
    >
      <div class="dialog-form">
        <div class="df-row">
          <div class="df-field">
            <label class="df-label">First Name</label>
            <InputText v-model="manageForm.firstName" />
          </div>
          <div class="df-field">
            <label class="df-label">Last Name</label>
            <InputText v-model="manageForm.lastName" />
          </div>
        </div>
        <div class="df-field">
          <label class="df-label">Email</label>
          <InputText v-model="manageForm.email" type="email" style="width: 100%" />
        </div>
        <div class="df-row">
          <div class="df-field">
            <label class="df-label">Role</label>
            <Select
              v-model="manageForm.role"
              :options="ROLE_OPTIONS"
              option-label="label"
              option-value="value"
            />
          </div>
          <div class="df-field">
            <label class="df-label">Access Expiry</label>
            <DatePicker v-model="manageForm.expiry" placeholder="No expiry" date-format="dd/mm/yy" />
          </div>
        </div>
        <div class="df-field">
          <label class="df-label">Access Scopes</label>
          <div class="scope-grid">
            <div v-for="scope in SCOPE_OPTIONS" :key="scope" class="scope-item">
              <Checkbox
                v-model="manageForm.scopes"
                :value="scope"
                :input-id="`scope-${scope}`"
              />
              <label :for="`scope-${scope}`" class="scope-label">{{ scope }}</label>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" outlined size="small" @click="showManageDialog = false" />
        <Button
          label="Save Changes"
          icon="pi pi-save"
          :loading="manageSaving"
          size="small"
          @click="saveManage"
        />
      </template>
    </Dialog>
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

.role-chips {
  display: flex;
  gap: 0.625rem;
  flex-wrap: wrap;
}

.role-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.875rem;
  border-radius: 20px;
  font-size: 0.786rem;
  font-weight: 600;
}

.rc-role { text-transform: capitalize; }
.rc-count { font-size: 1rem; font-weight: 700; }

/* Dialog form */
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.25rem 0;
}

.df-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.875rem;
}

.df-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.df-label {
  font-size: 0.786rem;
  font-weight: 600;
  color: var(--facis-text-secondary);
}

.df-req { color: var(--facis-error); }

.scope-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  background: var(--facis-surface-2);
  border-radius: var(--facis-radius-sm);
  padding: 0.75rem;
}

.scope-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.scope-label {
  font-size: 0.8rem;
  color: var(--facis-text);
  cursor: pointer;
}
</style>
