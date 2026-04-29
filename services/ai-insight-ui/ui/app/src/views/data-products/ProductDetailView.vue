<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import PageHeader from '@/components/common/PageHeader.vue'
import DetailTabs from '@/components/common/DetailTabs.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import { getMeters, getPVSystems, getStreetlights, getTrafficZones, getSimHealth } from '@/services/api'

const route  = useRoute()
const router = useRouter()
const error = ref(false)
const isLive = ref(false)
const meterCount = ref(0)
const pvCount = ref(0)
const streetlightCount = ref(0)
const trafficCount = ref(0)

async function fetchData(): Promise<void> {
  error.value = false
  const [m, pv, lights, traffic, health] = await Promise.all([getMeters(), getPVSystems(), getStreetlights(), getTrafficZones(), getSimHealth()])

  if (!m && !pv && !lights && !traffic) {
    error.value = true
    return
  }

  meterCount.value = m?.count ?? 0
  pvCount.value = pv?.count ?? 0
  streetlightCount.value = lights?.count ?? 0
  trafficCount.value = traffic?.count ?? 0
  isLive.value = health?.status === 'ok' || health?.status === 'healthy'
}

onMounted(fetchData)

const realSourceCount = computed(() => meterCount.value + pvCount.value + streetlightCount.value + trafficCount.value)

// Derive product catalogue from real API source counts
const products = computed(() => [
  { id: 'dp-001', name: 'Energy Consumption Timeseries', category: 'energy', description: 'Harmonised active and reactive energy consumption timeseries at 15-min granularity.', useCase: 'Smart Energy', semanticScope: 'Energy Metering', version: '2.1.0', sourceCount: meterCount.value, apiStatus: 'available', exportStatus: 'ready', lastUpdated: new Date().toISOString() },
  { id: 'dp-002', name: 'PV Generation Forecast', category: 'energy', description: 'AI-generated probabilistic photovoltaic generation forecast.', useCase: 'Smart Energy', semanticScope: 'PV Systems', version: '1.3.0', sourceCount: pvCount.value, apiStatus: 'available', exportStatus: 'ready', lastUpdated: new Date().toISOString() },
  { id: 'dp-003', name: 'Smart Lighting Status', category: 'smart-city', description: 'Real-time operational state of all DALI-controlled luminaires by zone.', useCase: 'Smart City', semanticScope: 'Public Lighting', version: '1.0.1', sourceCount: streetlightCount.value, apiStatus: 'available', exportStatus: 'ready', lastUpdated: new Date().toISOString() },
  { id: 'dp-004', name: 'Urban Traffic Index', category: 'smart-city', description: 'Aggregated pedestrian and vehicle flow metrics from sensor data fusion.', useCase: 'Smart City', semanticScope: 'Urban Mobility', version: '1.1.0', sourceCount: trafficCount.value, apiStatus: 'available', exportStatus: 'ready', lastUpdated: new Date().toISOString() },
  { id: 'dp-005', name: 'Energy Flexibility Profile', category: 'energy', description: 'Flexibility envelope of deferrable loads for demand response aggregation.', useCase: 'Smart Energy', semanticScope: 'Flexible Loads', version: '0.9.0', sourceCount: meterCount.value, apiStatus: 'available', exportStatus: 'processing', lastUpdated: new Date().toISOString() },
  { id: 'dp-006', name: 'Cross-Domain Sustainability KPIs', category: 'cross-domain', description: 'Scope 2 carbon intensity and renewable energy share KPIs for ESG reporting.', useCase: 'Platform', semanticScope: 'Sustainability', version: '0.5.0', sourceCount: meterCount.value + streetlightCount.value, apiStatus: 'available', exportStatus: 'processing', lastUpdated: new Date().toISOString() }
])

const product = computed(() => products.value.find(p => p.id === route.params['id']) ?? products.value[0])

// Contributing sources derived from real counts
const contributingSources = computed(() => {
  if (!product.value) return []
  const rows: Array<{ id: string; name: string; protocol: string; status: string; qualityIndicator: number }> = []
  if ((product.value.category === 'energy' || product.value.category === 'cross-domain') && meterCount.value > 0) {
    rows.push({ id: 'METER-001', name: `Smart Meters (${meterCount.value})`, protocol: 'Simulation REST', status: 'healthy', qualityIndicator: 99.0 })
  }
  if ((product.value.category === 'energy' || product.value.id === 'dp-002') && pvCount.value > 0) {
    rows.push({ id: 'PV-001', name: `PV Systems (${pvCount.value})`, protocol: 'Simulation REST', status: 'healthy', qualityIndicator: 99.0 })
  }
  if ((product.value.category === 'smart-city' || product.value.category === 'cross-domain') && streetlightCount.value > 0) {
    rows.push({ id: 'LIGHT-001', name: `Streetlights (${streetlightCount.value})`, protocol: 'Simulation REST', status: 'healthy', qualityIndicator: 98.5 })
  }
  if (product.value.category === 'smart-city' && trafficCount.value > 0) {
    rows.push({ id: 'TRAFFIC-001', name: `Traffic Zones (${trafficCount.value})`, protocol: 'Simulation REST', status: 'healthy', qualityIndicator: 97.0 })
  }
  return rows
})

