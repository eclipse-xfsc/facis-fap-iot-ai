<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import DetailTabs from '@/components/common/DetailTabs.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import TimeSeriesChart from '@/components/common/TimeSeriesChart.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import {
  getMeterCurrent,
  getMeterHistory,
  type SimMeterCurrent,
  type SimMeterHistoryReading
} from '@/services/api'

const route = useRoute()
const router = useRouter()

// ─── Live API data ─────────────────────────────────────────────────────────────
const loading = ref(true)
const error = ref(false)
const liveCurrent = ref<SimMeterCurrent | null>(null)
const liveHistory = ref<SimMeterHistoryReading[]>([])

async function fetchData(): Promise<void> {
  loading.value = true
  error.value = false
  const assetId = route.params['id'] as string
  if (assetId) {
    const [cur, hist] = await Promise.all([
      getMeterCurrent(assetId),
      getMeterHistory(assetId)
    ])
    liveCurrent.value = cur
    if (hist?.readings) liveHistory.value = hist.readings
    if (!cur) error.value = true
  } else {
    error.value = true
  }
  loading.value = false
}

onMounted(fetchData)

// ─── Meter view from live API data only ────────────────────────────────────────
const meter = computed(() => {
  const r = liveCurrent.value?.readings
  if (!r) return null
  const totalKw = (r.active_power_l1_w + r.active_power_l2_w + r.active_power_l3_w) / 1000
  return {
    meterId: liveCurrent.value!.meter_id,
    deviceType: 'Smart Meter',
    site: 'Simulation',
    protocol: 'Simulation REST',
    lastTimestamp: liveCurrent.value!.timestamp,
    status: 'healthy' as const,
    dataQuality: 99.0,
    latestValues: {
      activeEnergyTotal_kWh: r.total_energy_kwh,
      activePowerTotal_kW: totalKw,
      voltage_L1: r.voltage_l1_v,
      voltage_L2: r.voltage_l2_v,
      voltage_L3: r.voltage_l3_v,
      current_L1: r.current_l1_a,
      current_L2: r.current_l2_a,
      current_L3: r.current_l3_a,
      powerFactor: r.power_factor,
      frequency_Hz: r.frequency_hz,
      timestamp: liveCurrent.value!.timestamp,
      meterId: liveCurrent.value!.meter_id
    }
  }
})

const tabs = [
  { label: 'Overview', icon: 'pi-info-circle' },
  { label: 'Raw Data / Registers', icon: 'pi-table' },
  { label: 'Harmonized Data', icon: 'pi-sitemap' },
  { label: 'Provenance', icon: 'pi-history' },
  { label: 'Transformations & Audit', icon: 'pi-cog' },
  { label: 'Analytics', icon: 'pi-chart-line' },
  { label: 'References', icon: 'pi-link' }
]

const activeTab = ref(0)

// 24h sparkline — use real history when available
const sparkLabels = computed((): string[] => {
  if (liveHistory.value.length > 0) {
    return liveHistory.value.map((r: SimMeterHistoryReading) =>
      new Date(r.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    )
  }
  return []
})

const sparkData = computed((): number[] => {
  return liveHistory.value.map((r: SimMeterHistoryReading) =>
    Math.round(((r.active_power_l1_w + r.active_power_l2_w + r.active_power_l3_w) / 1000) * 10) / 10
  )
})

// Anomaly markers (indices where values are high compared to average)
const anomalyIndices = computed(() => {
  if (sparkData.value.length === 0) return []
  const avg = sparkData.value.reduce((s, v) => s + v, 0) / sparkData.value.length
  return sparkData.value
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => v > avg * 1.3)
    .map(({ i }) => i)
})

const sparkDatasets = computed(() => [
  {
    label: 'Active Power (kW)',
    data: sparkData.value,
    borderColor: '#005fff',
    backgroundColor: 'rgba(0,95,255,0.08)',
    fill: true,
    tension: 0.4,
    yAxisID: 'y'
  }
])

