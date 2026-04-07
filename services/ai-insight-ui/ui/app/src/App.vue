<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Toast from 'primevue/toast'
import Button from 'primevue/button'
import Avatar from 'primevue/avatar'
import Badge from 'primevue/badge'
import InputText from 'primevue/inputtext'
import Menu from 'primevue/menu'
import OverlayPanel from 'primevue/overlaypanel'
import { auth, logout, getRole } from '@/auth'
import { useNotificationsStore } from '@/stores/notifications'
import StatusBadge from '@/components/common/StatusBadge.vue'
import type { NavItem } from '@/data/types'

// ─── Global search ────────────────────────────────────────────────────────────

interface SearchResult {
  label: string
  description: string
  path: string
  icon: string
  category: string
}

const SEARCH_INDEX: SearchResult[] = [
  // Dashboard
  { label: 'Dashboard', description: 'Platform overview and live KPIs', path: '/dashboard', icon: 'pi-home', category: 'Navigation' },

  // Smart Energy
  { label: 'Energy Overview', description: 'Live energy consumption and PV generation', path: '/use-cases/smart-energy/overview', icon: 'pi-bolt', category: 'Smart Energy' },
  { label: 'Energy Assets', description: 'Meters, PV systems and consumers', path: '/use-cases/smart-energy/assets', icon: 'pi-gauge', category: 'Smart Energy' },
  { label: 'Energy Context', description: 'Price, weather and environmental data', path: '/use-cases/smart-energy/context', icon: 'pi-cloud', category: 'Smart Energy' },
  { label: 'AI Energy Insights', description: 'AI-generated anomaly detection and recommendations', path: '/use-cases/smart-energy/insights', icon: 'pi-sparkles', category: 'Smart Energy' },
  { label: 'Energy Data Products', description: 'Published energy data products', path: '/use-cases/smart-energy/data-products', icon: 'pi-box', category: 'Smart Energy' },

  // Smart City
  { label: 'City Overview', description: 'Smart city zones and lighting status', path: '/use-cases/smart-city/overview', icon: 'pi-map', category: 'Smart City' },
  { label: 'Lighting Zones', description: 'All lighting zones and DALI status', path: '/use-cases/smart-city/zones', icon: 'pi-map-marker', category: 'Smart City' },
  { label: 'City Context', description: 'Traffic, events and environmental context', path: '/use-cases/smart-city/context', icon: 'pi-cloud', category: 'Smart City' },
  { label: 'City Analytics', description: 'Lighting efficiency and traffic analytics', path: '/use-cases/smart-city/analytics', icon: 'pi-chart-bar', category: 'Smart City' },
  { label: 'City Data Products', description: 'Published smart city data products', path: '/use-cases/smart-city/data-products', icon: 'pi-box', category: 'Smart City' },

  // Data Sources
  { label: 'All Data Sources', description: 'MQTT, Modbus, REST and OPC-UA sources', path: '/data-sources/all', icon: 'pi-database', category: 'Data Sources' },
  { label: 'Source Types', description: 'Browse sources by protocol type', path: '/data-sources/types', icon: 'pi-list', category: 'Data Sources' },
  { label: 'Source Health', description: 'Connectivity and quality monitoring', path: '/data-sources/health', icon: 'pi-heart', category: 'Data Sources' },
  { label: 'Raw Messages', description: 'Live raw telemetry message stream', path: '/data-sources/raw', icon: 'pi-code', category: 'Data Sources' },

  // Data Products
  { label: 'All Data Products', description: 'All published data products', path: '/data-products/all', icon: 'pi-box', category: 'Data Products' },
  { label: 'Energy Products', description: 'Energy domain data products', path: '/data-products/energy', icon: 'pi-bolt', category: 'Data Products' },
  { label: 'City Products', description: 'Smart city domain data products', path: '/data-products/smart-city', icon: 'pi-building', category: 'Data Products' },

  // Analytics
  { label: 'Analytics Overview', description: 'Cross-domain analytics summary', path: '/analytics/overview', icon: 'pi-chart-bar', category: 'Analytics' },
  { label: 'Trend Analysis', description: 'Time-series trend visualisations', path: '/analytics/trends', icon: 'pi-chart-line', category: 'Analytics' },
  { label: 'Correlations', description: 'Cross-metric correlation analysis', path: '/analytics/correlations', icon: 'pi-sitemap', category: 'Analytics' },
  { label: 'Anomaly Detection', description: 'Statistical anomaly alerts', path: '/analytics/anomalies', icon: 'pi-exclamation-triangle', category: 'Analytics' },
  { label: 'Recommendations', description: 'AI-generated optimisation recommendations', path: '/analytics/recommendations', icon: 'pi-lightbulb', category: 'Analytics' },

  // Alerts
  { label: 'All Alerts', description: 'All platform alerts and events', path: '/alerts/all', icon: 'pi-bell', category: 'Alerts' },
  { label: 'Open Alerts', description: 'Unresolved and active alerts', path: '/alerts/open', icon: 'pi-exclamation-circle', category: 'Alerts' },

  // Integrations
  { label: 'Integrations Overview', description: 'Connected integration overview', path: '/integrations/overview', icon: 'pi-link', category: 'Integrations' },
  { label: 'Adapters', description: 'Protocol adapters and connectors', path: '/integrations/adapters', icon: 'pi-server', category: 'Integrations' },
  { label: 'Pipelines', description: 'Data ingestion pipelines', path: '/integrations/pipelines', icon: 'pi-arrows-alt', category: 'Integrations' },

  // Schema
  { label: 'Local Schemas', description: 'Platform-local data schemas', path: '/schemas/local', icon: 'pi-sitemap', category: 'Schema & Mapping' },
  { label: 'Remote Schemas', description: 'External reference schemas', path: '/schemas/remote', icon: 'pi-globe', category: 'Schema & Mapping' },
  { label: 'Mappings', description: 'Source-to-schema field mappings', path: '/schemas/mappings', icon: 'pi-arrows-h', category: 'Schema & Mapping' },

  // Provenance
  { label: 'Provenance Overview', description: 'Data lineage and provenance graph', path: '/provenance/overview', icon: 'pi-history', category: 'Provenance' },
  { label: 'Audit Log', description: 'Full platform audit trail', path: '/provenance/audit', icon: 'pi-list', category: 'Provenance' },
  { label: 'Schema Compare', description: 'Schema version comparison', path: '/provenance/compare', icon: 'pi-code', category: 'Provenance' },
  { label: 'Data References', description: 'Cross-schema data references', path: '/provenance/references', icon: 'pi-link', category: 'Provenance' },

  // Admin
  { label: 'User Management', description: 'Manage users, roles and permissions', path: '/admin/users', icon: 'pi-users', category: 'Administration' },
  { label: 'Roles & Permissions', description: 'RBAC role configuration', path: '/admin/roles', icon: 'pi-shield', category: 'Administration' },
  { label: 'System Monitoring', description: 'Node health and service status', path: '/admin/monitoring', icon: 'pi-desktop', category: 'Administration' },
  { label: 'Platform Settings', description: 'Global platform configuration', path: '/admin/settings', icon: 'pi-cog', category: 'Administration' },

  // AI
  { label: 'AI Assistant', description: 'Natural language IoT data interface', path: '/ai-assistant', icon: 'pi-comments', category: 'AI' }
]