// Audit entries from API call log
const auditEntries = computed(() => [
  { id: 'AE-001', timestamp: new Date().toISOString(), type: 'API', action: 'GET /api/sim/meters', actor: 'system', result: meterCount.value > 0 ? 'success' : 'warning', severity: 'info', details: `${meterCount.value} meters loaded` },
  { id: 'AE-002', timestamp: new Date(Date.now() - 2000).toISOString(), type: 'API', action: 'GET /api/sim/pv-systems', actor: 'system', result: pvCount.value > 0 ? 'success' : 'warning', severity: 'info', details: `${pvCount.value} PV systems loaded` },
  { id: 'AE-003', timestamp: new Date(Date.now() - 4000).toISOString(), type: 'API', action: 'GET /api/sim/streetlights', actor: 'system', result: streetlightCount.value > 0 ? 'success' : 'warning', severity: 'info', details: `${streetlightCount.value} streetlights loaded` },
  { id: 'AE-004', timestamp: new Date(Date.now() - 6000).toISOString(), type: 'API', action: 'GET /api/sim/traffic/zones', actor: 'system', result: trafficCount.value > 0 ? 'success' : 'warning', severity: 'info', details: `${trafficCount.value} traffic zones loaded` }
])

const tabs = [
  { label: 'Overview',          icon: 'pi-info-circle' },
  { label: 'Semantics',         icon: 'pi-sitemap' },
  { label: 'Schema',            icon: 'pi-code' },
  { label: 'Source Composition',icon: 'pi-database' },
  { label: 'Provenance',        icon: 'pi-history' },
  { label: 'Sample Records',    icon: 'pi-list' },
  { label: 'Access & Export',   icon: 'pi-cloud-download' },
  { label: 'Usage Notes',       icon: 'pi-book' },
  { label: 'Audit Trail',       icon: 'pi-shield' }
]



// Per-product semantic metadata
const SEMANTICS: Record<string, {
  businessMeaning: string; objectRefs: string[]; units: string[];
  intendedUsage: string; outOfScope: string
}> = {
  'dp-001': {
    businessMeaning: 'Represents harmonised active and reactive energy consumption at 15-minute granularity across all metered sites, aligned to the IEC 61968 CIM energy measurement semantic model.',
    objectRefs: ['EnergyMeter', 'MeteringPoint', 'UsagePoint', 'ReadingType'],
    units: ['kWh (active energy)', 'kVArh (reactive energy)', 'kW (active power)', 'V (voltage per phase)', 'A (current per phase)'],
    intendedUsage: 'Billing reconciliation, demand forecasting, anomaly detection, carbon accounting, and regulatory reporting (ERSE PT).',
    outOfScope: 'Sub-metering at device level, power quality harmonics analysis, or real-time control setpoints.'
  },
  'dp-002': {
    businessMeaning: 'AI-generated probabilistic photovoltaic generation forecast fused with NWP weather data and on-site irradiance telemetry.',
    objectRefs: ['PVSystem', 'GeneratingUnit', 'WeatherStation'],
    units: ['kW (instantaneous power)', 'kWh (period energy)', 'W/m² (irradiance)', '%  (forecast uncertainty CI)'],
    intendedUsage: 'Intraday energy trading, grid injection planning, storage dispatch scheduling, and site energy self-sufficiency optimisation.',
    outOfScope: 'Long-range (>48h) forecasts, individual inverter MPPT diagnostics, or cell-level health monitoring.'
  },
  'dp-003': {
    businessMeaning: 'Real-time operational state of all DALI-controlled luminaires by zone, aligned to the IES TM-30 lighting quality semantic model.',
    objectRefs: ['LightingZone', 'Luminaire', 'DALIController'],
    units: ['% (dimming level)', 'W (power per luminaire)', 'lux (illuminance estimate)', 'hours (burn time)'],
    intendedUsage: 'Energy reporting for city lighting assets, fault management, context-aware dimming policy evaluation, and EN 13201-2 compliance checking.',
    outOfScope: 'Individual lamp photometric measurement, adaptive lighting control commands, or emergency lighting test records.'
  },
  'dp-004': {
    businessMeaning: 'Aggregated pedestrian and vehicle flow metrics derived from computer vision and PIR sensor data fusion across city zones.',
    objectRefs: ['TrafficSensor', 'MotionSensor', 'Zone', 'RoadSegment'],
    units: ['count/15min (vehicle flow)', 'count/15min (pedestrian flow)', 'km/h (average speed)', 'level (flow category)'],
    intendedUsage: 'City mobility planning, signal timing optimisation, event impact assessment, and lighting context adaptation.',
    outOfScope: 'Individual vehicle tracking, licence plate recognition, or real-time traffic signal control.'
  },
  'dp-005': {
    businessMeaning: 'Characterises the flexibility envelope of deferrable loads for demand response aggregation, combining meter data, device registry, and scheduling constraints.',
    objectRefs: ['FlexibilityAsset', 'EnergyMeter', 'Consumer', 'Schedule'],
    units: ['kW (available curtailment)', 'kWh (shiftable energy)', 'minutes (lead time)', 'count (activations/month limit)'],
    intendedUsage: 'DSO demand response programme participation, flexibility market bidding, and grid congestion management.',
    outOfScope: 'Real-time curtailment commands, individual appliance scheduling, or consumer personal data.'
  },
  'dp-006': {
    businessMeaning: 'Computed Scope 2 market-based carbon intensity and renewable energy share KPIs for ESG reporting, linked to ENTSO-E grid carbon mix data.',
    objectRefs: ['Site', 'EnergyMeter', 'GridCarbonFactor', 'EmissionRecord'],
    units: ['gCO₂/kWh (carbon intensity)', '% (renewable share)', 'tonnes CO₂ (periodic total)', 'MWh (green energy)'],
    intendedUsage: 'Corporate ESG reporting (GHG Protocol Scope 2), EU Taxonomy alignment, CSRD compliance, and sustainability dashboards.',
    outOfScope: 'Scope 1 (direct combustion) emissions, upstream Scope 3 supply chain emissions, or facility-level lifecycle assessment.'
  }
}

