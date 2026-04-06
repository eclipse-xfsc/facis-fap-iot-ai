<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Select from 'primevue/select'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import JsonCompare from '@/components/common/JsonCompare.vue'
import { getMeterCurrent, getPVCurrent, getWeatherStations, getWeatherCurrent } from '@/services/api'

interface SchemaVersion {
  version: string
  publishedAt: string
  publishedBy: string
  status: 'active' | 'deprecated' | 'draft'
  schema: Record<string, unknown>
  changelog: string
}

const versions: SchemaVersion[] = [
  {
    version: '2.1.0',
    publishedAt: new Date(Date.now() - 86_400_000).toISOString(),
    publishedBy: 'a.bergstrom@facis.local',
    status: 'active',
    changelog: 'Added power_factor and reactive_power fields. Aligned unit labelling with IEC 61968-9. Marked legacy fields total_kvarh as deprecated.',
    schema: {
      properties: {
        meter_id:           { type: 'string',  description: 'Unique meter identifier' },
        timestamp:          { type: 'string',  description: 'ISO 8601 reading timestamp' },
        active_power_l1_w:  { type: 'number',  unit: 'W',   description: 'Active power phase L1' },
        active_power_l2_w:  { type: 'number',  unit: 'W',   description: 'Active power phase L2' },
        active_power_l3_w:  { type: 'number',  unit: 'W',   description: 'Active power phase L3' },
        voltage_l1_v:       { type: 'number',  unit: 'V',   description: 'Voltage phase L1' },
        voltage_l2_v:       { type: 'number',  unit: 'V',   description: 'Voltage phase L2' },
        voltage_l3_v:       { type: 'number',  unit: 'V',   description: 'Voltage phase L3' },
        current_l1_a:       { type: 'number',  unit: 'A',   description: 'Current phase L1' },
        frequency_hz:       { type: 'number',  unit: 'Hz',  description: 'Grid frequency' },
        power_factor:       { type: 'number',  description: 'Power factor (0–1)' },
        total_energy_kwh:   { type: 'number',  unit: 'kWh', description: 'Cumulative energy reading' },
        reactive_power_kvar:{ type: 'number',  unit: 'kVAr',description: 'Reactive power total' }
      }
    }
  },
  {
    version: '2.0.0',
    publishedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    publishedBy: 'r.muller@acme-energy.com',
    status: 'deprecated',
    changelog: 'Initial production release. Migrated from legacy IEC-61968 raw format. Added phase-level voltage and current fields.',
    schema: {
      properties: {
        meter_id:          { type: 'string',  description: 'Unique meter identifier' },
        timestamp:         { type: 'string',  description: 'ISO 8601 reading timestamp' },
        active_power_l1_w: { type: 'number',  unit: 'W',   description: 'Active power phase L1' },
        active_power_l2_w: { type: 'number',  unit: 'W',   description: 'Active power phase L2' },
        active_power_l3_w: { type: 'number',  unit: 'W',   description: 'Active power phase L3' },
        voltage_l1_v:      { type: 'number',  unit: 'V',   description: 'Voltage phase L1' },
        current_l1_a:      { type: 'number',  unit: 'A',   description: 'Current phase L1' },
        frequency_hz:      { type: 'number',  unit: 'Hz',  description: 'Grid frequency' },
        total_energy_kwh:  { type: 'number',  unit: 'kWh', description: 'Cumulative energy reading' },
        total_kvarh:       { type: 'number',  unit: 'kVArh', description: 'Legacy reactive energy (deprecated)' }
      }
    }
  },
  {
    version: '1.3.0',
    publishedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    publishedBy: 'system',
    status: 'deprecated',
    changelog: 'Added frequency_hz and total_energy_kwh. Renamed power_w to active_power_l1_w.',
    schema: {
      properties: {
        meter_id:         { type: 'string', description: 'Unique meter identifier' },
        timestamp:        { type: 'string', description: 'ISO 8601 reading timestamp' },
        active_power_l1_w:{ type: 'number', unit: 'W',   description: 'Active power (single phase)' },
        voltage_l1_v:     { type: 'number', unit: 'V',   description: 'Voltage (single phase)' },
        frequency_hz:     { type: 'number', unit: 'Hz',  description: 'Grid frequency' },
        total_energy_kwh: { type: 'number', unit: 'kWh', description: 'Cumulative energy reading' }
      }
    }
  }
]