const router = useRouter()
const route = useRoute()
// auth is imported from @/auth (reactive module, not Pinia)
const notifications = useNotificationsStore()

const sidebarCollapsed = ref(false)
const mobileOpen = ref(false)
const expandedGroups = ref<Set<string>>(new Set(['Use Cases']))
const notificationPanel = ref<InstanceType<typeof OverlayPanel> | null>(null)
const userMenu = ref<InstanceType<typeof Menu> | null>(null)

// ─── Search state ────────────────────────────────────────────────────────────
const searchQuery = ref('')
const searchOpen = ref(false)
const searchInputRef = ref<HTMLInputElement | null>(null)

const searchResults = computed((): SearchResult[] => {
  const q = searchQuery.value.trim().toLowerCase()
  if (q.length < 2) return []
  return SEARCH_INDEX.filter(item =>
    item.label.toLowerCase().includes(q) ||
    item.description.toLowerCase().includes(q) ||
    item.category.toLowerCase().includes(q)
  ).slice(0, 12)
})

function onSearchInput(): void {
  searchOpen.value = searchQuery.value.trim().length >= 2
}

function onSearchFocus(): void {
  if (searchQuery.value.trim().length >= 2) searchOpen.value = true
}

function onSearchBlur(): void {
  // Delay to allow click on results to fire
  setTimeout(() => { searchOpen.value = false }, 180)
}