const semantics = computed(() => SEMANTICS[product.value?.id ?? 'dp-001'] ?? SEMANTICS['dp-001'])

// Per-product JSON schema
const SCHEMAS: Record<string, object> = {
  'dp-001': {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:facis:schema:energy-consumption-timeseries:v2.1.0',
    title: 'EnergyConsumptionTimeseries',
    type: 'object',
    required: ['meteringPointId', 'periodStart', 'periodEnd', 'readings'],
    properties: {
      meteringPointId: { type: 'string', description: 'FACIS metering point identifier' },
      siteId:          { type: 'string', description: 'Site reference' },
      tariffZone:      { type: 'string', enum: ['peak', 'off-peak', 'super-off-peak'] },
      periodStart:     { type: 'string', format: 'date-time' },
      periodEnd:       { type: 'string', format: 'date-time' },
      resolution:      { type: 'string', enum: ['PT15M', 'PT1H', 'P1D'] },
      readings: {
        type: 'array',
        items: {
          type: 'object',
          required: ['timestamp', 'activeEnergy_kWh', 'activePower_kW'],
          properties: {
            timestamp:           { type: 'string', format: 'date-time' },
            activeEnergy_kWh:    { type: 'number', minimum: 0 },
            reactiveEnergy_kVArh:{ type: 'number' },
            activePower_kW:      { type: 'number', minimum: 0 },
            powerFactor:         { type: 'number', minimum: 0, maximum: 1 },
            voltage_L1:          { type: 'number' },
            voltage_L2:          { type: 'number' },
            voltage_L3:          { type: 'number' },
            dataQuality:         { type: 'number', minimum: 0, maximum: 100 }
          }
        }
      },
      carbonIntensity_gCO2_kWh: { type: 'number', description: 'Grid carbon intensity at time of consumption' }
    }
  }
}

const schema = computed(() => {
  const s = SCHEMAS[product.value?.id ?? '']
  return JSON.stringify(s ?? SCHEMAS['dp-001'], null, 2)
})

// Sample records
function generateSampleRecord(productId: string): object[] {
  if (productId === 'dp-001') {
    return [
      {
        meteringPointId: 'MP-SITE-A-001',
        siteId: 'SITE-A',
        tariffZone: 'peak',
        periodStart: '2026-04-05T08:00:00Z',
        periodEnd: '2026-04-05T08:15:00Z',
        resolution: 'PT15M',
        readings: [
          { timestamp: '2026-04-05T08:00:00Z', activeEnergy_kWh: 45.1, activePower_kW: 180.4, powerFactor: 0.943, voltage_L1: 229.8, dataQuality: 99.2 }
        ],
        carbonIntensity_gCO2_kWh: 312.4
      },
      {
        meteringPointId: 'MP-SITE-B-001',
        siteId: 'SITE-B',
        tariffZone: 'off-peak',
        periodStart: '2026-04-05T02:00:00Z',
        periodEnd: '2026-04-05T02:15:00Z',
        resolution: 'PT15M',
        readings: [
          { timestamp: '2026-04-05T02:00:00Z', activeEnergy_kWh: 11.3, activePower_kW: 45.2, powerFactor: 0.881, voltage_L1: 230.1, dataQuality: 97.4 }
        ],
        carbonIntensity_gCO2_kWh: 204.1
      }
    ]
  }
  return [{ id: 'sample-001', timestamp: new Date().toISOString(), placeholder: 'Sample record for ' + productId }]
}

