import { createRouter, createWebHistory } from 'vue-router'
import { auth } from '@/auth'
import type { RouteRecordRaw } from 'vue-router'
import type { UserRole } from '@/data/types'

export interface BreadcrumbItem {
  label: string
  to?: string
}

declare module 'vue-router' {
  interface RouteMeta {
    roles?: UserRole[]
    title?: string
    requiresAuth?: boolean
    breadcrumbs?: BreadcrumbItem[]
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  // Login is handled by Keycloak (onLoad: 'login-required') — no custom login route needed

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { title: 'Dashboard', requiresAuth: true, roles: ['viewer', 'analyst', 'operator', 'admin'] }
  },

  // ─── Use Cases ─────────────────────────────────────────────────────────────
  {
    path: '/use-cases',
    name: 'UseCases',
    component: () => import('@/views/UseCasesView.vue'),
    meta: { title: 'Use Cases', requiresAuth: true, roles: ['viewer', 'analyst', 'operator', 'admin'] },
    children: [
      {
        path: 'smart-energy',
        name: 'SmartEnergy',
        component: () => import('@/views/smart-energy/SmartEnergyView.vue'),
        meta: { title: 'Smart Energy', requiresAuth: true, roles: ['viewer', 'analyst', 'operator', 'admin'] },
        children: [
          { path: '', redirect: 'overview' },
          { path: 'overview', name: 'SmartEnergyOverview', component: () => import('@/views/smart-energy/EnergyOverviewView.vue'), meta: { title: 'Energy Overview' } },
          { path: 'assets', name: 'EnergyAssets', component: () => import('@/views/smart-energy/EnergyAssetsView.vue'), meta: { title: 'Energy Assets' } },
          { path: 'assets/:id', name: 'EnergyAssetDetail', component: () => import('@/views/smart-energy/EnergyAssetDetailView.vue'), meta: { title: 'Asset Detail' } },
          { path: 'context', name: 'EnergyContext', component: () => import('@/views/smart-energy/EnergyContextView.vue'), meta: { title: 'Context Data' } },
          // 'insights' sub-route removed: EnergyInsightsView is fully history-driven and no /history endpoints exist on the simulation REST flow. AI Assistant + Analytics Overview cover the same surface.
          { path: 'data-products', name: 'EnergyDataProducts', component: () => import('@/views/smart-energy/EnergyDataProductsView.vue'), meta: { title: 'Energy Data Products' } },
          { path: 'data-products/:id', name: 'EnergyDataProductDetail', component: () => import('@/views/smart-energy/EnergyDataProductDetailView.vue'), meta: { title: 'Data Product Detail' } }
        ]
      },
      // Smart City use case removed: the simulation engine emits no
      // streetlight / traffic / event / city-weather feeds. All seven views
      // depended on /api/v1/{streetlights,traffic,events,city-weather/*}
      // which 404. AI Insight city-status remains accessible via the AI
      // Assistant chat and as one of the three cards in Analytics Overview.
      // Restore from git history once those simulation feeds exist.
    ]
  },

  // ─── Data Sources ──────────────────────────────────────────────────────────
  {
    path: '/data-sources',
    name: 'DataSources',
    component: () => import('@/views/DataSourcesView.vue'),
    meta: { title: 'Data Sources', requiresAuth: true, roles: ['viewer', 'analyst', 'operator', 'admin'] },
    children: [
      { path: '', redirect: 'all' },
      { path: 'all', name: 'AllDataSources', component: () => import('@/views/data-sources/AllSourcesView.vue'), meta: { title: 'All Sources' } },
      { path: 'types', name: 'SourceTypes', component: () => import('@/views/data-sources/SourceTypesView.vue'), meta: { title: 'Source Types' } },
      { path: 'health', name: 'SourceHealth', component: () => import('@/views/data-sources/SourceHealthView.vue'), meta: { title: 'Health Monitor' } },
      { path: 'raw', name: 'RawMessages', component: () => import('@/views/data-sources/RawMessagesView.vue'), meta: { title: 'Raw Messages' } }
    ]
  },

  // ─── Data Products section removed: no /api/v1/data-products backend exists.
  //     Smart-energy and smart-city use cases keep their own per-domain views.
  //     If the DSP catalogue is ever exposed as /api/v1/data-products, restore
  //     this block and wire the view to that endpoint.

  // ─── Analytics ─────────────────────────────────────────────────────────────
  {
    path: '/analytics',
    name: 'Analytics',
    component: () => import('@/views/AnalyticsView.vue'),
    meta: { title: 'Analytics', requiresAuth: true, roles: ['viewer', 'analyst', 'operator', 'admin'] },
    children: [
      { path: '', redirect: 'overview' },
      { path: 'overview', name: 'AnalyticsOverview', component: () => import('@/views/analytics/AnalyticsOverviewView.vue'), meta: { title: 'Analytics Overview' } },
      // Trends / Correlations / Anomalies / Recommendations sub-tabs removed:
      // they all required /history endpoints that don't exist. The Overview
      // already shows the LLM-narrated energy/anomaly/city insight cards.
    ]
  },

  // ─── Alerts ────────────────────────────────────────────────────────────────
  {
    path: '/alerts',
    name: 'Alerts',
    component: () => import('@/views/AlertsView.vue'),
    meta: { title: 'Alerts & Events', requiresAuth: true, roles: ['viewer', 'analyst', 'operator', 'admin'] },
    children: [
      { path: '', redirect: 'all' },
      { path: 'all', name: 'AllAlerts', component: () => import('@/views/alerts/AllAlertsView.vue'), meta: { title: 'All Alerts' } },
      { path: 'open', name: 'OpenAlerts', component: () => import('@/views/alerts/OpenAlertsView.vue'), meta: { title: 'Open Alerts' } },
      { path: ':id', name: 'AlertDetail', component: () => import('@/views/alerts/AlertDetailView.vue'), meta: { title: 'Alert Detail' } }
    ]
  },

