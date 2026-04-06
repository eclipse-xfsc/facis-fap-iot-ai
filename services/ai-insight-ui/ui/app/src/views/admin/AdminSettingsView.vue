<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import Message from 'primevue/message'
import PageHeader from '@/components/common/PageHeader.vue'
import { getSimConfig, getSimulationStatus, getSimHealth, getAiHealth, startSimulation, pauseSimulation, resetSimulation } from '@/services/api'

const isLive = ref(false)
const simState = ref('unknown')
const simAcceleration = ref(1)
const simSeed = ref(0)
const simStartTime = ref('')
const registeredMeters = ref(0)
const simHealthStatus = ref('unknown')
const aiHealthStatus  = ref('unknown')
const simActionLoading = ref(false)

onMounted(async () => {
  try {
    const [cfg, status, simH, aiH] = await Promise.all([getSimConfig(), getSimulationStatus(), getSimHealth(), getAiHealth()])
    if (cfg) {
      simSeed.value = cfg.seed
      simAcceleration.value = cfg.time_acceleration
      simStartTime.value = cfg.start_time
      simState.value = cfg.simulation_state
      registeredMeters.value = cfg.registered_meters
    }
    if (status) simState.value = status.state
    simHealthStatus.value = simH?.status ?? 'unknown'
    aiHealthStatus.value  = aiH?.status  ?? 'unknown'
    isLive.value = true
  } catch { /* keep static config */ }
})

async function simAction(action: 'start' | 'pause' | 'reset'): Promise<void> {
  simActionLoading.value = true
  try {
    if (action === 'start') await startSimulation()
    else if (action === 'pause') await pauseSimulation()
    else await resetSimulation()
    const status = await getSimulationStatus()
    if (status) simState.value = status.state
  } catch { /* ignore */ } finally {
    simActionLoading.value = false
  }
}

// ─── Environment ─────────────────────────────────────────────────────────────
const envInfo = {
  name:       'FACIS IoT & AI Platform',
  version:    '1.4.0',
  buildDate:  '2026-04-05',
  buildId:    '2026.04.05.1',
  environment: 'Production',
  region:     'EU-West (Lisbon)',
  nodeVersion: 'v20.12.0',
  vueVersion:  '3.4.x'
}

// ─── Feature Toggles ─────────────────────────────────────────────────────────
const features = reactive({
  aiAnalytics:     true,
  realtimeAlerts:  true,
  exportApi:       true,
  demoMode:        false,
  betaFeatures:    false,
  debugLogging:    false
})

// ─── API Configuration ────────────────────────────────────────────────────────
const apiConfig = reactive({
  baseUrl:    import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout:    30,
  retries:    3,
  keycloakUrl:  import.meta.env.VITE_KEYCLOAK_URL ?? 'https://identity.facis.cloud',
  keycloakRealm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'facis',
  mqttBroker:  'mqtt://broker.facis.local:1883',
  kafkaBrokers: 'kafka-1.facis.local:9092,kafka-2.facis.local:9092'
})

// ─── Display Settings ─────────────────────────────────────────────────────────
const displayConfig = reactive({
  timezone:      'Europe/Lisbon',
  unitSystem:    'metric',
  dateRange:     '24h',
  numberLocale:  'en-GB',
  language:      'en'
})

const TIMEZONE_OPTIONS = [
  { label: 'Europe/Lisbon (UTC+1)', value: 'Europe/Lisbon' },
  { label: 'Europe/Berlin (UTC+2)', value: 'Europe/Berlin' },
  { label: 'UTC', value: 'UTC' },
  { label: 'America/New_York (UTC-4)', value: 'America/New_York' }
]

const UNIT_OPTIONS = [
  { label: 'Metric (kWh, °C, m/s)', value: 'metric' },
  { label: 'Imperial (kWh, °F, mph)', value: 'imperial' }
]

const DATE_RANGE_OPTIONS = [
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' }
]

// ─── Save logic ──────────────────────────────────────────────────────────────
const saving = ref(false)
const saveSuccess = ref(false)

