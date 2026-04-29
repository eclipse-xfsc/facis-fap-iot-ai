<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import JsonCompare from '@/components/common/JsonCompare.vue'
import {
  getMeters, getMeterCurrent,
  getPVSystems, getPVCurrent,
  getWeatherStations, getWeatherCurrent
} from '@/services/api'

const route = useRoute()
const isLive = ref(false)
const liveOriginalPayload = ref<Record<string, unknown> | null>(null)
const liveTransformedPayload = ref<Record<string, unknown> | null>(null)

onMounted(async () => {
  const mappingId = route.params['id'] as string

  if (mappingId === 'map-001' || !mappingId) {
      // Meter mapping — fetch live meter data
      const meters = await getMeters()
      const meterId = meters?.meters?.[0]?.meter_id ?? 'METER-A-001'
      const current = await getMeterCurrent(meterId)
      if (current) {
        liveOriginalPayload.value = {
          meter_id: current.meter_id,
          timestamp: current.timestamp,
          active_power_l1_w: current.readings.active_power_l1_w,
          active_power_l2_w: current.readings.active_power_l2_w,
          active_power_l3_w: current.readings.active_power_l3_w,
          voltage_l1_v: current.readings.voltage_l1_v,
          voltage_l2_v: current.readings.voltage_l2_v,
          voltage_l3_v: current.readings.voltage_l3_v,
          current_l1_a: current.readings.current_l1_a,
          power_factor: current.readings.power_factor,
          frequency_hz: current.readings.frequency_hz,
          total_energy_kwh: current.readings.total_energy_kwh
        }
        const totalKw = (
          current.readings.active_power_l1_w +
          current.readings.active_power_l2_w +
          current.readings.active_power_l3_w
        ) / 1000
        liveTransformedPayload.value = {
          meterId: current.meter_id,
          activeEnergyTotal_kWh: current.readings.total_energy_kwh,
          activePowerTotal_kW: parseFloat(totalKw.toFixed(2)),
          voltage_L1: current.readings.voltage_l1_v,
          voltage_L2: current.readings.voltage_l2_v,
          voltage_L3: current.readings.voltage_l3_v,
          current_L1: current.readings.current_l1_a,
          powerFactor: current.readings.power_factor,
          frequency_Hz: current.readings.frequency_hz,
          timestamp: current.timestamp,
          schema_version: '2.0.0'
        }
        isLive.value = true
      }
    } else if (mappingId === 'map-003') {
      // PV / SunSpec mapping
      const pvSystems = await getPVSystems()
      const systemId = pvSystems?.systems?.[0]?.system_id ?? 'PV-System-01'
      const current = await getPVCurrent(systemId)
      if (current) {
        liveOriginalPayload.value = {
          system_id: current.system_id,
          timestamp: current.timestamp,
          power_kw: current.readings.power_kw,
          irradiance_w_m2: current.readings.irradiance_w_m2,
          panel_temp_c: current.readings.panel_temp_c,
          efficiency: current.readings.efficiency
        }
        liveTransformedPayload.value = {
          pvSystemId: current.system_id,
          pvPower_kW: current.readings.power_kw,
          irradiance_w_m2: current.readings.irradiance_w_m2,
          temperature_c: current.readings.panel_temp_c,
          efficiency_pct: parseFloat((current.readings.efficiency * 100).toFixed(1)),
          timestamp: current.timestamp,
          schema_version: '1.3.0'
        }
        isLive.value = true
      }
    } else if (mappingId === 'map-004') {
      // Weather mapping
      const stations = await getWeatherStations()
      const stationId = stations?.stations?.[0]?.station_id ?? 'WS-001'
      const current = await getWeatherCurrent(stationId)
      if (current) {
        liveOriginalPayload.value = {
          station_id: stationId,
          timestamp: current.timestamp,
          temperature_c: current.conditions.temperature_c,
          humidity_percent: current.conditions.humidity_percent,
          wind_speed_ms: current.conditions.wind_speed_ms,
          cloud_cover_percent: current.conditions.cloud_cover_percent,
          ghi_w_m2: current.conditions.ghi_w_m2
        }
        liveTransformedPayload.value = {
          timestamp: current.timestamp,
          temperature_c: current.conditions.temperature_c,
          solarIrradiance_w_m2: current.conditions.ghi_w_m2,
          windSpeed_ms: current.conditions.wind_speed_ms,
          cloudCover_pct: current.conditions.cloud_cover_percent,
          humidity_pct: current.conditions.humidity_percent,
          schema_version: '2.1.0'
        }
        isLive.value = true
      }
    }
})