const isLive = ref(false)

// Live raw payload from API — used to augment the left (remote) schema side
const liveRawPayload = ref<Record<string, unknown> | null>(null)

onMounted(async () => {
  const stations = await getWeatherStations()
  const stationId = stations?.stations?.[0]?.station_id ?? 'WS-001'
  const [meter, pv, weather] = await Promise.all([
    getMeterCurrent('METER-A-001').catch(() => null),
    getPVCurrent('PV-System-01').catch(() => null),
    getWeatherCurrent(stationId).catch(() => null)
  ])
  // Build a representative raw API payload object that shows real structure
  const payload: Record<string, unknown> = {}
  if (meter) {
    payload['meter_id'] = meter.meter_id
    payload['timestamp'] = meter.timestamp
    payload['active_power_l1_w'] = meter.readings.active_power_l1_w
    payload['active_power_l2_w'] = meter.readings.active_power_l2_w
    payload['active_power_l3_w'] = meter.readings.active_power_l3_w
    payload['voltage_l1_v'] = meter.readings.voltage_l1_v
    payload['voltage_l2_v'] = meter.readings.voltage_l2_v
    payload['voltage_l3_v'] = meter.readings.voltage_l3_v
    payload['current_l1_a'] = meter.readings.current_l1_a
    payload['frequency_hz'] = meter.readings.frequency_hz
    payload['power_factor'] = meter.readings.power_factor
    payload['total_energy_kwh'] = meter.readings.total_energy_kwh
  }
  if (pv) {
    payload['pv_system_id'] = pv.system_id
    payload['pv_power_kw'] = pv.readings.power_kw
    payload['pv_irradiance_w_m2'] = pv.readings.irradiance_w_m2
    payload['pv_panel_temp_c'] = pv.readings.panel_temp_c
    payload['pv_efficiency'] = pv.readings.efficiency
  }
  if (weather) {
    payload['weather_temp_c'] = weather.conditions.temperature_c
    payload['weather_ghi_w_m2'] = weather.conditions.ghi_w_m2
    payload['weather_cloud_cover_pct'] = weather.conditions.cloud_cover_percent
    payload['weather_wind_speed_ms'] = weather.conditions.wind_speed_ms
  }
  if (Object.keys(payload).length > 0) {
    liveRawPayload.value = payload
    isLive.value = true
  }
})

const versionOptions = versions.map(v => ({
  label: `${v.version} — ${v.status === 'active' ? 'Active' : v.status === 'deprecated' ? 'Deprecated' : 'Draft'} (${new Date(v.publishedAt).toLocaleDateString('en-GB')})`,
  value: v.version
}))

const leftVersion = ref(versions[0].version)
const rightVersion = ref(versions[1].version)

const leftSchema = computed<SchemaVersion>(() => versions.find(v => v.version === leftVersion.value) ?? versions[0])
const rightSchema = computed<SchemaVersion>(() => versions.find(v => v.version === rightVersion.value) ?? versions[1])

// Build flat comparison objects from schema.properties for the JsonCompare component
function buildCompareObj(schemaVersion: SchemaVersion): Record<string, unknown> {
  const props = (schemaVersion.schema.properties ?? {}) as Record<string, Record<string, string>>
  const result: Record<string, unknown> = {}
  for (const [key, def] of Object.entries(props)) {
    result[key] = `${def.type}${def.unit ? ` (${def.unit})` : ''}${def.description ? ` — ${def.description}` : ''}`
  }
  return result
}

// When live data is available, use the real API payload structure for the left side
const leftObj = computed(() =>
  isLive.value && liveRawPayload.value ? liveRawPayload.value : buildCompareObj(leftSchema.value)
)
const rightObj = computed(() => buildCompareObj(rightSchema.value))