function saveSettings(): void {
  saving.value = true
  setTimeout(() => {
    saving.value = false
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 3000)
  }, 1200)
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Platform Settings"
      subtitle="Environment info, feature toggles, API configuration, and display preferences"
      :breadcrumbs="[{ label: 'Administration' }, { label: 'Settings' }]"
    >
      <template #actions>
        <Button label="Reset to Defaults" icon="pi pi-refresh" size="small" outlined />
        <Button label="Save Settings" icon="pi pi-save" size="small" :loading="saving" @click="saveSettings" />
      </template>
    </PageHeader>

    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> Live simulation config loaded — state: <strong style="margin-left:0.25rem">{{ simState }}</strong>
    </div>

    <div class="view-body">
      <!-- Success message -->
      <Transition name="slide-fade">
        <Message v-if="saveSuccess" severity="success" :closable="false">
          Settings saved successfully.
        </Message>
      </Transition>

      <!-- Live Simulation Control -->
      <div v-if="isLive" class="card card-body">
        <div class="section-label">Simulation Control — Live</div>
        <div class="sim-grid">
          <div class="sim-row"><span class="sim-key">State</span><span class="env-badge" :style="{ background: simState === 'running' ? '#dcfce7' : '#fee2e2', color: simState === 'running' ? '#15803d' : '#991b1b' }">{{ simState }}</span></div>
          <div class="sim-row"><span class="sim-key">Seed</span><code class="env-badge env-badge--blue">{{ simSeed }}</code></div>
          <div class="sim-row"><span class="sim-key">Acceleration</span><span>{{ simAcceleration }}×</span></div>
          <div class="sim-row"><span class="sim-key">Registered Meters</span><span>{{ registeredMeters }}</span></div>
          <div class="sim-row"><span class="sim-key">Sim Health</span><span :style="{ color: simHealthStatus === 'ok' ? 'var(--facis-success)' : 'var(--facis-error)' }">{{ simHealthStatus }}</span></div>
          <div class="sim-row"><span class="sim-key">AI Health</span><span :style="{ color: aiHealthStatus === 'ok' ? 'var(--facis-success)' : 'var(--facis-error)' }">{{ aiHealthStatus }}</span></div>
        </div>
        <div class="sim-actions">
          <Button label="Start" icon="pi pi-play" size="small" severity="success" :loading="simActionLoading" @click="simAction('start')" />
          <Button label="Pause" icon="pi pi-pause" size="small" severity="warning" :loading="simActionLoading" @click="simAction('pause')" />
          <Button label="Reset" icon="pi pi-replay" size="small" severity="danger"  :loading="simActionLoading" @click="simAction('reset')" />
        </div>
      </div>

      <!-- Environment info -->
      <div class="card card-body">
        <div class="section-label">Environment Information</div>
        <div class="env-grid">
          <div class="env-row">
            <span class="env-key">Platform</span>
            <span class="env-val">{{ envInfo.name }}</span>
          </div>
          <div class="env-row">
            <span class="env-key">Version</span>
            <span class="env-val env-badge env-badge--blue">{{ envInfo.version }}</span>
          </div>
          <div class="env-row">
            <span class="env-key">Build</span>
            <span class="env-val env-mono">{{ envInfo.buildId }}</span>
          </div>
          <div class="env-row">
            <span class="env-key">Build Date</span>
            <span class="env-val">{{ envInfo.buildDate }}</span>
          </div>
          <div class="env-row">
            <span class="env-key">Environment</span>
            <span class="env-val env-badge env-badge--green">{{ envInfo.environment }}</span>
          </div>
          <div class="env-row">
            <span class="env-key">Region</span>
            <span class="env-val">{{ envInfo.region }}</span>
          </div>
          <div class="env-row">
            <span class="env-key">Node.js</span>
            <span class="env-val env-mono">{{ envInfo.nodeVersion }}</span>
          </div>
          <div class="env-row">
            <span class="env-key">Vue.js</span>
            <span class="env-val env-mono">{{ envInfo.vueVersion }}</span>
          </div>
        </div>
      </div>

      <!-- Feature toggles -->
      <div class="card card-body">
        <div class="section-label">Feature Toggles</div>
        <p class="section-sub">Enable or disable platform features. Changes take effect immediately.</p>
        <div class="toggles-grid">
          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-name">AI Analytics</span>
              <span class="toggle-desc">Enable LLM-powered anomaly detection and recommendations</span>
            </div>
            <ToggleSwitch v-model="features.aiAnalytics" />
          </div>
          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-name">Real-time Alerts</span>
              <span class="toggle-desc">Push notifications for threshold breaches and device faults</span>
            </div>
            <ToggleSwitch v-model="features.realtimeAlerts" />
          </div>
          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-name">Export API</span>
              <span class="toggle-desc">Allow external consumers to access data products via REST API</span>
            </div>
            <ToggleSwitch v-model="features.exportApi" />
          </div>
          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-name">Demo Mode</span>
              <span class="toggle-desc">Show demo data when backend is unavailable (no real ingestion)</span>
            </div>
            <ToggleSwitch v-model="features.demoMode" />
          </div>
          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-name">Beta Features</span>
              <span class="toggle-desc">Enable experimental features — may be unstable</span>
            </div>
            <ToggleSwitch v-model="features.betaFeatures" />
          </div>
          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-name">Debug Logging</span>
              <span class="toggle-desc">Verbose console and server-side debug output</span>
            </div>
            <ToggleSwitch v-model="features.debugLogging" />
          </div>
        </div>
      </div>

      <!-- API Configuration -->
      <div class="card card-body">
        <div class="section-label">API & Integration Configuration</div>
        <div class="settings-form">
          <div class="sf-row">
            <label class="sf-label">API Base URL</label>
            <InputText v-model="apiConfig.baseUrl" class="sf-input" />
          </div>
          <div class="sf-row">
            <label class="sf-label">Request Timeout (s)</label>
            <InputText v-model.number="apiConfig.timeout" type="number" class="sf-input sf-input--sm" />
          </div>
          <div class="sf-row">
            <label class="sf-label">Max Retries</label>
            <InputText v-model.number="apiConfig.retries" type="number" class="sf-input sf-input--sm" />
          </div>
          <div class="sf-divider"></div>
          <div class="sf-row">
            <label class="sf-label">Keycloak URL</label>
            <InputText v-model="apiConfig.keycloakUrl" class="sf-input" />
          </div>
          <div class="sf-row">
            <label class="sf-label">Keycloak Realm</label>
            <InputText v-model="apiConfig.keycloakRealm" class="sf-input sf-input--sm" />
          </div>
          <div class="sf-divider"></div>
          <div class="sf-row">
            <label class="sf-label">MQTT Broker</label>
            <InputText v-model="apiConfig.mqttBroker" class="sf-input" />
          </div>
          <div class="sf-row">
            <label class="sf-label">Kafka Brokers</label>
            <InputText v-model="apiConfig.kafkaBrokers" class="sf-input" />
          </div>
        </div>
      </div>

      <!-- Display Settings -->
      <div class="card card-body">
        <div class="section-label">Display & Localisation Settings</div>
        <div class="settings-form">
          <div class="sf-row">
            <label class="sf-label">Timezone</label>
            <Select
              v-model="displayConfig.timezone"
              :options="TIMEZONE_OPTIONS"
              option-label="label"
              option-value="value"
              class="sf-select"
            />
          </div>
          <div class="sf-row">
            <label class="sf-label">Unit System</label>
            <Select
              v-model="displayConfig.unitSystem"
              :options="UNIT_OPTIONS"
              option-label="label"
              option-value="value"
              class="sf-select"
            />
          </div>
          <div class="sf-row">
            <label class="sf-label">Default Date Range</label>
            <Select
              v-model="displayConfig.dateRange"
              :options="DATE_RANGE_OPTIONS"
              option-label="label"
              option-value="value"
              class="sf-select"
            />
          </div>
        </div>
      </div>

      <!-- Save button row -->
      <div class="settings-actions">
        <Button label="Save All Settings" icon="pi pi-save" :loading="saving" @click="saveSettings" />
        <Button label="Reset to Defaults" icon="pi pi-refresh" outlined />
      </div>
    </div>
  </div>