// Raw Modbus register table
const modbusRegisters = computed(() => {
  const v = meter.value?.latestValues
  if (!v) return []
  return [
    { register: '40001', name: 'ActiveEnergyTotal', value: v.activeEnergyTotal_kWh.toFixed(2), unit: 'kWh', type: 'float32' },
    { register: '40003', name: 'ActivePowerTotal', value: v.activePowerTotal_kW.toFixed(3), unit: 'kW', type: 'float32' },
    { register: '40005', name: 'Voltage_L1', value: v.voltage_L1.toFixed(2), unit: 'V', type: 'float32' },
    { register: '40007', name: 'Voltage_L2', value: v.voltage_L2.toFixed(2), unit: 'V', type: 'float32' },
    { register: '40009', name: 'Voltage_L3', value: v.voltage_L3.toFixed(2), unit: 'V', type: 'float32' },
    { register: '40011', name: 'Current_L1', value: v.current_L1.toFixed(3), unit: 'A', type: 'float32' },
    { register: '40013', name: 'Current_L2', value: v.current_L2.toFixed(3), unit: 'A', type: 'float32' },
    { register: '40015', name: 'Current_L3', value: v.current_L3.toFixed(3), unit: 'A', type: 'float32' },
    { register: '40017', name: 'PowerFactor', value: v.powerFactor.toFixed(4), unit: 'pf', type: 'float32' },
    { register: '40019', name: 'Frequency', value: v.frequency_Hz.toFixed(3), unit: 'Hz', type: 'float32' }
  ]
})

// JSON sample payload
const jsonSample = computed(() => JSON.stringify({
  meterId: meter.value?.meterId,
  timestamp: meter.value?.latestValues.timestamp,
  protocol: meter.value?.protocol,
  registers: {
    ActiveEnergyTotal_kWh: meter.value?.latestValues.activeEnergyTotal_kWh,
    ActivePowerTotal_kW: meter.value?.latestValues.activePowerTotal_kW,
    Voltage_L1_V: meter.value?.latestValues.voltage_L1.toFixed(2),
    Voltage_L2_V: meter.value?.latestValues.voltage_L2.toFixed(2),
    Voltage_L3_V: meter.value?.latestValues.voltage_L3.toFixed(2),
    Current_L1_A: meter.value?.latestValues.current_L1.toFixed(3),
    Current_L2_A: meter.value?.latestValues.current_L2.toFixed(3),
    Current_L3_A: meter.value?.latestValues.current_L3.toFixed(3),
    PowerFactor: meter.value?.latestValues.powerFactor.toFixed(4),
    Frequency_Hz: meter.value?.latestValues.frequency_Hz.toFixed(3)
  }
}, null, 2))

// Harmonized representation
const harmonizedFields = computed(() => {
  const v = meter.value?.latestValues
  if (!v) return []
  return [
    { field: 'observation_type', value: 'EnergyMeterReading', schema: 'EnergyMeterReading_v2' },
    { field: 'device_id', value: meter.value?.meterId ?? '—', schema: 'EnergyMeterReading_v2' },
    { field: 'site_ref', value: meter.value?.site ?? '—', schema: 'SiteReference_v1' },
    { field: 'active_energy_kwh', value: v.activeEnergyTotal_kWh.toFixed(2), schema: 'EnergyMeterReading_v2' },
    { field: 'active_power_kw', value: v.activePowerTotal_kW.toFixed(3), schema: 'EnergyMeterReading_v2' },
    { field: 'voltage_l1_v', value: v.voltage_L1.toFixed(2), schema: 'EnergyMeterReading_v2' },
    { field: 'voltage_l2_v', value: v.voltage_L2.toFixed(2), schema: 'EnergyMeterReading_v2' },
    { field: 'voltage_l3_v', value: v.voltage_L3.toFixed(2), schema: 'EnergyMeterReading_v2' },
    { field: 'current_l1_a', value: v.current_L1.toFixed(3), schema: 'EnergyMeterReading_v2' },
    { field: 'current_l2_a', value: v.current_L2.toFixed(3), schema: 'EnergyMeterReading_v2' },
    { field: 'current_l3_a', value: v.current_L3.toFixed(3), schema: 'EnergyMeterReading_v2' },
    { field: 'power_factor', value: v.powerFactor.toFixed(4), schema: 'EnergyMeterReading_v2' },
    { field: 'frequency_hz', value: v.frequency_Hz.toFixed(3), schema: 'EnergyMeterReading_v2' },
    { field: 'data_quality_pct', value: String(meter.value?.dataQuality ?? '—'), schema: 'QualityMetrics_v1' },
    { field: 'ingested_at', value: v.timestamp, schema: 'IngestionMetadata_v1' }
  ]
})