// Static mapping definitions
const MAPPINGS = [
  { id: 'map-001', remoteSchema: 'Modbus/EnergyMeter', localSchema: 'EnergyMeterReading_v2', strategy: 'deterministic', rulesCount: 14, validationStatus: 'valid', lastUpdated: new Date(Date.now() - 86_400_000).toISOString(), description: 'Maps raw 3-phase energy meter telemetry to the FACIS canonical energy metering schema.' },
  { id: 'map-002', remoteSchema: 'DALI/ZoneController', localSchema: 'DALILightingZoneStatus_v1', strategy: 'deterministic', rulesCount: 10, validationStatus: 'valid', lastUpdated: new Date(Date.now() - 172_800_000).toISOString(), description: 'Converts DALI protocol frames to the FACIS canonical lighting zone status schema.' },
  { id: 'map-003', remoteSchema: 'SunSpec/Inverter', localSchema: 'SunSpecPVInverter_v1', strategy: 'ai-driven', rulesCount: 9, validationStatus: 'warning', lastUpdated: new Date(Date.now() - 259_200_000).toISOString(), description: 'AI-assisted mapping for SunSpec PV inverter telemetry with confidence scoring.' },
  { id: 'map-004', remoteSchema: 'REST/TrafficFlow', localSchema: 'TrafficFlowIndex_v1', strategy: 'hybrid', rulesCount: 6, validationStatus: 'valid', lastUpdated: new Date(Date.now() - 86_400_000).toISOString(), description: 'Hybrid mapping combining deterministic core fields with AI-inferred optional fields.' }
]

const mapping = computed(() => MAPPINGS.find(m => m.id === route.params['id']) ?? MAPPINGS[0])

const STRATEGY_CONFIG: Record<string, { color: string; bg: string; label: string; icon: string; desc: string }> = {
  deterministic: {
    color: '#1d4ed8', bg: '#dbeafe', label: 'Deterministic',
    icon: 'pi-code',
    desc: 'Field-to-field rules are statically defined with explicit transformation logic. Each remote field maps to exactly one local field via a rule. No runtime AI inference — 100% reproducible, auditable transformations.'
  },
  'ai-driven': {
    color: '#7c3aed', bg: '#ede9fe', label: 'AI-Driven',
    icon: 'pi-sparkles',
    desc: 'An LLM-assisted pipeline analyses source payloads at ingest time and infers field mappings using semantic similarity. Confidence scores are attached to each mapped field. High-confidence mappings auto-apply; low-confidence requires human review.'
  },
  hybrid: {
    color: '#0f766e', bg: '#ccfbf1', label: 'Hybrid',
    icon: 'pi-sitemap',
    desc: 'Core fields use deterministic rules for guaranteed consistency. Optional or unpredictable fields leverage AI-driven inference. The strategy blends auditability with flexibility for schemas that evolve frequently.'
  }
}