  // ─── Integrations ──────────────────────────────────────────────────────────
  {
    path: '/integrations',
    name: 'Integrations',
    component: () => import('@/views/IntegrationsView.vue'),
    meta: { title: 'Integrations', requiresAuth: true, roles: ['analyst', 'operator', 'admin'] },
    children: [
      { path: '', redirect: 'overview' },
      { path: 'overview', name: 'IntegrationsOverview', component: () => import('@/views/integrations/IntegrationsOverviewView.vue'), meta: { title: 'Integrations Overview' } },
      { path: 'adapters', name: 'Adapters', component: () => import('@/views/integrations/AdaptersView.vue'), meta: { title: 'Adapters' } },
      { path: 'pipelines', name: 'Pipelines', component: () => import('@/views/integrations/PipelinesView.vue'), meta: { title: 'Pipelines' } }
    ]
  },

  // ─── Schema & Mapping ──────────────────────────────────────────────────────
  {
    path: '/schemas',
    name: 'Schemas',
    component: () => import('@/views/SchemaView.vue'),
    meta: { title: 'Schema & Mapping', requiresAuth: true, roles: ['analyst', 'operator', 'admin'] },
    children: [
      { path: '', redirect: 'local' },
      { path: 'local', name: 'LocalSchemas', component: () => import('@/views/schemas/LocalSchemasView.vue'), meta: { title: 'Local Schemas' } },
      { path: 'remote', name: 'RemoteSchemas', component: () => import('@/views/schemas/RemoteSchemasView.vue'), meta: { title: 'Remote Schemas' } },
      { path: 'mappings', name: 'Mappings', component: () => import('@/views/schemas/MappingsView.vue'), meta: { title: 'Mappings' } },
      { path: 'mappings/:id', name: 'MappingDetail', component: () => import('@/views/schemas/MappingDetailView.vue'), meta: { title: 'Mapping Detail' } }
    ]
  },

  // ─── Provenance & Audit ────────────────────────────────────────────────────
  {
    path: '/provenance',
    name: 'Provenance',
    component: () => import('@/views/ProvenanceView.vue'),
    meta: { title: 'Provenance & Audit', requiresAuth: true, roles: ['analyst', 'operator', 'admin'] },
    children: [
      { path: '', redirect: 'overview' },
      { path: 'overview', name: 'ProvenanceOverview', component: () => import('@/views/provenance/ProvenanceOverviewView.vue'), meta: { title: 'Provenance Overview' } },
      { path: 'audit', name: 'AuditLog', component: () => import('@/views/provenance/AuditLogView.vue'), meta: { title: 'Audit Log' } },
      { path: 'compare', name: 'SchemaCompare', component: () => import('@/views/provenance/SchemaCompareView.vue'), meta: { title: 'Schema Compare' } },
      { path: 'references', name: 'DataReferences', component: () => import('@/views/provenance/DataReferencesView.vue'), meta: { title: 'Data References' } }
    ]
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('@/views/AdminView.vue'),
    meta: { title: 'Administration', requiresAuth: true, roles: ['admin'] },
    children: [
      { path: '', redirect: 'users' },
      { path: 'users', name: 'AdminUsers', component: () => import('@/views/admin/AdminUsersView.vue'), meta: { title: 'User Management', roles: ['admin'] } },
      { path: 'roles', name: 'AdminRoles', component: () => import('@/views/admin/AdminRolesView.vue'), meta: { title: 'Roles & Permissions', roles: ['admin'] } },
      { path: 'access', name: 'AdminAccess', component: () => import('@/views/admin/AdminAccessView.vue'), meta: { title: 'Access Control', roles: ['admin'] } },
      { path: 'monitoring', name: 'AdminMonitoring', component: () => import('@/views/admin/AdminMonitoringView.vue'), meta: { title: 'System Monitoring', roles: ['admin'] } },
      { path: 'settings', name: 'AdminSettings', component: () => import('@/views/admin/AdminSettingsView.vue'), meta: { title: 'Platform Settings', roles: ['admin'] } }
    ]
  },

  // ─── AI Assistant ──────────────────────────────────────────────────────────
  {
    path: '/ai-assistant',
    name: 'AiAssistant',
    component: () => import('@/views/AiAssistantView.vue'),
    meta: { title: 'AI Assistant', requiresAuth: true, roles: ['viewer', 'analyst', 'operator', 'admin'] }
  },

  // ─── 404 ───────────────────────────────────────────────────────────────────
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Page Not Found', requiresAuth: false }
  }
]

const router = createRouter({
  // Use vite's BASE_URL (set from vite.config.ts `base`) so deep links and
  // navigation work under the /aiInsight/ sub-path served by ORCE/uibuilder.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

// Navigation guard — auth is already initialized in main.ts before mount
router.beforeEach(async (to, _from) => {
  // Role check
  if (to.meta.roles && to.meta.roles.length > 0 && auth.user) {
    if (!to.meta.roles.includes(auth.user.role)) {
      return { name: 'Dashboard' }
    }
  }

  document.title = to.meta.title ? `${to.meta.title} — FACIS Platform` : 'FACIS IoT & AI Platform'
})

export default router