function selectSearchResult(result: SearchResult): void {
  router.push(result.path)
  searchQuery.value = ''
  searchOpen.value = false
}

function onSearchKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    searchQuery.value = ''
    searchOpen.value = false
  }
}

// ─── Global route loading bar ────────────────────────────────────────────────
const routeLoading = ref(false)

router.beforeEach(() => { routeLoading.value = true })
router.afterEach(() => { routeLoading.value = false })

// Auto-collapse on small screens
// < 1280px → icon-only mode (collapsed sidebar stays in layout)
// < 768px  → overlay mode (sidebar slides over content, toggled by hamburger)
const handleResize = () => {
  if (window.innerWidth < 1280) {
    sidebarCollapsed.value = true
  } else {
    sidebarCollapsed.value = false
  }
  if (window.innerWidth >= 768) {
    mobileOpen.value = false
  }
}

onMounted(() => {
  handleResize()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

// Close mobile sidebar on route change
watch(() => route.path, () => {
  mobileOpen.value = false
})

const userInitials = computed(() => {
  if (!auth.user) return 'U'
  return `${auth.user.firstName[0] ?? ''}${auth.user.lastName[0] ?? ''}`.toUpperCase()
})

const userDisplayName = computed(() =>
  auth.user ? `${auth.user.firstName} ${auth.user.lastName}` : 'Guest'
)

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: 'pi-home', to: '/dashboard' },
  {
    label: 'Use Cases', icon: 'pi-briefcase', children: [
      { label: 'Smart Energy', icon: 'pi-bolt', to: '/use-cases/smart-energy/overview' },
      { label: 'Smart City', icon: 'pi-map', to: '/use-cases/smart-city/overview' }
    ]
  },
  { label: 'Data Sources', icon: 'pi-database', to: '/data-sources/all' },
  { label: 'Data Products', icon: 'pi-box', to: '/data-products/all' },
  { label: 'Analytics', icon: 'pi-chart-bar', to: '/analytics/overview' },
  { label: 'Alerts & Events', icon: 'pi-bell', to: '/alerts/all' },
  { label: 'Integrations', icon: 'pi-link', to: '/integrations/overview', roles: ['analyst', 'operator', 'admin'] },
  { label: 'Schema & Mapping', icon: 'pi-sitemap', to: '/schemas/local', roles: ['analyst', 'operator', 'admin'] },
  { label: 'Provenance & Audit', icon: 'pi-history', to: '/provenance/overview', roles: ['analyst', 'operator', 'admin'] },
  { label: 'Administration', icon: 'pi-cog', to: '/admin/users', roles: ['admin'] },
  { separator: true, label: '', icon: '' },
  { label: 'AI Assistant', icon: 'pi-comments', to: '/ai-assistant' }
]

const visibleNavItems = computed(() =>
  navItems.filter(item => {
    if (!item.roles) return true
    return auth.user && item.roles.includes(auth.user.role)
  })
)

function isActive(item: NavItem): boolean {
  if (item.to) return route.path.startsWith(item.to.split('/').slice(0, 3).join('/'))
  if (item.children) return item.children.some(c => c.to && route.path.startsWith(c.to.split('/').slice(0, 3).join('/')))
  return false
}