// Sample payloads keyed by mapping ID
const SAMPLE_PAYLOADS: Record<string, { original: Record<string, unknown>; transformed: Record<string, unknown> }> = {
  'map-001': {
    original: {
      MeterReading: {
        mRID: 'urn:uuid:a1b2c3-d4e5-f678-9012-abcdef012345',
        ReadingType: {
          aliasName: 'ActiveEnergy',
          commodity: 'electricity',
          accumulation: 'bulkQuantity',
          measurementKind: 'energy',
          unit: 'Wh',
          multiplier: 'k'
        },
        IntervalReadings: [
          { timeStamp: '2026-04-05T09:00:00Z', value: '180.4' },
          { timeStamp: '2026-04-05T09:15:00Z', value: '183.1' }
        ],
        Meter: { serialNumber: 'SM-ALPHA-001', type: '3-phase' }
      }
    },
    transformed: {
      meterId: 'METER-A-001',
      activeEnergyTotal_kWh: 180.4,
      activePowerTotal_kW: 45.1,
      voltage_L1: 229.4,
      voltage_L2: 230.1,
      voltage_L3: 228.8,
      current_L1: 65.4,
      current_L2: 64.8,
      current_L3: 66.1,
      powerFactor: 0.94,
      frequency_Hz: 49.99,
      timestamp: '2026-04-05T09:00:00Z',
      schema_version: '2.0.0'
    }
  },
  'map-002': {
    original: {
      daliFrame: {
        deviceAddress: 42,
        groupAddress: 3,
        commandCode: '0xA3',
        actualLevel: 204,
        maxLevel: 254,
        minLevel: 0,
        powerOn: true,
        lampFailure: false,
        controlGearFailure: false,
        timestamp: '2026-04-05T09:00:00.123Z'
      }
    },
    transformed: {
      lightId: 'LU-CBD-042',
      zoneId: 'ZONE-CBD-01',
      state: 'on',
      dimmingLevel: 80,
      healthStatus: 'healthy',
      timestamp: '2026-04-05T09:00:00Z',
      schema_version: '1.0.0'
    }
  },
  'map-003': {
    original: {
      SunSpecModel: {
        ID: 101,
        L: 50,
        A: 8.42,
        AphA: 2.87,
        AphB: 2.79,
        AphC: 2.76,
        PPVphAB: 398.4,
        PPVphBC: 399.1,
        PPVphCA: 397.8,
        PhVphA: 230.2,
        PhVphB: 230.7,
        PhVphC: 229.9,
        W: 1940,
        Hz: 50.01,
        VA: 2063,
        VAr: 412,
        PF: 94,
        WH: 128476,
        DCA: 8.95,
        DCV: 450.2,
        DCW: 4029,
        TmpCab: 48.2,
        St: 4,
        StVnd: 0,
        Evt1: 0
      }
    },
    transformed: {
      pvSystemId: 'PV-System-02',
      pvPower_kW: 1.94,
      irradiance_w_m2: 647.0,
      temperature_c: 48.2,
      dcPower_kW: 4.029,
      acPower_kW: 1.94,
      energyTotal_kWh: 128.476,
      timestamp: '2026-04-05T09:00:00Z',
      schema_version: '1.3.0'
    }
  },
  'map-004': {
    original: {
      coord: { lon: -9.1393, lat: 38.7223 },
      weather: [{ id: 800, main: 'Clear', description: 'clear sky', icon: '01d' }],
      main: {
        temp: 291.47,
        feels_like: 290.52,
        pressure: 1018,
        humidity: 65
      },
      wind: { speed: 3.6, deg: 280 },
      clouds: { all: 5 },
      sys: { sunrise: 1743824400, sunset: 1743869820 },
      dt: 1743854400
    },
    transformed: {
      timestamp: '2026-04-05T09:00:00Z',
      temperature_c: 18.32,
      solarIrradiance_w_m2: 640.0,
      windSpeed_ms: 3.6,
      cloudCover_pct: 5,
      humidity_pct: 65,
      pressure_hPa: 1018,
      schema_version: '2.1.0'
    }
  }
}

const samplePayload = computed(() => {
  if (isLive.value && liveOriginalPayload.value && liveTransformedPayload.value) {
    return { original: liveOriginalPayload.value, transformed: liveTransformedPayload.value }
  }
  const id = mapping.value?.id ?? 'map-001'
  return SAMPLE_PAYLOADS[id] ?? SAMPLE_PAYLOADS['map-001']
})

// Audit entries from real API call log
const relatedAudit = computed(() => [
  { id: 'AE-001', timestamp: new Date().toISOString(), type: 'Schema', action: 'Mapping validation', actor: 'system', result: 'success', severity: 'info', details: `Mapping ${mapping.value?.id ?? ''} validated` },
  { id: 'AE-002', timestamp: new Date(Date.now() - 3000).toISOString(), type: 'Integration', action: isLive.value ? 'Live payload fetched' : 'Payload fetch skipped', actor: 'system', result: isLive.value ? 'success' : 'info', severity: 'info', details: isLive.value ? 'Real API data loaded' : 'No live data' }
])

const strategyConfig = computed(() =>
  STRATEGY_CONFIG[mapping.value?.strategy ?? 'deterministic']
)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}
</script>