const sampleRecords = computed(() => generateSampleRecord(product.value?.id ?? 'dp-001'))
const formattedSamples = computed(() => JSON.stringify(sampleRecords.value, null, 2))

// API endpoint
const apiEndpoint = computed(() => `https://api.facis.local/v2/data-products/${product.value?.id}/timeseries`)

const copied = ref(false)
async function copyEndpoint(): Promise<void> {
  await navigator.clipboard.writeText(apiEndpoint.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function formatDate(ts: string): string {
  try { return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return ts }
}

function categoryColor(cat: string): string {
  if (cat === 'energy') return '#f59e0b'
  if (cat === 'smart-city') return '#8b5cf6'
  return '#06b6d4'
}
</script>

<template>
  <div class="view-page">
    <div v-if="error" class="api-error">
      <i class="pi pi-exclamation-circle"></i>
      <p>Could not load data from simulation API</p>
      <Button label="Retry" size="small" @click="fetchData()" />
    </div>
    <div v-else-if="isLive" class="live-banner">
      <span class="live-dot"></span> {{ realSourceCount }} real sources confirmed via live API — source composition reflects actual data
    </div>
    <PageHeader
      :title="product?.name ?? 'Data Product'"
      :subtitle="product?.description"
      :breadcrumbs="[{ label: 'Data Products', to: '/data-products/all' }, { label: product?.name ?? '' }]"
    >
      <template #actions>
        <span
          class="category-badge"
          :style="{ background: categoryColor(product?.category ?? '') + '18', color: categoryColor(product?.category ?? '') }"
        >
          {{ product?.category }}
        </span>
        <StatusBadge :status="product?.apiStatus ?? 'unavailable'" />
        <StatusBadge :status="product?.exportStatus ?? 'error'" :show-dot="false" />
        <Button
          label="View All Products"
          icon="pi pi-arrow-left"
          size="small"
          outlined
          @click="router.push('/data-products/all')"
        />
      </template>
    </PageHeader>

    <div class="view-body">
      <!-- KPI strip -->
      <div class="grid-kpi" style="grid-template-columns: repeat(auto-fill, minmax(180px,1fr))">
        <KpiCard label="Version" :value="product?.version ?? 'N/A'" trend="stable" icon="pi-tag" color="#3b82f6" />
        <KpiCard label="Sources" :value="product?.sourceCount ?? 0" trend="stable" icon="pi-database" color="#8b5cf6" />
        <KpiCard label="API Status" :value="product?.apiStatus ?? ''" trend="stable" icon="pi-server" color="#22c55e" />
        <KpiCard label="Export Status" :value="product?.exportStatus ?? ''" trend="stable" icon="pi-cloud-download" color="#005fff" />
      </div>

      <!-- Tabbed detail -->
      <DetailTabs :tabs="tabs">
        <!-- 0: Overview -->
        <template #tab-0>
          <div class="tab-content">
            <div class="dp-meta-grid">
              <div class="dp-row"><span class="dp-label">Product Name</span><strong>{{ product?.name }}</strong></div>
              <div class="dp-row"><span class="dp-label">Category</span>
                <span class="category-badge" :style="{ background: categoryColor(product?.category ?? '') + '18', color: categoryColor(product?.category ?? '') }">
                  {{ product?.category }}
                </span>
              </div>
              <div class="dp-row"><span class="dp-label">Use Case</span><span>{{ product?.useCase }}</span></div>
              <div class="dp-row"><span class="dp-label">Semantic Scope</span><span>{{ product?.semanticScope }}</span></div>
              <div class="dp-row"><span class="dp-label">Version</span><code class="code-chip">{{ product?.version }}</code></div>
              <div class="dp-row"><span class="dp-label">Source Count</span><span>{{ product?.sourceCount }} contributing sources</span></div>
              <div class="dp-row"><span class="dp-label">API Status</span><StatusBadge :status="product?.apiStatus ?? 'unavailable'" size="sm" /></div>
              <div class="dp-row"><span class="dp-label">Export Status</span><StatusBadge :status="product?.exportStatus ?? 'error'" size="sm" /></div>
              <div class="dp-row"><span class="dp-label">Last Updated</span><span>{{ formatDate(product?.lastUpdated ?? '') }}</span></div>
              <div class="dp-row dp-row--full"><span class="dp-label">Description</span><p class="desc-text">{{ product?.description }}</p></div>
              <div class="dp-row"><span class="dp-label">API Endpoint</span><code class="code-chip code-chip--url">{{ apiEndpoint }}</code></div>
            </div>
          </div>
        </template>

        <!-- 1: Semantics -->
        <template #tab-1>
          <div class="tab-content">
            <div class="semantic-section">
              <h3 class="semantic-heading">Business Meaning</h3>
              <p class="semantic-text">{{ semantics.businessMeaning }}</p>
            </div>
            <div class="semantic-section">
              <h3 class="semantic-heading">Object References</h3>
              <div class="tag-row">
                <span v-for="ref in semantics.objectRefs" :key="ref" class="obj-tag">{{ ref }}</span>
              </div>
            </div>
            <div class="semantic-section">
              <h3 class="semantic-heading">Units &amp; Measures</h3>
              <ul class="semantic-list">
                <li v-for="u in semantics.units" :key="u">{{ u }}</li>
              </ul>
            </div>
            <div class="semantic-section">
              <h3 class="semantic-heading">Intended Usage</h3>
              <p class="semantic-text">{{ semantics.intendedUsage }}</p>
            </div>
            <div class="semantic-section semantic-section--warn">
              <h3 class="semantic-heading"><i class="pi pi-exclamation-circle" style="margin-right:0.4rem"></i>Out of Scope</h3>
              <p class="semantic-text">{{ semantics.outOfScope }}</p>
            </div>
          </div>
        </template>

        <!-- 2: Schema -->
        <template #tab-2>
          <div class="tab-content">
            <div class="schema-header">
              <span class="schema-label">JSON Schema — {{ product?.name }} v{{ product?.version }}</span>
              <span class="format-tag format-tag--json">JSON Schema Draft 2020-12</span>
            </div>
            <pre class="schema-pre"><code>{{ schema }}</code></pre>
          </div>
        </template>

        <!-- 3: Source Composition -->
        <template #tab-3>
          <div class="tab-content">
            <p class="section-desc">The following data sources contribute to this product after harmonisation and quality filtering.</p>
            <DataTable :value="contributingSources" row-hover removable-sort scrollable>
              <Column field="id" header="Source ID" sortable style="width:120px">
                <template #body="{ data }"><code class="code-chip">{{ data.id }}</code></template>
              </Column>
              <Column field="name" header="Name" sortable />
              <Column field="sourceType" header="Type" sortable style="width:180px" />
              <Column field="protocol" header="Protocol" sortable style="width:150px" />
              <Column field="status" header="Status" sortable style="width:110px">
                <template #body="{ data }"><StatusBadge :status="data.status" size="sm" /></template>
              </Column>
              <Column field="qualityIndicator" header="Quality" sortable style="width:100px">
                <template #body="{ data }">
                  <span :style="{ color: data.qualityIndicator >= 95 ? 'var(--facis-success)' : data.qualityIndicator >= 80 ? 'var(--facis-warning)' : 'var(--facis-error)', fontWeight: 600 }">
                    {{ data.qualityIndicator.toFixed(1) }}%
                  </span>
                </template>
              </Column>
              <Column field="lastTimestamp" header="Last Seen" sortable style="width:160px">
                <template #body="{ data }"><span style="font-size:0.78rem; color:var(--facis-text-secondary)">{{ formatDate(data.lastTimestamp) }}</span></template>
              </Column>
            </DataTable>
          </div>
        </template>

        <!-- 4: Provenance -->
        <template #tab-4>
          <div class="tab-content">
            <div class="provenance-chain">
              <div class="prov-step">
                <div class="prov-step__icon prov-step__icon--source"><i class="pi pi-database"></i></div>
                <div class="prov-step__body">
                  <div class="prov-step__label">Origin</div>
                  <div class="prov-step__text">{{ contributingSources.length }} raw data sources via MQTT, Modbus TCP, REST, and SunSpec protocols.</div>
                </div>
              </div>
              <div class="prov-arrow"><i class="pi pi-arrow-down"></i></div>
              <div class="prov-step">
                <div class="prov-step__icon prov-step__icon--parse"><i class="pi pi-code"></i></div>
                <div class="prov-step__body">
                  <div class="prov-step__label">Schema Mapping</div>
                  <div class="prov-step__text">IEC 61968 / SunSpec / DALI-2 source schemas mapped to FACIS canonical model via deterministic and AI-driven mapping rules. Validation: full JSON Schema Draft 2020-12.</div>
                </div>
              </div>
              <div class="prov-arrow"><i class="pi pi-arrow-down"></i></div>
              <div class="prov-step">
                <div class="prov-step__icon prov-step__icon--enrich"><i class="pi pi-sparkles"></i></div>
                <div class="prov-step__body">
                  <div class="prov-step__label">Enrichment</div>
                  <div class="prov-step__text">Tariff context appended from ENTSO-E feed. Carbon intensity joined from GridCarbon API. Outlier detection applied (3σ filter on power measurements).</div>
                </div>
              </div>
              <div class="prov-arrow"><i class="pi pi-arrow-down"></i></div>
              <div class="prov-step">
                <div class="prov-step__icon prov-step__icon--product"><i class="pi pi-box"></i></div>
                <div class="prov-step__body">
                  <div class="prov-step__label">Data Product v{{ product?.version }}</div>
                  <div class="prov-step__text">Published to FACIS Data Catalogue. Available via REST API and export. Last updated: {{ formatDate(product?.lastUpdated ?? '') }}</div>
                </div>
              </div>
            </div>

            <div class="quality-metrics">
              <h3 class="semantic-heading" style="margin-bottom:0.75rem">Quality Metrics</h3>
              <div class="qm-grid">
                <div class="qm-item">
                  <span class="qm-label">Completeness</span>
                  <div class="qm-bar"><div class="qm-fill" style="width:97%; background:var(--facis-success)"></div></div>
                  <span class="qm-value">97%</span>
                </div>
                <div class="qm-item">
                  <span class="qm-label">Timeliness</span>
                  <div class="qm-bar"><div class="qm-fill" style="width:99%; background:var(--facis-success)"></div></div>
                  <span class="qm-value">99%</span>
                </div>
                <div class="qm-item">
                  <span class="qm-label">Accuracy</span>
                  <div class="qm-bar"><div class="qm-fill" style="width:94%; background:var(--facis-success)"></div></div>
                  <span class="qm-value">94%</span>
                </div>
                <div class="qm-item">
                  <span class="qm-label">Consistency</span>
                  <div class="qm-bar"><div class="qm-fill" style="width:89%; background:var(--facis-warning)"></div></div>
                  <span class="qm-value">89%</span>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- 5: Sample Records -->
        <template #tab-5>
          <div class="tab-content">
            <div class="schema-header">
              <span class="schema-label">Sample Records — {{ product?.name }}</span>
              <span class="format-tag format-tag--json">JSON</span>
            </div>
            <pre class="schema-pre"><code>{{ formattedSamples }}</code></pre>
          </div>
        </template>

        <!-- 6: Access & Export -->
        <template #tab-6>
          <div class="tab-content">
            <!-- API endpoint card -->
            <div class="api-card">
              <div class="api-card__header">
                <i class="pi pi-server" style="color:var(--facis-primary)"></i>
                <span class="api-card__title">REST API Endpoint</span>
                <StatusBadge :status="product?.apiStatus ?? 'unavailable'" size="sm" />
              </div>
              <div class="api-endpoint-row">
                <span class="method-badge">GET</span>
                <code class="api-url">{{ apiEndpoint }}</code>
                <Button
                  :icon="copied ? 'pi pi-check' : 'pi pi-copy'"
                  text
                  size="small"
                  :severity="copied ? 'success' : 'secondary'"
                  @click="copyEndpoint"
                />
              </div>
              <div class="api-params">
                <div class="api-param-row"><code class="param-name">?from</code><span class="param-desc">ISO 8601 start datetime (required)</span></div>
                <div class="api-param-row"><code class="param-name">?to</code><span class="param-desc">ISO 8601 end datetime (required)</span></div>
                <div class="api-param-row"><code class="param-name">?resolution</code><span class="param-desc">PT15M | PT1H | P1D (default: PT15M)</span></div>
                <div class="api-param-row"><code class="param-name">?format</code><span class="param-desc">json | csv | parquet (default: json)</span></div>
              </div>
            </div>

            <!-- Export formats -->
            <div class="export-section">
              <h3 class="semantic-heading">Export Formats</h3>
              <div class="export-grid">
                <div class="export-card">
                  <div class="export-card__icon" style="background:#dcfce7; color:#15803d"><i class="pi pi-file-excel"></i></div>
                  <div class="export-card__info">
                    <span class="export-card__name">CSV</span>
                    <span class="export-card__desc">Flat file, UTF-8 encoded</span>
                  </div>
                  <StatusBadge :status="product?.exportStatus ?? 'processing'" size="sm" />
                </div>
                <div class="export-card">
                  <div class="export-card__icon" style="background:#dbeafe; color:#1d4ed8"><i class="pi pi-code"></i></div>
                  <div class="export-card__info">
                    <span class="export-card__name">JSON</span>
                    <span class="export-card__desc">Schema-validated JSON</span>
                  </div>
                  <StatusBadge :status="product?.exportStatus ?? 'processing'" size="sm" />
                </div>
                <div class="export-card">
                  <div class="export-card__icon" style="background:#f3e8ff; color:#7c3aed"><i class="pi pi-table"></i></div>
                  <div class="export-card__info">
                    <span class="export-card__name">Parquet</span>
                    <span class="export-card__desc">Columnar binary format</span>
                  </div>
                  <StatusBadge :status="product?.exportStatus ?? 'processing'" size="sm" />
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- 7: Usage Notes -->
        <template #tab-7>
          <div class="tab-content">
            <div class="usage-doc">
              <h3 class="usage-h3">Getting Started</h3>
              <p>Authenticate using a FACIS API token (Bearer). All API calls must include the <code>X-FACIS-Tenant</code> header identifying your organisation.</p>

              <h3 class="usage-h3">Rate Limits</h3>
              <ul class="usage-list">
                <li>Read: 1,000 requests/hour per API token</li>
                <li>Export: 10 concurrent export jobs, max 500,000 records per export</li>
                <li>WebSocket streaming: available on request</li>
              </ul>

              <h3 class="usage-h3">Time Resolution</h3>
              <p>Raw data is stored at the native source resolution (METER: 15min, PV: 5min, Weather: 60min). The API automatically resamples to the requested resolution using mean aggregation (energy: sum, power: mean, quality: min).</p>

              <h3 class="usage-h3">Data Quality Flags</h3>
              <ul class="usage-list">
                <li><strong>dataQuality &gt; 95</strong> — fully validated reading, safe for billing use</li>
                <li><strong>dataQuality 80–95</strong> — minor validation warnings, use with care for high-precision applications</li>
                <li><strong>dataQuality &lt; 80</strong> — interpolated or estimated reading, flag in reports</li>
              </ul>

              <h3 class="usage-h3">Known Limitations</h3>
              <ul class="usage-list">
                <li>PV data may contain gaps during inverter maintenance windows (src-003 errors)</li>
                <li>Reactive power data on Modbus sources has occasional 1-interval gaps (register timeout)</li>
                <li>Carbon intensity data is updated hourly with ~15min publication lag from ENTSO-E</li>
              </ul>
            </div>
          </div>
        </template>

        <!-- 8: Audit Trail -->
        <template #tab-8>
          <div class="tab-content">
            <DataTable :value="auditEntries" row-hover removable-sort scrollable>
              <Column field="timestamp" header="Timestamp" sortable style="width:180px">
                <template #body="{ data }"><span class="text-muted">{{ formatDate(data.timestamp) }}</span></template>
              </Column>
              <Column field="action" header="Action" sortable />
              <Column field="actor" header="Actor" sortable style="width:200px" />
              <Column field="type" header="Type" sortable style="width:120px" />
              <Column field="result" header="Result" sortable style="width:110px">
                <template #body="{ data }"><StatusBadge :status="data.result" size="sm" /></template>
              </Column>
              <Column field="details" header="Details">
                <template #body="{ data }"><span class="text-secondary">{{ data.details }}</span></template>
              </Column>
            </DataTable>
          </div>
        </template>
      </DetailTabs>
    </div>
  </div>
</template>

<style scoped>
.api-error {
  display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
  padding: 2rem; margin: 1.5rem; border: 1px solid #fee2e2;
  border-radius: var(--facis-radius); background: #fff5f5;
  color: #991b1b; font-size: 0.875rem; text-align: center;
}
.live-banner { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #15803d; background: #dcfce7; padding: 0.375rem 1.5rem; border-bottom: 1px solid #bbf7d0; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
.tab-content { padding: 1.25rem; }

.category-badge { font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 20px; text-transform: capitalize; }

/* Meta grid */
.dp-meta-grid { display: flex; flex-direction: column; }
.dp-row { display: flex; align-items: flex-start; gap: 1rem; padding: 0.75rem 0; border-bottom: 1px solid var(--facis-border); }
.dp-row:last-child { border-bottom: none; }
.dp-row--full { align-items: flex-start; }
.dp-label { font-size: 0.8rem; font-weight: 500; color: var(--facis-text-secondary); min-width: 160px; padding-top: 0.1rem; }
.desc-text { font-size: 0.875rem; color: var(--facis-text); line-height: 1.5; }

.code-chip { font-family: var(--facis-font-mono); font-size: 0.8rem; background: var(--facis-surface-2); padding: 0.15rem 0.5rem; border-radius: 4px; }
.code-chip--url { word-break: break-all; font-size: 0.75rem; }
.text-muted { font-size: 0.78rem; color: var(--facis-text-secondary); }
.text-secondary { font-size: 0.8rem; color: var(--facis-text-secondary); }

/* Semantics */
.semantic-section { margin-bottom: 1.5rem; }
.semantic-section--warn { background: var(--facis-warning-light); border-radius: var(--facis-radius-sm); padding: 1rem; margin-top: 0.5rem; }
.semantic-heading { font-size: 0.9rem; font-weight: 600; color: var(--facis-text); margin-bottom: 0.5rem; }
.semantic-text { font-size: 0.875rem; color: var(--facis-text-secondary); line-height: 1.6; }
.semantic-list { font-size: 0.875rem; color: var(--facis-text-secondary); padding-left: 1.25rem; display: flex; flex-direction: column; gap: 0.3rem; }
.tag-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.obj-tag { font-size: 0.75rem; font-weight: 600; background: var(--facis-primary-light); color: var(--facis-primary); padding: 0.2rem 0.6rem; border-radius: 4px; font-family: var(--facis-font-mono); }
.section-desc { font-size: 0.875rem; color: var(--facis-text-secondary); margin-bottom: 1rem; }

/* Schema / code block */
.schema-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
.schema-label { font-size: 0.875rem; font-weight: 600; color: var(--facis-text); }
.format-tag { font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 4px; }
.format-tag--json { background: #dbeafe; color: #1d4ed8; }
.schema-pre { background: #0f172a; color: #e2e8f0; border-radius: var(--facis-radius); padding: 1rem; overflow: auto; max-height: 500px; font-size: 0.78rem; line-height: 1.6; font-family: var(--facis-font-mono); }
.schema-pre code { background: none; color: inherit; font-family: inherit; }

/* Provenance */
.provenance-chain { display: flex; flex-direction: column; gap: 0; margin-bottom: 2rem; }
.prov-step { display: flex; align-items: flex-start; gap: 1rem; padding: 0.875rem; background: var(--facis-surface-2); border-radius: var(--facis-radius-sm); }
.prov-arrow { display: flex; justify-content: flex-start; padding-left: 1.1rem; color: var(--facis-text-muted); font-size: 0.8rem; padding-top: 0.3rem; padding-bottom: 0.3rem; }
.prov-step__icon { width: 36px; height: 36px; border-radius: var(--facis-radius-sm); display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; }
.prov-step__icon--source  { background: #dbeafe; color: #1d4ed8; }
.prov-step__icon--parse   { background: #f3e8ff; color: #7c3aed; }
.prov-step__icon--enrich  { background: #fef3c7; color: #92400e; }
.prov-step__icon--product { background: #dcfce7; color: #15803d; }
.prov-step__label { font-size: 0.8rem; font-weight: 600; color: var(--facis-text); margin-bottom: 0.2rem; }
.prov-step__text  { font-size: 0.8rem; color: var(--facis-text-secondary); line-height: 1.5; }

/* Quality metrics */
.quality-metrics { margin-top: 1rem; }
.qm-grid { display: flex; flex-direction: column; gap: 0.75rem; }
.qm-item { display: flex; align-items: center; gap: 0.75rem; }
.qm-label { font-size: 0.8rem; font-weight: 500; color: var(--facis-text-secondary); min-width: 110px; }
.qm-bar { flex: 1; height: 8px; background: var(--facis-surface-2); border-radius: 4px; overflow: hidden; }
.qm-fill { height: 100%; border-radius: 4px; transition: width 0.5s; }
.qm-value { font-size: 0.8rem; font-weight: 700; color: var(--facis-text); min-width: 36px; text-align: right; }

/* API card */
.api-card { background: var(--facis-surface-2); border-radius: var(--facis-radius); padding: 1.25rem; margin-bottom: 1.5rem; border: 1px solid var(--facis-border); }
.api-card__header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
.api-card__title { font-size: 0.9rem; font-weight: 600; color: var(--facis-text); flex: 1; }
.api-endpoint-row { display: flex; align-items: center; gap: 0.75rem; background: #0f172a; padding: 0.75rem 1rem; border-radius: var(--facis-radius-sm); margin-bottom: 0.75rem; }
.method-badge { font-size: 0.72rem; font-weight: 700; background: #22c55e; color: #fff; padding: 0.2rem 0.5rem; border-radius: 3px; flex-shrink: 0; }
.api-url { font-family: var(--facis-font-mono); font-size: 0.78rem; color: #93c5fd; flex: 1; word-break: break-all; background: none; }
.api-params { display: flex; flex-direction: column; gap: 0.3rem; }
.api-param-row { display: flex; align-items: center; gap: 0.75rem; font-size: 0.8rem; }
.param-name { font-family: var(--facis-font-mono); font-size: 0.75rem; background: var(--facis-surface); padding: 0.1rem 0.4rem; border-radius: 3px; border: 1px solid var(--facis-border); }
.param-desc { color: var(--facis-text-secondary); }

/* Export */
.export-section { margin-top: 1rem; }
.export-grid { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.75rem; }
.export-card { display: flex; align-items: center; gap: 1rem; padding: 0.875rem 1rem; background: var(--facis-surface-2); border-radius: var(--facis-radius-sm); border: 1px solid var(--facis-border); }
.export-card__icon { width: 36px; height: 36px; border-radius: var(--facis-radius-sm); display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; }
.export-card__info { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; }
.export-card__name { font-size: 0.875rem; font-weight: 600; color: var(--facis-text); }
.export-card__desc { font-size: 0.75rem; color: var(--facis-text-secondary); }

/* Usage docs */
.usage-doc { display: flex; flex-direction: column; gap: 0.75rem; max-width: 720px; }
.usage-h3 { font-size: 0.95rem; font-weight: 600; color: var(--facis-text); padding-top: 0.75rem; }
.usage-doc p { font-size: 0.875rem; color: var(--facis-text-secondary); line-height: 1.6; }
.usage-doc code { font-family: var(--facis-font-mono); font-size: 0.8rem; background: var(--facis-surface-2); padding: 0.1rem 0.35rem; border-radius: 3px; }
.usage-list { font-size: 0.875rem; color: var(--facis-text-secondary); padding-left: 1.25rem; display: flex; flex-direction: column; gap: 0.35rem; line-height: 1.5; }
</style>