function toggleGroup(label: string): void {
  if (expandedGroups.value.has(label)) {
    expandedGroups.value.delete(label)
  } else {
    expandedGroups.value.add(label)
  }
}

function navigate(to: string): void {
  router.push(to)
}

const recentAlerts = computed(() =>
  notifications.alerts.slice(0, 5)
)

const userMenuItems = ref([
  { label: 'Sign out', icon: 'pi pi-sign-out', command: () => logout() }
])

function toggleNotifications(event: Event): void {
  notificationPanel.value?.toggle(event)
}

function toggleUserMenu(event: Event): void {
  userMenu.value?.toggle(event)
}

// KC handles login — app only renders when authenticated.
// Only 404 needs bare layout.
const isLoginPage = computed(() => route.name === 'NotFound')

// ─── Breadcrumbs from matched routes ─────────────────────────────────────────
const breadcrumbs = computed(() =>
  route.matched
    .filter(r => r.meta?.title)
    .map((r, idx, arr) => ({
      label: r.meta.title as string,
      to: idx < arr.length - 1 ? r.path.replace(/:(\w+)/g, (_: string, p: string) => String(route.params[p] ?? p)) : undefined
    }))
)
</script>

<template>
  <Toast position="top-right" />

  <!-- Global route loading bar -->
  <div class="route-loading-bar" :class="{ 'route-loading-bar--active': routeLoading }"></div>

  <!-- Login / 404: render bare (no sidebar) -->
  <RouterView v-if="isLoginPage" />

  <!-- Authenticated: full app layout with sidebar -->
  <div v-else class="app-layout">
    <!-- Mobile overlay -->
    <div
      v-if="mobileOpen"
      class="app-mobile-overlay"
      @click="mobileOpen = false"
    ></div>

    <!-- ─── Sidebar ─────────────────────────────────────── -->
    <aside
      class="app-sidebar"
      :class="{
        'app-sidebar--collapsed': sidebarCollapsed,
        'app-sidebar--mobile-open': mobileOpen
      }"
    >
      <!-- Logo -->
      <div class="sidebar-logo">
        <img src="/facis-logo.svg" alt="FACIS" class="sidebar-logo__img" />
        <span v-if="!sidebarCollapsed" class="sidebar-logo__text">FACIS Platform</span>
      </div>

      <!-- Nav -->
      <nav class="sidebar-nav" role="navigation">
        <template v-for="(item, idx) in visibleNavItems" :key="idx">
          <!-- Separator -->
          <div v-if="item.separator" class="sidebar-sep"></div>

          <!-- Group item (has children) -->
          <div
            v-else-if="item.children"
            class="sidebar-group"
          >
            <button
              class="sidebar-item sidebar-item--group"
              :class="{ 'sidebar-item--active': isActive(item) }"
              :title="sidebarCollapsed ? item.label : undefined"
              @click="!sidebarCollapsed && toggleGroup(item.label)"
            >
              <i :class="`pi ${item.icon} sidebar-item__icon`"></i>
              <span v-if="!sidebarCollapsed" class="sidebar-item__label">{{ item.label }}</span>
              <i
                v-if="!sidebarCollapsed"
                class="pi sidebar-item__chevron"
                :class="expandedGroups.has(item.label) ? 'pi-chevron-down' : 'pi-chevron-right'"
              ></i>
            </button>

            <div
              v-if="!sidebarCollapsed && expandedGroups.has(item.label)"
              class="sidebar-children"
            >
              <button
                v-for="child in item.children"
                :key="child.to"
                class="sidebar-item sidebar-item--child"
                :class="{ 'sidebar-item--active': child.to && route.path.startsWith(child.to.split('/').slice(0, 3).join('/')) }"
                @click="child.to && navigate(child.to)"
              >
                <i :class="`pi ${child.icon} sidebar-item__icon`"></i>
                <span class="sidebar-item__label">{{ child.label }}</span>
              </button>
            </div>
          </div>

          <!-- Regular nav item -->
          <button
            v-else
            class="sidebar-item"
            :class="{ 'sidebar-item--active': isActive(item) }"
            :title="sidebarCollapsed ? item.label : undefined"
            @click="item.to && navigate(item.to)"
          >
            <i :class="`pi ${item.icon} sidebar-item__icon`"></i>
            <span v-if="!sidebarCollapsed" class="sidebar-item__label">{{ item.label }}</span>
            <span
              v-if="item.label === 'Alerts & Events' && notifications.unreadCount > 0 && !sidebarCollapsed"
              class="sidebar-item__badge"
            >{{ notifications.unreadCount }}</span>
          </button>
        </template>
      </nav>

      <!-- Collapse toggle -->
      <button
        class="sidebar-collapse-btn"
        :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="sidebarCollapsed = !sidebarCollapsed"
      >
        <i :class="`pi ${sidebarCollapsed ? 'pi-chevron-right' : 'pi-chevron-left'}`"></i>
      </button>
    </aside>

    <!-- ─── Main column ──────────────────────────────────── -->
    <div class="app-main">
      <!-- Top bar -->
      <header class="app-topbar">
        <!-- Mobile hamburger -->
        <Button
          icon="pi pi-bars"
          text
          class="app-topbar__hamburger"
          @click="mobileOpen = !mobileOpen"
        />

        <!-- Search with results overlay -->
        <div class="app-topbar__search" style="position: relative;">
          <span class="p-input-icon-left">
            <i class="pi pi-search"></i>
            <InputText
              ref="searchInputRef"
              v-model="searchQuery"
              placeholder="Search platform..."
              class="topbar-search-input"
              autocomplete="off"
              @input="onSearchInput"
              @focus="onSearchFocus"
              @blur="onSearchBlur"
              @keydown="onSearchKeydown"
            />
          </span>
          <!-- Results dropdown -->
          <Transition name="search-drop">
            <div v-if="searchOpen && searchResults.length > 0" class="search-results">
              <div
                v-for="result in searchResults"
                :key="result.path"
                class="search-result-item"
                @mousedown.prevent="selectSearchResult(result)"
              >
                <div class="sri-icon">
                  <i :class="`pi ${result.icon}`"></i>
                </div>
                <div class="sri-body">
                  <div class="sri-label">{{ result.label }}</div>
                  <div class="sri-desc">{{ result.description }}</div>
                </div>
                <div class="sri-category">{{ result.category }}</div>
              </div>
            </div>
            <div v-else-if="searchOpen && searchQuery.trim().length >= 2 && searchResults.length === 0" class="search-results search-results--empty">
              <div class="sri-empty">No results for "{{ searchQuery }}"</div>
            </div>
          </Transition>
        </div>

        <div class="app-topbar__actions">
          <!-- Notifications -->
          <button class="topbar-icon-btn" aria-label="Notifications" @click="toggleNotifications">
            <i class="pi pi-bell"></i>
            <span v-if="notifications.unreadCount > 0" class="topbar-icon-btn__badge">
              {{ notifications.unreadCount > 9 ? '9+' : notifications.unreadCount }}
            </span>
          </button>

          <!-- User avatar -->
          <button class="topbar-user-btn" @click="toggleUserMenu">
            <Avatar
              :label="userInitials"
              shape="circle"
              class="topbar-avatar"
            />
            <div class="topbar-user-info">
              <span class="topbar-user-name">{{ userDisplayName }}</span>
              <span class="topbar-user-role">{{ getRole() }}</span>
            </div>
            <i class="pi pi-chevron-down topbar-user-chevron"></i>
          </button>
        </div>
      </header>

      <!-- Breadcrumb bar (hidden on top-level pages and login) -->
      <nav
        v-if="!isLoginPage && breadcrumbs.length > 1"
        class="app-breadcrumbs"
        aria-label="Breadcrumb"
      >
        <template v-for="(crumb, idx) in breadcrumbs" :key="crumb.label">
          <button
            v-if="crumb.to"
            class="bc-item bc-item--link"
            @click="router.push(crumb.to)"
          >{{ crumb.label }}</button>
          <span v-else class="bc-item bc-item--current" aria-current="page">{{ crumb.label }}</span>
          <span v-if="idx < breadcrumbs.length - 1" class="bc-sep" aria-hidden="true">
            <i class="pi pi-chevron-right"></i>
          </span>
        </template>
      </nav>

      <!-- Page content -->
      <main class="app-content">
        <RouterView v-slot="{ Component }">
          <Transition name="page-fade" mode="out-in">
            <component :is="Component" :key="$route.path" />
          </Transition>
        </RouterView>
      </main>
    </div>

    <!-- Notification overlay panel -->
    <OverlayPanel ref="notificationPanel" class="notif-panel">
      <div class="notif-panel__header">
        <span class="notif-panel__title">Notifications</span>
        <button class="notif-panel__clear" @click="notifications.markAllRead()">Mark all read</button>
      </div>
      <div class="notif-panel__list">
        <div
          v-for="alert in recentAlerts"
          :key="alert.id"
          class="notif-item"
          :class="{ 'notif-item--unread': !notifications.isRead(alert.id) }"
          @click="notifications.markRead(alert.id); router.push(`/alerts/${alert.id}`)"
        >
          <div class="notif-item__severity" :class="`notif-item__severity--${alert.severity}`"></div>
          <div class="notif-item__body">
            <div class="notif-item__source">{{ alert.source }}</div>
            <div class="notif-item__msg">{{ alert.message }}</div>
            <div class="notif-item__meta">
              <StatusBadge :status="alert.status" size="sm" :show-dot="false" />
              <span class="notif-item__time">{{ new Date(alert.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }}</span>
            </div>
          </div>
        </div>
        <div v-if="recentAlerts.length === 0" class="notif-panel__empty">No notifications</div>
      </div>
      <div class="notif-panel__footer">
        <button class="notif-panel__view-all" @click="router.push('/alerts/all'); notificationPanel?.hide()">
          View all alerts
        </button>
      </div>
    </OverlayPanel>

    <!-- User menu -->
    <Menu ref="userMenu" :model="userMenuItems" popup />
  </div>
</template>

<style scoped>
/* ─── Auth Splash ─────────────────────────────────── */
.auth-splash {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--facis-bg);
  gap: 1.5rem;
}
.auth-splash__logo {
  width: 120px;
  opacity: 0.7;
}
.auth-splash__spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--facis-border);
  border-top-color: var(--facis-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ─── Page Loading ────────────────────────────────── */
.page-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 1rem;
}
.page-loading__logo {
  width: 60px;
  opacity: 0.4;
}
.page-loading__spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--facis-border);
  border-top-color: var(--facis-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ─── Layout ──────────────────────────────────────── */
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

.app-mobile-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 99;
}