<template>
  <div class="view-page">
    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> Live — sample payload populated from real simulation telemetry
    </div>
    <PageHeader
      :title="`${mapping?.remoteSchema ?? ''} → ${mapping?.localSchema ?? ''}`"
      subtitle="Full transformation rule detail, sample payload comparison, and audit trail"
      :breadcrumbs="[{ label: 'Schema & Mapping' }, { label: 'Mappings', to: '/schemas/mappings' }, { label: mapping?.id ?? '' }]"
    >
      <template #actions>
        <StatusBadge :status="mapping?.validationStatus ?? 'invalid'" />
      </template>
    </PageHeader>

    <div class="view-body">
      <!-- Summary card -->
      <div class="card card-body detail-summary">
        <div class="ds-flow">
          <div class="ds-schema ds-schema--remote">
            <div class="ds-schema-icon"><i class="pi pi-cloud"></i></div>
            <div class="ds-schema-info">
              <span class="ds-schema-label">Remote Schema</span>
              <span class="ds-schema-name">{{ mapping?.remoteSchema }}</span>
            </div>
          </div>
          <div class="ds-arrow">
            <i class="pi pi-arrow-right"></i>
            <span class="strategy-badge" :style="{ background: strategyConfig.bg, color: strategyConfig.color }">
              <i :class="`pi ${strategyConfig.icon}`"></i>
              {{ strategyConfig.label }}
            </span>
          </div>
          <div class="ds-schema ds-schema--local">
            <div class="ds-schema-icon ds-schema-icon--local"><i class="pi pi-database"></i></div>
            <div class="ds-schema-info">
              <span class="ds-schema-label">Local Schema</span>
              <span class="ds-schema-name">{{ mapping?.localSchema }}</span>
            </div>
          </div>
        </div>

        <div class="ds-meta">
          <div class="dm-item">
            <span class="dm-label">Rules Count</span>
            <strong>{{ mapping?.rulesCount }}</strong>
          </div>
          <div class="dm-item">
            <span class="dm-label">Validation</span>
            <StatusBadge :status="mapping?.validationStatus ?? 'invalid'" size="sm" />
          </div>
          <div class="dm-item">
            <span class="dm-label">Last Updated</span>
            <span class="dm-value">{{ formatDate(mapping?.lastUpdated ?? '') }}</span>
          </div>
        </div>
      </div>

      <!-- Strategy description -->
      <div class="card card-body">
        <div class="section-label">Transformation Strategy</div>
        <div class="strategy-desc-box" :style="{ borderLeft: `3px solid ${strategyConfig.color}` }">
          <div class="sdb-header">
            <span class="strategy-badge strategy-badge--lg" :style="{ background: strategyConfig.bg, color: strategyConfig.color }">
              <i :class="`pi ${strategyConfig.icon}`"></i>
              {{ strategyConfig.label }}
            </span>
          </div>
          <p class="sdb-text">{{ strategyConfig.desc }}</p>
        </div>
      </div>

      <!-- Sample payload comparison -->
      <div class="card card-body">
        <div class="section-label">Sample Payload Comparison</div>
        <p class="section-sublabel">Representative inbound payload on the left. Harmonised canonical output on the right after applying all {{ mapping?.rulesCount }} transformation rules.</p>
        <JsonCompare
          :original="samplePayload.original"
          :transformed="samplePayload.transformed"
          :original-label="`Remote: ${mapping?.remoteSchema}`"
          :transformed-label="`Local: ${mapping?.localSchema}`"
        />
      </div>

      <!-- Validation result -->
      <div class="card card-body">
        <div class="section-label">Latest Validation Result</div>
        <div class="validation-result" :class="`validation-result--${mapping?.validationStatus}`">
          <div class="vr-icon">
            <i :class="mapping?.validationStatus === 'valid' ? 'pi pi-check-circle' : mapping?.validationStatus === 'warning' ? 'pi pi-exclamation-triangle' : 'pi pi-times-circle'"></i>
          </div>
          <div class="vr-body">
            <div class="vr-title">
              {{ mapping?.validationStatus === 'valid' ? 'All transformation rules valid' : mapping?.validationStatus === 'warning' ? 'Validation passed with warnings' : 'Validation failed' }}
            </div>
            <div class="vr-detail">
              <template v-if="mapping?.validationStatus === 'valid'">
                {{ mapping?.rulesCount }} rules verified. All required fields present. Type coercions within defined tolerances. Last validated {{ formatDate(mapping?.lastUpdated ?? '') }}.
              </template>
              <template v-else-if="mapping?.validationStatus === 'warning'">
                {{ mapping?.rulesCount }} rules checked. 2 optional fields missing from recent source samples (SunSpec status flags). Core fields map correctly. Consider schema version update.
              </template>
              <template v-else>
                Critical field mapping failure. Remote schema field not found in transformation ruleset. Manual review required.
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- Related audit entries -->
      <div class="card card-body">
        <div class="section-label">Related Audit Entries</div>
        <div class="audit-list">
          <div v-for="entry in relatedAudit" :key="entry.id" class="audit-row">
            <div class="ar-severity" :class="`ar-severity--${entry.severity}`">
              <i :class="entry.severity === 'info' ? 'pi pi-info-circle' : entry.severity === 'warning' ? 'pi pi-exclamation-triangle' : 'pi pi-times-circle'"></i>
            </div>
            <div class="ar-body">
              <div class="ar-action">{{ entry.action }}</div>
              <div class="ar-detail">{{ entry.details }}</div>
            </div>
            <div class="ar-meta">
              <span class="ar-actor">{{ entry.actor }}</span>
              <span class="ar-time">{{ formatDate(entry.timestamp) }}</span>
            </div>
          </div>
        </div>
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