const isSameVersion = computed(() => leftVersion.value === rightVersion.value)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="view-page">
    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> Live — left panel shows real API payload structure from simulation
    </div>
    <PageHeader
      title="Schema Compare"
      subtitle="Side-by-side schema version diff with field-level change tracking"
      :breadcrumbs="[{ label: 'Provenance & Audit' }, { label: 'Schema Compare' }]"
    />

    <div class="view-body">
      <!-- Version selectors -->
      <div class="card card-body">
        <div class="selector-row">
          <div class="version-selector">
            <label class="vs-label">Compare</label>
            <Select
              v-model="leftVersion"
              :options="versionOptions"
              option-label="label"
              option-value="value"
              placeholder="Select version"
              class="vs-select"
            />
            <div class="version-meta">
              <StatusBadge :status="leftSchema.status" size="sm" />
              <span class="vm-date">Published: {{ formatDate(leftSchema.publishedAt) }}</span>
              <span class="vm-author">by {{ leftSchema.publishedBy }}</span>
            </div>
          </div>

          <div class="selector-divider">
            <i class="pi pi-arrows-h"></i>
            <span>vs</span>
          </div>

          <div class="version-selector">
            <label class="vs-label">With</label>
            <Select
              v-model="rightVersion"
              :options="versionOptions"
              option-label="label"
              option-value="value"
              placeholder="Select version"
              class="vs-select"
            />
            <div class="version-meta">
              <StatusBadge :status="rightSchema.status" size="sm" />
              <span class="vm-date">Published: {{ formatDate(rightSchema.publishedAt) }}</span>
              <span class="vm-author">by {{ rightSchema.publishedBy }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Same version warning -->
      <div v-if="isSameVersion" class="same-version-notice">
        <i class="pi pi-info-circle"></i>
        <span>Both selectors point to the same version. Select different versions to see a diff.</span>
      </div>

      <!-- Changelogs -->
      <div v-if="!isSameVersion" class="changelogs-row">
        <div class="changelog-card">
          <div class="cl-label">{{ leftSchema.version }} Changelog</div>
          <p class="cl-text">{{ leftSchema.changelog }}</p>
        </div>
        <div class="changelog-card changelog-card--right">
          <div class="cl-label">{{ rightSchema.version }} Changelog</div>
          <p class="cl-text">{{ rightSchema.changelog }}</p>
        </div>
      </div>

      <!-- Diff comparison -->
      <div class="card card-body">
        <div class="compare-header">
          <h3 class="ch-title">EnergyMeterReading Schema — Field Comparison</h3>
          <p class="ch-subtitle">
            Comparing schema properties (field name → type + unit + description).
            Added fields appear green, removed red, changed amber.
          </p>
        </div>
        <JsonCompare
          :original="leftObj"
          :transformed="rightObj"
          :original-label="isLive ? 'Live API Payload (Simulation)' : `${leftSchema.version} — ${leftSchema.status}`"
          :transformed-label="`${rightSchema.version} — ${rightSchema.status}`"
        />
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

.selector-row {
  display: flex;
  align-items: flex-start;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.version-selector {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  min-width: 260px;
}

.vs-label {
  font-size: 0.786rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--facis-text-muted);
}

.vs-select {
  width: 100%;
}

.version-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.vm-date, .vm-author {
  font-size: 0.75rem;
  color: var(--facis-text-secondary);
}

.selector-divider {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding-top: 1.5rem;
  color: var(--facis-text-muted);
  font-size: 0.75rem;
  font-weight: 600;
  flex-shrink: 0;
}

.selector-divider .pi {
  font-size: 1.25rem;
}

.same-version-notice {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.875rem 1.25rem;
  background: var(--facis-primary-light);
  border: 1px solid #bfdbfe;
  border-radius: var(--facis-radius);
  font-size: 0.875rem;
  color: #1d4ed8;
}

.changelogs-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

@media (max-width: 700px) {
  .changelogs-row { grid-template-columns: 1fr; }
}

.changelog-card {
  background: var(--facis-surface);
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  padding: 1rem 1.25rem;
  border-left: 3px solid var(--facis-text-muted);
}

.changelog-card--right {
  border-left-color: var(--facis-primary);
}

.cl-label {
  font-size: 0.786rem;
  font-weight: 600;
  color: var(--facis-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.5rem;
}

.cl-text {
  font-size: 0.875rem;
  color: var(--facis-text);
  line-height: 1.6;
}

.compare-header {
  margin-bottom: 1.25rem;
}

.ch-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--facis-text);
  margin-bottom: 0.25rem;
}

.ch-subtitle {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
  line-height: 1.5;
}
</style>