/* ─── Sidebar ─────────────────────────────────────── */
.app-sidebar {
  width: var(--facis-sidebar-width);
  height: 100vh;
  background: var(--facis-surface);
  border-right: 1px solid var(--facis-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  position: relative;
  z-index: 100;
}

.app-sidebar--collapsed {
  width: var(--facis-sidebar-collapsed);
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1rem;
  height: var(--facis-topbar-height);
  border-bottom: 1px solid var(--facis-border);
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar-logo__img {
  height: 28px;
  width: auto;
  flex-shrink: 0;
}

.sidebar-logo__text {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--facis-text);
  white-space: nowrap;
  overflow: hidden;
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0.75rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-sep {
  height: 1px;
  background: var(--facis-border);
  margin: 0.5rem 0.5rem;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  border-radius: var(--facis-radius-sm);
  cursor: pointer;
  border: none;
  background: transparent;
  width: 100%;
  color: var(--facis-text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  text-align: left;
  transition: all 0.12s;
  white-space: nowrap;
  overflow: hidden;
  position: relative;
}

.sidebar-item:hover {
  background: var(--facis-surface-2);
  color: var(--facis-text);
}

.sidebar-item--active {
  background: var(--facis-primary-light);
  color: var(--facis-primary);
}

.sidebar-item--active .sidebar-item__icon {
  color: var(--facis-primary);
}

.sidebar-item__icon {
  font-size: 1rem;
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}

.sidebar-item__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-item__chevron {
  font-size: 0.65rem;
  flex-shrink: 0;
  color: var(--facis-text-muted);
}

.sidebar-item__badge {
  background: var(--facis-error);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  flex-shrink: 0;
}

.sidebar-children {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-left: 0.5rem;
}

.sidebar-item--child {
  font-size: 0.8rem;
  padding: 0.5rem 0.75rem;
  color: var(--facis-text-secondary);
}

.sidebar-collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  width: 100%;
  border: none;
  border-top: 1px solid var(--facis-border);
  background: transparent;
  color: var(--facis-text-muted);
  cursor: pointer;
  transition: background 0.12s;
  flex-shrink: 0;
}

.sidebar-collapse-btn:hover {
  background: var(--facis-surface-2);
  color: var(--facis-text);
}

/* ─── Main column ─────────────────────────────────── */
.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* ─── Topbar ─────────────────────────────────────── */
.app-topbar {
  height: var(--facis-topbar-height);
  background: var(--facis-surface);
  border-bottom: 1px solid var(--facis-border);
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 1.25rem;
  flex-shrink: 0;
}

.app-topbar__hamburger {
  display: none !important;
}

.app-topbar__search {
  flex: 1;
  max-width: 400px;
}

.topbar-search-input {
  width: 100%;
}

.app-topbar__actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
}

.topbar-icon-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--facis-radius-sm);
  border: none;
  background: transparent;
  color: var(--facis-text-secondary);
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.12s;
}