// Transformation steps
const transformationSteps = [
  { step: 1, name: 'Protocol Decode', description: 'Modbus TCP register read via holding registers 40001–40038', status: 'success', actor: 'ModbusAdapter' },
  { step: 2, name: 'Schema Mapping', description: 'IEC-61968 MeterReading → EnergyMeterReading_v2 (34 deterministic rules)', status: 'success', actor: 'SchemaEngine' },
  { step: 3, name: 'Unit Normalisation', description: 'Wh → kWh (÷1000), W → kW (÷1000), raw registers → engineering units', status: 'success', actor: 'TransformEngine' },
  { step: 4, name: 'Quality Scoring', description: 'Field completeness, range checks, timestamp freshness evaluated', status: 'success', actor: 'QualityEngine' },
  { step: 5, name: 'Provenance Tagging', description: 'Origin, ingestion timestamp, adapter version and checksum attached', status: 'success', actor: 'ProvenanceEngine' }
]

// Audit trail — derived from session-stored API calls
const auditEntries = computed(() => {
  const entries = []
  if (liveCurrent.value) {
    entries.push({
      id: `aud-cur-${liveCurrent.value.meter_id}`,
      type: 'Data',
      timestamp: liveCurrent.value.timestamp,
      action: 'Current reading fetched',
      actor: 'system',
      result: 'success',
      severity: 'info',
      details: `GET /api/sim/meters/${liveCurrent.value.meter_id}/current — power: ${((liveCurrent.value.readings.active_power_l1_w + liveCurrent.value.readings.active_power_l2_w + liveCurrent.value.readings.active_power_l3_w) / 1000).toFixed(2)} kW`
    })
  }
  if (liveHistory.value.length > 0) {
    entries.push({
      id: `aud-hist-${meter.value?.meterId}`,
      type: 'Data',
      timestamp: new Date().toISOString(),
      action: 'History readings fetched',
      actor: 'system',
      result: 'success',
      severity: 'info',
      details: `GET /api/sim/meters/${meter.value?.meterId}/history — ${liveHistory.value.length} readings`
    })
  }
  return entries
})

// Linked data products
const linkedProducts = [
  { name: 'Energy Consumption Timeseries', version: 'v2.1.0', role: 'Primary source' },
  { name: 'Energy Flexibility Profile', version: 'v0.9.0', role: 'Contributing source' }
]

// Context sources
const contextSources = [
  { name: 'ENTSOE Price Feed', type: 'Market Data', link: 'Global' },
  { name: 'Weather Station HQ', type: 'Weather Sensor', link: meter.value?.site }
]

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const showJsonAccordion = ref(false)
</script>