</template>

<style scoped>
.live-banner { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #15803d; background: #dcfce7; padding: 0.375rem 1.5rem; border-bottom: 1px solid #bbf7d0; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.sim-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.75rem; margin-top: 0.75rem; }
.sim-row { display: flex; align-items: center; gap: 0.75rem; font-size: 0.85rem; }
.sim-key { font-weight: 600; color: var(--facis-text-secondary); min-width: 140px; font-size: 0.8rem; }
.sim-actions { display: flex; gap: 0.625rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--facis-border); }
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
  margin-bottom: 0.75rem;
}

.section-sub {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
  margin-bottom: 1rem;
  line-height: 1.5;
}

/* Environment */
.env-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 0;
}

.env-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.625rem 0;
  border-bottom: 1px solid var(--facis-border);
}

.env-row:nth-last-child(-n+2) { border-bottom: none; }

.env-key {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--facis-text-secondary);
  min-width: 120px;
  flex-shrink: 0;
}

.env-val {
  font-size: 0.875rem;
  color: var(--facis-text);
}

.env-mono {
  font-family: var(--facis-font-mono);
  font-size: 0.786rem !important;
}

.env-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.625rem;
  border-radius: 20px;
}

.env-badge--blue  { background: #dbeafe; color: #1d4ed8; }
.env-badge--green { background: #dcfce7; color: #15803d; }

/* Toggles */
.toggles-grid { display: flex; flex-direction: column; gap: 0; }

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 0.875rem 0;
  border-bottom: 1px solid var(--facis-border);
}

.toggle-row:last-child { border-bottom: none; }

.toggle-info { flex: 1; }

.toggle-name {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--facis-text);
  margin-bottom: 0.2rem;
}

.toggle-desc {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
  line-height: 1.4;
}

/* Settings form */
.settings-form { display: flex; flex-direction: column; gap: 0.875rem; }

.sf-row {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.sf-label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--facis-text-secondary);
  min-width: 160px;
  flex-shrink: 0;
}

.sf-input { flex: 1; max-width: 420px; }
.sf-input--sm { max-width: 120px !important; }
.sf-select { width: 280px; }

.sf-divider {
  height: 1px;
  background: var(--facis-border);
  margin: 0.25rem 0;
}

/* Actions */
.settings-actions {
  display: flex;
  gap: 0.75rem;
}

/* Transition */
.slide-fade-enter-active { transition: all 0.25s ease; }
.slide-fade-leave-active { transition: all 0.2s ease; }
.slide-fade-enter-from, .slide-fade-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