.topbar-icon-btn:hover {
  background: var(--facis-surface-2);
  color: var(--facis-text);
}

.topbar-icon-btn__badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background: var(--facis-error);
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
}

.topbar-user-btn {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.375rem 0.625rem;
  border-radius: var(--facis-radius-sm);
  border: 1px solid var(--facis-border);
  background: transparent;
  cursor: pointer;
  transition: background 0.12s;
}

.topbar-user-btn:hover {
  background: var(--facis-surface-2);
}

.topbar-avatar {
  width: 30px !important;
  height: 30px !important;
  font-size: 0.75rem !important;
  background: var(--facis-primary-light) !important;
  color: var(--facis-primary) !important;
}

.topbar-user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.topbar-user-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--facis-text);
  line-height: 1;
}

.topbar-user-role {
  font-size: 0.7rem;
  color: var(--facis-text-secondary);
  text-transform: capitalize;
}

.topbar-user-chevron {
  font-size: 0.65rem;
  color: var(--facis-text-muted);
}

/* ─── Route loading bar ───────────────────────────── */
.route-loading-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 9999;
  background: linear-gradient(90deg, var(--facis-primary), #60a5fa);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0s;
  pointer-events: none;
}

.route-loading-bar--active {
  animation: loading-bar 1.5s ease-in-out infinite;
}