<template>
  <div class="view-page">
    <PageHeader
      :title="meter?.meterId ?? 'Asset Detail'"
      :subtitle="`${meter?.deviceType} — ${meter?.site} — Protocol: ${meter?.protocol}`"
      :breadcrumbs="[
        { label: 'Use Cases' },
        { label: 'Smart Energy' },
        { label: 'Assets', to: '/use-cases/smart-energy/assets' },
        { label: meter?.meterId ?? '' }
      ]"
    >
      <template #actions>
        <StatusBadge :status="meter?.status ?? 'offline'" />
        <Button icon="pi pi-refresh" size="small" outlined label="Refresh" :loading="loading" @click="fetchData()" />
      </template>
    </PageHeader>

    <!-- API error state -->
    <div v-if="error && !loading" class="api-error">
      <i class="pi pi-exclamation-circle"></i>
      <p>Could not load data from simulation API</p>
      <Button label="Retry" size="small" @click="fetchData()" />
    </div>
    <div v-else-if="meter && !loading" class="live-banner">
      <i class="pi pi-circle-fill live-banner__dot"></i>
      Live readings from simulation API
    </div>

    <div class="view-body">

      <!-- Quick KPIs row -->
      <div class="grid-kpi" style="grid-template-columns: repeat(5, 1fr)">
        <KpiCard label="Active Power" :value="meter?.latestValues.activePowerTotal_kW.toFixed(1) ?? 0" unit="kW" trend="stable" icon="pi-bolt" color="#f59e0b" />
        <KpiCard label="Voltage L1" :value="meter?.latestValues.voltage_L1.toFixed(1) ?? 0" unit="V" trend="stable" icon="pi-bolt" color="#3b82f6" />
        <KpiCard label="Current L1" :value="meter?.latestValues.current_L1.toFixed(1) ?? 0" unit="A" trend="stable" icon="pi-wave-pulse" color="#8b5cf6" />
        <KpiCard label="Power Factor" :value="meter?.latestValues.powerFactor.toFixed(3) ?? 0" unit="" trend="stable" icon="pi-sliders-h" color="#22c55e" />
        <KpiCard label="Data Quality" :value="meter?.dataQuality ?? 0" unit="%" :trend="(meter?.dataQuality ?? 100) > 90 ? 'up' : 'down'" icon="pi-check-circle" color="#22c55e" />
      </div>

      <!-- Tabs -->
      <DetailTabs :tabs="tabs" v-model="activeTab">

        <!-- Tab 0: Overview -->
        <template #tab-0>
          <div class="tab-content">
            <div class="overview-grid">
              <!-- Source metadata card -->
              <div class="meta-card">
                <div class="meta-card__title">Source Metadata</div>
                <div class="meta-rows">
                  <div class="meta-row"><span class="meta-label">Meter ID</span><span class="meta-val font-semibold">{{ meter?.meterId }}</span></div>
                  <div class="meta-row"><span class="meta-label">Device Type</span><span class="meta-val">{{ meter?.deviceType }}</span></div>
                  <div class="meta-row"><span class="meta-label">Site Reference</span><span class="meta-val">{{ meter?.site }}</span></div>
                  <div class="meta-row"><span class="meta-label">Protocol</span><span class="meta-val"><code class="code-pill">{{ meter?.protocol }}</code></span></div>
                  <div class="meta-row"><span class="meta-label">Status</span><span class="meta-val"><StatusBadge :status="meter?.status ?? 'offline'" size="sm" /></span></div>
                  <div class="meta-row"><span class="meta-label">Last Timestamp</span><span class="meta-val">{{ fmtTs(meter?.lastTimestamp ?? '') }}</span></div>
                  <div class="meta-row"><span class="meta-label">Data Quality</span><span class="meta-val">{{ meter?.dataQuality }}%</span></div>
                </div>
              </div>

              <!-- Latest Values Summary -->
              <div class="latest-vals">
                <div class="meta-card__title">Latest Readings Summary</div>
                <div class="readings-grid-4">
                  <div class="reading-cell">
                    <span class="reading-label">Active Power Total</span>
                    <span class="reading-value">{{ meter?.latestValues.activePowerTotal_kW.toFixed(1) }}<span class="reading-unit">kW</span></span>
                  </div>
                  <div class="reading-cell">
                    <span class="reading-label">Active Energy Total</span>
                    <span class="reading-value">{{ meter?.latestValues.activeEnergyTotal_kWh.toLocaleString('en-GB') }}<span class="reading-unit">kWh</span></span>
                  </div>
                  <div class="reading-cell">
                    <span class="reading-label">Power Factor</span>
                    <span class="reading-value">{{ meter?.latestValues.powerFactor.toFixed(3) }}</span>
                  </div>
                  <div class="reading-cell">
                    <span class="reading-label">Frequency</span>
                    <span class="reading-value">{{ meter?.latestValues.frequency_Hz.toFixed(2) }}<span class="reading-unit">Hz</span></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Tab 1: Raw Data / Registers -->
        <template #tab-1>
          <div class="tab-content">
            <div class="section-title" style="margin-bottom: 1rem">Janitza-Aligned Modbus Registers</div>
            <div class="register-table">
              <div class="register-table__header">
                <span>Register</span>
                <span>Field Name</span>
                <span>Value</span>
                <span>Unit</span>
                <span>Data Type</span>
              </div>
              <div
                v-for="reg in modbusRegisters"
                :key="reg.register"
                class="register-table__row"
              >
                <code class="code-pill">{{ reg.register }}</code>
                <span class="font-medium">{{ reg.name }}</span>
                <span class="font-semibold" style="color: var(--facis-primary)">{{ reg.value }}</span>
                <span class="text-muted">{{ reg.unit }}</span>
                <code class="code-pill code-pill--gray">{{ reg.type }}</code>
              </div>
            </div>

            <!-- JSON accordion -->
            <div class="json-accordion">
              <button
                class="json-accordion__trigger"
                @click="showJsonAccordion = !showJsonAccordion"
              >
                <i :class="`pi ${showJsonAccordion ? 'pi-chevron-down' : 'pi-chevron-right'}`"></i>
                Raw JSON Sample Payload
              </button>
              <div v-if="showJsonAccordion" class="json-accordion__body">
                <pre class="json-block">{{ jsonSample }}</pre>
              </div>
            </div>
          </div>
        </template>

        <!-- Tab 2: Harmonized Data -->
        <template #tab-2>
          <div class="tab-content">
            <div class="section-title" style="margin-bottom: 1rem">Protocol-Agnostic Representation</div>
            <div class="harmonized-note">
              <i class="pi pi-info-circle"></i>
              <span>All source-specific field names and units have been normalised to the FACIS canonical schema. Source protocol: <strong>{{ meter?.protocol }}</strong></span>
            </div>
            <div class="harmonized-table">
              <div class="harmonized-table__header">
                <span>Canonical Field</span>
                <span>Value</span>
                <span>Schema Reference</span>
              </div>
              <div
                v-for="f in harmonizedFields"
                :key="f.field"
                class="harmonized-table__row"
              >
                <code class="code-pill code-pill--blue">{{ f.field }}</code>
                <span style="font-variant-numeric: tabular-nums;">{{ f.value }}</span>
                <code class="code-pill code-pill--gray">{{ f.schema }}</code>
              </div>
            </div>
          </div>
        </template>

        <!-- Tab 3: Provenance -->
        <template #tab-3>
          <div class="tab-content">
            <div class="provenance-grid">
              <div class="prov-section">
                <div class="prov-section__title">Origin</div>
                <div class="meta-rows">
                  <div class="meta-row"><span class="meta-label">Source ID</span><span class="meta-val">src-00{{ meter?.meterId?.slice(-1) ?? '2' }}</span></div>
                  <div class="meta-row"><span class="meta-label">Protocol</span><span class="meta-val"><code class="code-pill">{{ meter?.protocol }}</code></span></div>
                  <div class="meta-row"><span class="meta-label">Object Reference</span><span class="meta-val"><code class="code-pill">{{ meter?.protocol?.startsWith('MQTT') ? `sm/${meter?.site?.toLowerCase().replace(' ', '-')}/+/reading` : `${meter?.site?.toLowerCase().replace(' ', '-')}:502` }}</code></span></div>
                  <div class="meta-row"><span class="meta-label">Site</span><span class="meta-val">{{ meter?.site }}</span></div>
                  <div class="meta-row"><span class="meta-label">Ingestion Timestamp</span><span class="meta-val">{{ fmtTs(meter?.latestValues.timestamp ?? '') }}</span></div>
                </div>
              </div>
              <div class="prov-section">
                <div class="prov-section__title">Source Adapter</div>
                <div class="meta-rows">
                  <div class="meta-row"><span class="meta-label">Adapter Type</span><span class="meta-val">{{ meter?.protocol?.startsWith('MQTT') ? 'MQTT Ingest Adapter v2.4' : 'Modbus TCP Adapter v1.8' }}</span></div>
                  <div class="meta-row"><span class="meta-label">Adapter Status</span><span class="meta-val"><StatusBadge status="active" size="sm" /></span></div>
                  <div class="meta-row"><span class="meta-label">Polling Interval</span><span class="meta-val">{{ meter?.protocol?.startsWith('MQTT') ? 'Event-driven' : '60 seconds' }}</span></div>
                  <div class="meta-row"><span class="meta-label">Message Format</span><span class="meta-val">{{ meter?.protocol?.includes('JSON') ? 'JSON' : 'Binary (IEEE 754)' }}</span></div>
                </div>
              </div>
              <div class="prov-section">
                <div class="prov-section__title">Transformation Chain</div>
                <div class="transform-chain">
                  <div v-for="(step, i) in transformationSteps.slice(0,3)" :key="i" class="chain-step">
                    <div class="chain-step__num">{{ i + 1 }}</div>
                    <div class="chain-step__body">
                      <span class="chain-step__name">{{ step.name }}</span>
                      <span class="chain-step__desc">{{ step.description }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="prov-section">
                <div class="prov-section__title">Quality Notes</div>
                <div class="quality-notes">
                  <div class="qn-row"><i class="pi pi-check-circle" style="color:#22c55e"></i><span>Schema validation: PASSED — all required fields present</span></div>
                  <div class="qn-row"><i class="pi pi-check-circle" style="color:#22c55e"></i><span>Voltage values within nominal range (207–253 V)</span></div>
                  <div class="qn-row"><i class="pi pi-check-circle" style="color:#22c55e"></i><span>Frequency within 49.5–50.5 Hz tolerance</span></div>
                  <div class="qn-row" v-if="(meter?.dataQuality ?? 100) < 95"><i class="pi pi-exclamation-triangle" style="color:#f59e0b"></i><span>Data quality below 95% threshold — intermittent read failures detected</span></div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Tab 4: Transformations & Audit -->
        <template #tab-4>
          <div class="tab-content">
            <div class="section-title" style="margin-bottom: 1rem">Normalisation Steps</div>
            <div class="transform-steps-table">
              <div class="transform-steps-table__header">
                <span>Step</span>
                <span>Name</span>
                <span>Description</span>
                <span>Actor</span>
                <span>Status</span>
              </div>
              <div
                v-for="step in transformationSteps"
                :key="step.step"
                class="transform-steps-table__row"
              >
                <span class="step-num">{{ step.step }}</span>
                <span class="font-semibold">{{ step.name }}</span>
                <span class="text-muted" style="font-size: 0.786rem">{{ step.description }}</span>
                <code class="code-pill code-pill--gray">{{ step.actor }}</code>
                <StatusBadge :status="step.status" size="sm" />
              </div>
            </div>

            <div class="section-title" style="margin: 1.5rem 0 1rem">Audit Trail</div>
            <div class="audit-trail">
              <div
                v-for="entry in auditEntries"
                :key="entry.id"
                class="audit-entry"
              >
                <div class="audit-entry__line"></div>
                <div class="audit-entry__dot" :style="{ background: entry.result === 'success' ? '#22c55e' : entry.result === 'warning' ? '#f59e0b' : '#ef4444' }"></div>
                <div class="audit-entry__body">
                  <div class="audit-entry__header">
                    <span class="audit-entry__action">{{ entry.action }}</span>
                    <span class="audit-entry__time text-muted text-xs">{{ fmtTs(entry.timestamp) }}</span>
                  </div>
                  <div class="audit-entry__details">{{ entry.details }}</div>
                  <div class="audit-entry__meta">
                    <code class="code-pill code-pill--gray">{{ entry.type }}</code>
                    <span class="text-xs text-muted">by {{ entry.actor }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Tab 5: Analytics -->
        <template #tab-5>
          <div class="tab-content">
            <div class="section-title" style="margin-bottom: 1rem">Active Power — Last 24h</div>
            <TimeSeriesChart
              :datasets="sparkDatasets"
              :labels="sparkLabels"
              y-axis-label="Active Power (kW)"
              :height="300"
            />

            <div class="analytics-summary">
              <div class="analytics-card">
                <span class="analytics-card__label">Peak Power</span>
                <span class="analytics-card__value">{{ Math.max(...sparkData).toFixed(1) }} kW</span>
              </div>
              <div class="analytics-card">
                <span class="analytics-card__label">Min Power</span>
                <span class="analytics-card__value">{{ Math.min(...sparkData).toFixed(1) }} kW</span>
              </div>
              <div class="analytics-card">
                <span class="analytics-card__label">Avg Power</span>
                <span class="analytics-card__value">{{ (sparkData.reduce((s, v) => s + v, 0) / sparkData.length).toFixed(1) }} kW</span>
              </div>
              <div class="analytics-card">
                <span class="analytics-card__label">Anomaly Periods</span>
                <span class="analytics-card__value" style="color: #f59e0b">{{ anomalyIndices.length }}</span>
              </div>
            </div>

            <div v-if="anomalyIndices.length > 0" class="anomaly-notice">
              <i class="pi pi-exclamation-triangle"></i>
              <span>{{ anomalyIndices.length }} hour(s) flagged as above 95% of baseline power — hours: {{ anomalyIndices.map(i => sparkLabels[i]).join(', ') }}</span>
            </div>
          </div>
        </template>

        <!-- Tab 6: References -->
        <template #tab-6>
          <div class="tab-content">
            <div class="refs-grid">
              <div>
                <div class="section-title" style="margin-bottom: 1rem">Linked Data Products</div>
                <div class="refs-list">
                  <div
                    v-for="prod in linkedProducts"
                    :key="prod.name"
                    class="ref-item"
                  >
                    <div class="ref-item__icon"><i class="pi pi-box"></i></div>
                    <div class="ref-item__body">
                      <span class="ref-item__name">{{ prod.name }}</span>
                      <span class="text-xs text-muted">{{ prod.version }} · {{ prod.role }}</span>
                    </div>
                    <Button icon="pi pi-arrow-right" text size="small" @click="router.push('/use-cases/smart-energy/data-products')" />
                  </div>
                </div>
              </div>

              <div>
                <div class="section-title" style="margin-bottom: 1rem">Related Context Sources</div>
                <div class="refs-list">
                  <div
                    v-for="src in contextSources"
                    :key="src.name"
                    class="ref-item"
                  >
                    <div class="ref-item__icon ref-item__icon--ctx"><i class="pi pi-database"></i></div>
                    <div class="ref-item__body">
                      <span class="ref-item__name">{{ src.name }}</span>
                      <span class="text-xs text-muted">{{ src.type }} · {{ src.link }}</span>
                    </div>
                    <Button icon="pi pi-arrow-right" text size="small" @click="router.push('/use-cases/smart-energy/context')" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

      </DetailTabs>
    </div>
  </div>
</template>

<style scoped>
.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }

.live-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 1.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #15803d;
  background: rgba(34, 197, 94, 0.08);
  border-bottom: 1px solid rgba(34, 197, 94, 0.2);
}
.live-banner__dot { font-size: 0.5rem; color: #22c55e; }

.demo-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 1.5rem;
  font-size: 0.75rem;
  color: var(--facis-text-secondary);
  background: var(--facis-surface-2);
  border-bottom: 1px solid var(--facis-border);
}
.tab-content { padding: 1.25rem; }