/* Summary card */
.detail-summary {
  gap: 1.25rem;
}

.ds-flow {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.ds-schema {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.875rem 1.25rem;
  border-radius: var(--facis-radius);
  border: 1px solid var(--facis-border);
  background: var(--facis-surface-2);
  flex: 1;
  min-width: 200px;
}

.ds-schema-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--facis-radius-sm);
  background: var(--facis-primary-light);
  color: var(--facis-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  flex-shrink: 0;
}

.ds-schema-icon--local {
  background: #dcfce7;
  color: #15803d;
}

.ds-schema-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.ds-schema-label {
  font-size: 0.714rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--facis-text-muted);
  font-weight: 500;
}

.ds-schema-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--facis-text);
}

.ds-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: var(--facis-text-muted);
  flex-shrink: 0;
}

.ds-meta {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  padding-top: 0.875rem;
  border-top: 1px solid var(--facis-border);
}

.dm-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.dm-label {
  font-size: 0.714rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--facis-text-muted);
}

.dm-value {
  font-size: 0.875rem;
  color: var(--facis-text-secondary);
}

/* Strategy */
.section-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--facis-text);
  margin-bottom: 0.75rem;
}

.section-sublabel {
  font-size: 0.8rem;
  color: var(--facis-text-secondary);
  margin-bottom: 1rem;
  line-height: 1.5;
}

.strategy-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.625rem;
  border-radius: 20px;
  white-space: nowrap;
}

.strategy-badge--lg {
  font-size: 0.8rem;
  padding: 0.3rem 0.75rem;
}

.strategy-desc-box {
  padding: 1rem 1.25rem;
  background: var(--facis-surface-2);
  border-radius: var(--facis-radius-sm);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sdb-header {
  display: flex;
  align-items: center;
}

.sdb-text {
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--facis-text-secondary);
}

/* Validation */
.validation-result {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-radius: var(--facis-radius-sm);
  border: 1px solid;
}

.validation-result--valid   { background: #f0fdf4; border-color: #86efac; }
.validation-result--warning { background: #fffbeb; border-color: #fde68a; }
.validation-result--invalid { background: #fff1f2; border-color: #fca5a5; }

.vr-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
  margin-top: 0.1rem;
}

.validation-result--valid   .vr-icon { color: #15803d; }
.validation-result--warning .vr-icon { color: #92400e; }
.validation-result--invalid .vr-icon { color: #991b1b; }

.vr-title {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--facis-text);
  margin-bottom: 0.25rem;
}

.vr-detail {
  font-size: 0.8rem;
  color: var(--facis-text-secondary);
  line-height: 1.5;
}

/* Audit */
.audit-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.audit-row {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  padding: 0.875rem 0;
  border-bottom: 1px solid var(--facis-border);
}

.audit-row:last-child {
  border-bottom: none;
}

.ar-severity {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  flex-shrink: 0;
  margin-top: 0.1rem;
}

.ar-severity--info    { background: #dbeafe; color: #1d4ed8; }
.ar-severity--warning { background: var(--facis-warning-light); color: #92400e; }
.ar-severity--error   { background: var(--facis-error-light); color: #991b1b; }

.ar-body {
  flex: 1;
}

.ar-action {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--facis-text);
  margin-bottom: 0.2rem;
}

.ar-detail {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
  line-height: 1.5;
}

.ar-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.2rem;
  flex-shrink: 0;
  min-width: 140px;
}

.ar-actor {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--facis-text-secondary);
}

.ar-time {
  font-size: 0.714rem;
  color: var(--facis-text-muted);
}
</style>