@keyframes loading-bar {
  0%   { transform: scaleX(0); opacity: 1; }
  60%  { transform: scaleX(0.75); opacity: 1; }
  100% { transform: scaleX(1); opacity: 0; }
}

/* ─── Page transition ─────────────────────────────── */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.15s ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}

/* ─── Content ─────────────────────────────────────── */
.app-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 2rem;
}

/* ─── Notifications panel ─────────────────────────── */
.notif-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--facis-border);
}

.notif-panel__title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--facis-text);
}

.notif-panel__clear {
  font-size: 0.75rem;
  color: var(--facis-primary);
  background: none;
  border: none;
  cursor: pointer;
}

.notif-panel__list {
  min-width: 340px;
  max-height: 380px;
  overflow-y: auto;
}

.notif-item {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--facis-border);
  cursor: pointer;
  transition: background 0.12s;
}

.notif-item:hover {
  background: var(--facis-surface-2);
}

.notif-item--unread {
  background: var(--facis-primary-light);
}

.notif-item--unread:hover {
  background: #d9e8ff;
}

.notif-item__severity {
  width: 4px;
  border-radius: 2px;
  flex-shrink: 0;
  align-self: stretch;
}

.notif-item__severity--info     { background: var(--facis-info); }
.notif-item__severity--warning  { background: var(--facis-warning); }
.notif-item__severity--error    { background: var(--facis-error); }
.notif-item__severity--critical { background: #7c0000; }

.notif-item__body {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex: 1;
  min-width: 0;
}

.notif-item__source {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--facis-text);
}