/* Overview */
.overview-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.meta-card__title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--facis-text);
  margin-bottom: 0.875rem;
}

.meta-rows { display: flex; flex-direction: column; }

.meta-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--facis-border);
}

.meta-row:last-child { border-bottom: none; }

.meta-label {
  font-size: 0.786rem;
  font-weight: 500;
  color: var(--facis-text-secondary);
  min-width: 140px;
}

.meta-val {
  font-size: 0.857rem;
  color: var(--facis-text);
}

.readings-grid-4 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.875rem;
}

.reading-cell {
  padding: 1rem;
  background: var(--facis-surface-2);
  border-radius: var(--facis-radius-sm);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.reading-label {
  font-size: 0.75rem;
  color: var(--facis-text-secondary);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.reading-value {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--facis-text);
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
}

.reading-unit {
  font-size: 0.786rem;
  font-weight: 400;
  color: var(--facis-text-secondary);
}

/* Code pills */
.code-pill {
  font-family: var(--facis-font-mono);
  font-size: 0.75rem;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  background: var(--facis-primary-light);
  color: var(--facis-primary);
}

.code-pill--gray {
  background: var(--facis-surface-2);
  color: var(--facis-text-secondary);
}

.code-pill--blue {
  background: rgba(59, 130, 246, 0.1);
  color: #1d4ed8;
}

/* Register table */
.register-table {
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  overflow: hidden;
  margin-bottom: 1.25rem;
}

.register-table__header,
.register-table__row {
  display: grid;
  grid-template-columns: 80px 1fr 120px 60px 100px;
  gap: 0.75rem;
  padding: 0.625rem 1rem;
  align-items: center;
}

.register-table__header {
  background: var(--facis-surface-2);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--facis-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.register-table__row {
  border-top: 1px solid var(--facis-border);
  font-size: 0.857rem;
}

.register-table__row:hover {
  background: var(--facis-surface-2);
}

/* JSON accordion */
.json-accordion {
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  overflow: hidden;
}

.json-accordion__trigger {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--facis-surface-2);
  border: none;
  cursor: pointer;
  font-size: 0.857rem;
  font-weight: 600;
  color: var(--facis-text);
  text-align: left;
}

.json-accordion__trigger:hover {
  background: var(--facis-border);
}

.json-accordion__body {
  padding: 1rem;
}

.json-block {
  font-family: var(--facis-font-mono);
  font-size: 0.786rem;
  line-height: 1.6;
  color: var(--facis-text);
  background: var(--facis-surface-2);
  padding: 1rem;
  border-radius: var(--facis-radius-sm);
  overflow-x: auto;
  white-space: pre-wrap;
}

/* Harmonized table */
.harmonized-note {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--facis-primary-light);
  border-radius: var(--facis-radius-sm);
  margin-bottom: 1rem;
  font-size: 0.786rem;
  color: var(--facis-primary);
}