.notif-item__msg {
  font-size: 0.75rem;
  color: var(--facis-text-secondary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.notif-item__meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.2rem;
}

.notif-item__time {
  font-size: 0.7rem;
  color: var(--facis-text-muted);
}

.notif-panel__empty {
  padding: 2rem;
  text-align: center;
  color: var(--facis-text-secondary);
  font-size: 0.875rem;
}

.notif-panel__footer {
  padding: 0.625rem 1rem;
  border-top: 1px solid var(--facis-border);
}

.notif-panel__view-all {
  width: 100%;
  text-align: center;
  font-size: 0.786rem;
  font-weight: 500;
  color: var(--facis-primary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
}

/* ─── Breadcrumbs ─────────────────────────────────── */
.app-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 1.5rem;
  background: var(--facis-surface-2);
  border-bottom: 1px solid var(--facis-border);
  flex-shrink: 0;
  overflow-x: auto;
}

.bc-item {
  font-size: 0.78rem;
  white-space: nowrap;
}

.bc-item--link {
  color: var(--facis-primary);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 500;
}

.bc-item--link:hover {
  text-decoration: underline;
}

.bc-item--current {
  color: var(--facis-text-secondary);
  font-weight: 500;
}

.bc-sep {
  color: var(--facis-text-muted);
  font-size: 0.6rem;
  line-height: 1;
  display: flex;
  align-items: center;
}

/* ─── Search results overlay ──────────────────────── */
.search-results {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 420px;
  max-width: 520px;
  background: var(--facis-surface);
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 9999;
  overflow: hidden;
}

.search-results--empty {
  padding: 1rem;
}

.sri-empty {
  font-size: 0.85rem;
  color: var(--facis-text-secondary);
  text-align: center;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  cursor: pointer;
  transition: background 0.1s;
  border-bottom: 1px solid var(--facis-border);
}

.search-result-item:last-child {
  border-bottom: none;
}

.search-result-item:hover {
  background: var(--facis-surface-2);
}

.sri-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--facis-radius-sm);
  background: var(--facis-primary-light);
  color: var(--facis-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.sri-body {
  flex: 1;
  min-width: 0;
}

.sri-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--facis-text);
  line-height: 1.3;
}

.sri-desc {
  font-size: 0.75rem;
  color: var(--facis-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sri-category {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--facis-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  flex-shrink: 0;
}

.search-drop-enter-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.search-drop-leave-active { transition: opacity 0.08s ease; }
.search-drop-enter-from { opacity: 0; transform: translateY(-6px); }
.search-drop-leave-to { opacity: 0; }

/* ─── Responsive ──────────────────────────────────── */

/* 768px–1279px: icon-only sidebar (collapsed but stays in layout) */
@media (max-width: 1279px) and (min-width: 768px) {
  .app-topbar__hamburger {
    display: none !important;
  }
}

/* < 768px: slide-over overlay sidebar */
@media (max-width: 767px) {
  .app-sidebar {
    position: fixed;
    left: -280px;
    top: 0;
    height: 100vh;
    z-index: 200;
    transition: left 0.22s ease, width 0.22s ease;
    width: var(--facis-sidebar-width) !important;
  }

  .app-sidebar--mobile-open {
    left: 0;
  }

  .app-mobile-overlay {
    display: block;
  }

  .app-topbar__hamburger {
    display: flex !important;
  }

  .topbar-user-info {
    display: none;
  }

  .topbar-user-chevron {
    display: none;
  }

  .search-results {
    min-width: 280px;
    max-width: calc(100vw - 2rem);
  }
}
</style>