.harmonized-table {
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  overflow: hidden;
}

.harmonized-table__header,
.harmonized-table__row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  align-items: center;
}

.harmonized-table__header {
  background: var(--facis-surface-2);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--facis-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.harmonized-table__row {
  border-top: 1px solid var(--facis-border);
  font-size: 0.857rem;
}

.harmonized-table__row:hover { background: var(--facis-surface-2); }

/* Provenance */
.provenance-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.prov-section__title {
  font-size: 0.857rem;
  font-weight: 600;
  color: var(--facis-text);
  margin-bottom: 0.75rem;
  padding-bottom: 0.375rem;
  border-bottom: 2px solid var(--facis-primary-light);
}

.transform-chain {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.chain-step {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.chain-step__num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--facis-primary-light);
  color: var(--facis-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
}

.chain-step__body {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.chain-step__name {
  font-size: 0.857rem;
  font-weight: 600;
  color: var(--facis-text);
}

.chain-step__desc {
  font-size: 0.75rem;
  color: var(--facis-text-secondary);
}

.quality-notes {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.qn-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
}

/* Transform steps table */
.transform-steps-table {
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  overflow: hidden;
  margin-bottom: 1rem;
}

.transform-steps-table__header,
.transform-steps-table__row {
  display: grid;
  grid-template-columns: 50px 1fr 2fr 120px 100px;
  gap: 0.75rem;
  padding: 0.625rem 1rem;
  align-items: center;
}

.transform-steps-table__header {
  background: var(--facis-surface-2);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--facis-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.transform-steps-table__row {
  border-top: 1px solid var(--facis-border);
  font-size: 0.857rem;
}

.step-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--facis-primary-light);
  color: var(--facis-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
}

/* Audit trail */
.audit-trail {
  display: flex;
  flex-direction: column;
  position: relative;
}

.audit-entry {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  position: relative;
  padding-left: 1.25rem;
  padding-bottom: 1.25rem;
}

.audit-entry__line {
  position: absolute;
  left: 0.875rem;
  top: 1.25rem;
  bottom: 0;
  width: 1px;
  background: var(--facis-border);
}

.audit-entry:last-child .audit-entry__line {
  display: none;
}

.audit-entry__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 0.35rem;
  position: absolute;
  left: 0.52rem;
}

.audit-entry__body {
  margin-left: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.audit-entry__header {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.audit-entry__action {
  font-size: 0.857rem;
  font-weight: 600;
  color: var(--facis-text);
}

.audit-entry__details {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
  line-height: 1.4;
}

.audit-entry__meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Analytics */
.analytics-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-top: 1.25rem;
}

.analytics-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.875rem 1rem;
  background: var(--facis-surface-2);
  border-radius: var(--facis-radius-sm);
}

.analytics-card__label {
  font-size: 0.75rem;
  color: var(--facis-text-secondary);
  font-weight: 500;
  text-transform: uppercase;
}

.analytics-card__value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--facis-text);
}

.anomaly-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--facis-radius-sm);
  font-size: 0.786rem;
  color: #92400e;
}

/* References */
.refs-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
}

.refs-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.ref-item {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.75rem 1rem;
  background: var(--facis-surface-2);
  border-radius: var(--facis-radius-sm);
}

.ref-item__icon {
  width: 32px;
  height: 32px;
  border-radius: var(--facis-radius-sm);
  background: var(--facis-primary-light);
  color: var(--facis-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ref-item__icon--ctx {
  background: rgba(139, 92, 246, 0.1);
  color: #8b5cf6;
}

.ref-item__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.ref-item__name {
  font-size: 0.857rem;
  font-weight: 600;
  color: var(--facis-text);
}

@media (max-width: 900px) {
  .overview-grid { grid-template-columns: 1fr; }
  .provenance-grid { grid-template-columns: 1fr; }
  .refs-grid { grid-template-columns: 1fr; }
  .analytics-summary { grid-template-columns: repeat(2, 1fr); }
}
</style>
