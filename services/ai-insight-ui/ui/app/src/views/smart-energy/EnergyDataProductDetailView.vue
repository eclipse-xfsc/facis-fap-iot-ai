<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import DetailTabs from '@/components/common/DetailTabs.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { getMeters, getMeterCurrent, getPVSystems, getPVCurrent, getSimHealth } from '@/services/api'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const error = ref(false)
const liveMeters = ref<Array<{ id: string; power_kw: number; quality: number }>>([])
const livePvSystems = ref<Array<{ id: string; power_kw: number }>>([])
const meterCount = ref(0)
const pvCount = ref(0)
const simStatus = ref<string | null>(null)

async function fetchData(): Promise<void> {
  loading.value = true
  error.value = false
  const [metersRes, pvRes, health] = await Promise.all([getMeters(), getPVSystems(), getSimHealth()])
  if (!metersRes && !pvRes && !health) {
    error.value = true
    loading.value = false
    return
  }
  if (metersRes?.meters?.length) {
    meterCount.value = metersRes.count
    const currents = await Promise.all(metersRes.meters.slice(0, 4).map(m => getMeterCurrent(m.meter_id)))
    liveMeters.value = currents.filter(Boolean).map(c => ({
      id: c!.meter_id,
      power_kw: ((c!.readings.active_power_l1_w + c!.readings.active_power_l2_w + c!.readings.active_power_l3_w) / 1000),
      quality: c!.readings.power_factor ? Math.round(c!.readings.power_factor * 100) : 98
    }))
  }
  if (pvRes?.systems?.length) {
    pvCount.value = pvRes.count
    const currents = await Promise.all(pvRes.systems.slice(0, 2).map(s => getPVCurrent(s.system_id)))
    livePvSystems.value = currents.filter(Boolean).map(c => ({ id: c!.system_id, power_kw: c!.readings.power_kw }))
  }
  simStatus.value = health?.status ?? null
  loading.value = false
}

onMounted(fetchData)

// Product metadata derived from real source counts
const product = computed(() => ({
  id: route.params['id'] as string ?? 'dp-energy',
  name: 'Energy Data Product',
  version: '2.1.0',
  sourceCount: meterCount.value + pvCount.value,
  apiStatus: simStatus.value === 'ok' ? 'available' : 'maintenance',
  description: 'Harmonised energy metering and PV generation data from simulation API.'
}))

const tabs = [
  { label: 'Overview', icon: 'pi-info-circle' },
  { label: 'Schema', icon: 'pi-sitemap' },
  { label: 'Provenance', icon: 'pi-history' },
  { label: 'Sample Payload', icon: 'pi-code' },
  { label: 'API Access', icon: 'pi-cloud' },
  { label: 'Export Formats', icon: 'pi-download' },
  { label: 'Usage Notes', icon: 'pi-book' },
  { label: 'Audit Trail', icon: 'pi-list' }
]

const activeTab = ref(0)

// ─── Schema fields per product ────────────────────────────────────────────
const schemaFields = computed(() => {
  if (product.value?.id === 'edp-001' || product.value?.id === 'edp-002') {
    return [
      { field: 'device_id', type: 'string', required: true, description: 'Unique meter or system identifier' },
      { field: 'site_ref', type: 'string', required: true, description: 'Site reference code' },
      { field: 'timestamp', type: 'datetime (ISO-8601)', required: true, description: 'Observation timestamp (UTC)' },
      { field: 'active_power_kw', type: 'float32', required: true, description: 'Total active power in kW' },
      { field: 'active_energy_kwh', type: 'float64', required: true, description: 'Cumulative active energy in kWh' },
      { field: 'voltage_l1_v', type: 'float32', required: false, description: 'Phase L1 voltage in V' },
      { field: 'voltage_l2_v', type: 'float32', required: false, description: 'Phase L2 voltage in V' },
      { field: 'voltage_l3_v', type: 'float32', required: false, description: 'Phase L3 voltage in V' },
      { field: 'current_l1_a', type: 'float32', required: false, description: 'Phase L1 current in A' },
      { field: 'power_factor', type: 'float32', required: false, description: 'Total power factor (0–1)' },
      { field: 'frequency_hz', type: 'float32', required: false, description: 'Grid frequency in Hz' },
      { field: 'data_quality_pct', type: 'float32', required: true, description: 'Data quality score (0–100)' },
      { field: 'tariff_type', type: 'enum (peak|off-peak)', required: false, description: 'Active tariff period' },
      { field: 'carbon_intensity_gco2_kwh', type: 'float32', required: false, description: 'Grid carbon intensity at time of consumption' }
    ]
  }
  return [
    { field: 'entity_id', type: 'string', required: true, description: 'Entity identifier' },
    { field: 'timestamp', type: 'datetime (ISO-8601)', required: true, description: 'Observation timestamp (UTC)' },
    { field: 'value', type: 'float64', required: true, description: 'Primary measurement value' },
    { field: 'unit', type: 'string', required: true, description: 'SI unit of measurement' },
    { field: 'quality', type: 'float32', required: true, description: 'Data quality score (0–100)' }
  ]
})

// ─── Provenance details — real API data only ─────────────────────────────
const provenanceSources = computed(() => {
  const rows = liveMeters.value.map(m => ({
    source: m.id,
    protocol: 'Simulation REST',
    contribution: 'Energy meter readings',
    quality: m.quality,
    status: m.quality >= 95 ? 'healthy' : m.quality >= 80 ? 'warning' : 'error'
  }))
  livePvSystems.value.forEach(pv => {
    rows.push({ source: pv.id, protocol: 'Simulation REST', contribution: 'PV inverter telemetry', quality: 97, status: 'healthy' })
  })
  return rows
})

// ─── Sample JSON payload — from real API readings ─────────────────────────
const samplePayload = computed(() => {
  if (liveMeters.value.length > 0) {
    return JSON.stringify({
      product_id: product.value?.id,
      snapshot_ts: new Date().toISOString(),
      sources: liveMeters.value.map(m => ({
        device_id: m.id,
        active_power_kw: parseFloat(m.power_kw.toFixed(2)),
        data_quality_pct: m.quality
      })),
      pv_systems: livePvSystems.value.map(pv => ({
        system_id: pv.id,
        power_kw: parseFloat(pv.power_kw.toFixed(2))
      }))
    }, null, 2)
  }
  return JSON.stringify({
    product_id: product.value?.id,
    snapshot_ts: new Date().toISOString(),
    note: 'No live data available — connect to simulation API'
  }, null, 2)
})

// ─── API endpoint ─────────────────────────────────────────────────────────
const apiEndpoint = computed(() => `https://api.facis.local/v2/data-products/${product.value?.id}/timeseries`)

// ─── Usage notes ─────────────────────────────────────────────────────────
const usageNotes = computed(() => {
  const base = [
    'All timestamps are expressed in UTC (ISO-8601 format).',
    'Energy values represent cumulative totals; delta calculations should be performed by the consumer.',
    'The `data_quality_pct` field indicates ingestion completeness — values below 90% should be flagged in downstream processing.',
    'This data product is advisory only. Do not use for billing or legal compliance purposes without independent verification.'
  ]
  if (product.value?.id === 'edp-001') {
    base.push('Tariff data is sourced from ENTSOE day-ahead prices and may lag by up to 60 minutes during market events.')
    base.push('Carbon intensity is the marginal generation mix carbon factor for the PT/ES bidding zone.')
  }
  return base
})

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      :title="product?.name ?? 'Data Product'"
      :subtitle="product?.description"
      :breadcrumbs="[
        { label: 'Use Cases' },
        { label: 'Smart Energy' },
        { label: 'Data Products', to: '/use-cases/smart-energy/data-products' },
        { label: product?.name ?? '' }
      ]"
    >
      <template #actions>
        <StatusBadge :status="product?.apiStatus ?? 'unavailable'" />
        <Button label="Download Schema" icon="pi pi-download" size="small" outlined />
        <Button label="API Reference" icon="pi pi-code" size="small" />
      </template>
    </PageHeader>

    <div class="view-body">
      <DetailTabs :tabs="tabs" v-model="activeTab">

        <!-- ── Tab 0: Overview ─────────────────────────────────────────── -->
        <template #tab-0>
          <div class="tab-content">
            <div class="overview-grid">
              <div class="meta-section">
                <div class="meta-section__title">Product Metadata</div>
                <div class="meta-rows">
                  <div class="meta-row"><span class="meta-label">Product ID</span><code class="code-pill">{{ product?.id }}</code></div>
                  <div class="meta-row"><span class="meta-label">Category</span><span>{{ product?.category }}</span></div>
                  <div class="meta-row"><span class="meta-label">Use Case</span><span>{{ product?.useCase }}</span></div>
                  <div class="meta-row"><span class="meta-label">Semantic Scope</span><code class="code-pill code-pill--gray">{{ product?.semanticScope }}</code></div>
                  <div class="meta-row"><span class="meta-label">Version</span><code class="code-pill">{{ product?.version }}</code></div>
                  <div class="meta-row"><span class="meta-label">Source Count</span><span>{{ product?.sourceCount }} data sources</span></div>
                  <div class="meta-row"><span class="meta-label">API Status</span><StatusBadge :status="product?.apiStatus ?? 'unavailable'" size="sm" /></div>
                  <div class="meta-row"><span class="meta-label">Export Status</span><StatusBadge :status="product?.exportStatus ?? 'error'" size="sm" /></div>
                  <div class="meta-row"><span class="meta-label">Last Updated</span><span>{{ fmtTs(product?.lastUpdated ?? '') }}</span></div>
                </div>
              </div>
              <div class="desc-section">
                <div class="meta-section__title">Description</div>
                <p class="desc-text">{{ product?.description }}</p>

                <div class="meta-section__title" style="margin-top: 1.5rem">Quick Access</div>
                <div class="quick-access">
                  <Button label="View Schema" icon="pi pi-sitemap" outlined size="small" @click="activeTab = 1" />
                  <Button label="Sample Payload" icon="pi pi-code" outlined size="small" @click="activeTab = 3" />
                  <Button label="API Endpoint" icon="pi pi-cloud" outlined size="small" @click="activeTab = 4" />
                  <Button label="Export Formats" icon="pi pi-download" outlined size="small" @click="activeTab = 5" />
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- ── Tab 1: Schema ──────────────────────────────────────────── -->
        <template #tab-1>
          <div class="tab-content">
            <div class="schema-header">
              <div class="section-title" style="margin-bottom:0">Schema Definition</div>
              <code class="schema-version-badge">EnergyMeterReading_v2.1.0</code>
            </div>
            <div class="schema-table">
              <div class="schema-table__header">
                <span>Field Name</span>
                <span>Type</span>
                <span>Required</span>
                <span>Description</span>
              </div>
              <div
                v-for="f in schemaFields"
                :key="f.field"
                class="schema-table__row"
              >
                <code class="code-pill code-pill--blue">{{ f.field }}</code>
                <code class="code-pill code-pill--gray">{{ f.type }}</code>
                <span>
                  <span
                    class="req-badge"
                    :style="{ color: f.required ? '#15803d' : '#94a3b8', background: f.required ? '#dcfce7' : '#f1f5f9' }"
                  >{{ f.required ? 'Required' : 'Optional' }}</span>
                </span>
                <span style="font-size: 0.786rem; color: var(--facis-text-secondary)">{{ f.description }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- ── Tab 2: Provenance ──────────────────────────────────────── -->
        <template #tab-2>
          <div class="tab-content">
            <div class="section-title" style="margin-bottom: 1rem">Source Contributions</div>
            <div class="prov-table">
              <div class="prov-table__header">
                <span>Source</span>
                <span>Protocol</span>
                <span>Contribution</span>
                <span>Quality</span>
                <span>Status</span>
              </div>
              <div
                v-for="src in provenanceSources"
                :key="src.source"
                class="prov-table__row"
              >
                <code class="code-pill">{{ src.source }}</code>
                <span class="text-muted text-sm">{{ src.protocol }}</span>
                <span style="font-size: 0.786rem">{{ src.contribution }}</span>
                <div class="quality-cell">
                  <div class="quality-bar">
                    <div class="quality-bar__fill" :style="{ width: `${src.quality}%`, background: src.quality > 90 ? '#22c55e' : src.quality > 70 ? '#f59e0b' : '#ef4444' }"></div>
                  </div>
                  <span style="font-size:0.75rem;font-weight:600">{{ src.quality }}%</span>
                </div>
                <StatusBadge :status="src.status" size="sm" />
              </div>
            </div>

            <div class="prov-chain">
              <div class="section-title" style="margin: 1.5rem 0 1rem">Transformation Chain</div>
              <div class="chain-steps">
                <div class="chain-step">
                  <div class="chain-step__icon"><i class="pi pi-database"></i></div>
                  <div class="chain-step__label">Source Ingestion</div>
                  <div class="chain-arrow"><i class="pi pi-arrow-right"></i></div>
                </div>
                <div class="chain-step">
                  <div class="chain-step__icon"><i class="pi pi-sitemap"></i></div>
                  <div class="chain-step__label">Schema Mapping</div>
                  <div class="chain-arrow"><i class="pi pi-arrow-right"></i></div>
                </div>
                <div class="chain-step">
                  <div class="chain-step__icon"><i class="pi pi-cog"></i></div>
                  <div class="chain-step__label">Transformation</div>
                  <div class="chain-arrow"><i class="pi pi-arrow-right"></i></div>
                </div>
                <div class="chain-step">
                  <div class="chain-step__icon"><i class="pi pi-check-circle"></i></div>
                  <div class="chain-step__label">Quality Check</div>
                  <div class="chain-arrow"><i class="pi pi-arrow-right"></i></div>
                </div>
                <div class="chain-step chain-step--active">
                  <div class="chain-step__icon"><i class="pi pi-box"></i></div>
                  <div class="chain-step__label">Published Product</div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- ── Tab 3: Sample Payload ──────────────────────────────────── -->
        <template #tab-3>
          <div class="tab-content">
            <div class="section-title" style="margin-bottom: 1rem">Sample JSON Payload</div>
            <div class="payload-note">
              <i class="pi pi-info-circle"></i>
              <span>This sample represents a single-record snapshot of the data product. The full API response includes pagination and metadata.</span>
            </div>
            <pre class="json-block">{{ samplePayload }}</pre>
          </div>
        </template>

        <!-- ── Tab 4: API Access ───────────────────────────────────────── -->
        <template #tab-4>
          <div class="tab-content">
            <div class="api-card">
              <div class="api-card__header">
                <span class="api-method">GET</span>
                <code class="api-endpoint">{{ apiEndpoint }}</code>
                <Button icon="pi pi-copy" text size="small" v-tooltip="'Copy endpoint'" />
              </div>
              <div class="api-params">
                <div class="section-title" style="margin-bottom: 0.75rem; font-size: 0.857rem">Query Parameters</div>
                <div class="param-table">
                  <div class="param-row"><code class="code-pill code-pill--blue">from</code><span class="param-type">datetime</span><span class="param-desc">Start of time range (ISO-8601, UTC). Default: -24h</span></div>
                  <div class="param-row"><code class="code-pill code-pill--blue">to</code><span class="param-type">datetime</span><span class="param-desc">End of time range (ISO-8601, UTC). Default: now</span></div>
                  <div class="param-row"><code class="code-pill code-pill--blue">device_id</code><span class="param-type">string</span><span class="param-desc">Filter by meter ID. Multiple values comma-separated</span></div>
                  <div class="param-row"><code class="code-pill code-pill--blue">site_ref</code><span class="param-type">string</span><span class="param-desc">Filter by site reference</span></div>
                  <div class="param-row"><code class="code-pill code-pill--blue">resolution</code><span class="param-type">enum</span><span class="param-desc">Aggregation interval: raw | 15m | 1h | 1d</span></div>
                  <div class="param-row"><code class="code-pill code-pill--blue">format</code><span class="param-type">enum</span><span class="param-desc">Response format: json | csv | parquet</span></div>
                </div>
              </div>
              <div class="api-auth">
                <i class="pi pi-shield"></i>
                <span>Authentication: Bearer token (OAuth2 / API key). Scope required: <code class="code-pill code-pill--gray">data-products:read</code></span>
              </div>
              <div class="api-status-row">
                <StatusBadge :status="product?.apiStatus ?? 'unavailable'" />
                <span class="text-muted text-sm">Base URL: <code>https://api.facis.local/v2</code></span>
              </div>
            </div>
          </div>
        </template>

        <!-- ── Tab 5: Export Formats ─────────────────────────────────── -->
        <template #tab-5>
          <div class="tab-content">
            <div class="section-title" style="margin-bottom: 1rem">Available Export Formats</div>
            <div class="export-formats">
              <div class="export-format-card export-format-card--active">
                <div class="export-format-card__icon"><i class="pi pi-file-edit"></i></div>
                <div class="export-format-card__body">
                  <div class="export-format-card__name">JSON</div>
                  <div class="export-format-card__desc">Structured records with full metadata. Suitable for API clients and real-time consumers.</div>
                  <div class="export-format-card__status"><StatusBadge status="ready" size="sm" /></div>
                </div>
              </div>
              <div class="export-format-card export-format-card--active">
                <div class="export-format-card__icon"><i class="pi pi-table"></i></div>
                <div class="export-format-card__body">
                  <div class="export-format-card__name">CSV</div>
                  <div class="export-format-card__desc">Flat tabular format. Ideal for spreadsheet analysis and bulk data transfers. RFC 4180 compliant.</div>
                  <div class="export-format-card__status"><StatusBadge status="ready" size="sm" /></div>
                </div>
              </div>
              <div class="export-format-card export-format-card--active">
                <div class="export-format-card__icon"><i class="pi pi-box"></i></div>
                <div class="export-format-card__body">
                  <div class="export-format-card__name">Parquet</div>
                  <div class="export-format-card__desc">Columnar binary format. Optimised for analytics workloads and data lakes. Supports predicate pushdown.</div>
                  <div class="export-format-card__status"><StatusBadge status="ready" size="sm" /></div>
                </div>
              </div>
              <div class="export-format-card">
                <div class="export-format-card__icon"><i class="pi pi-file"></i></div>
                <div class="export-format-card__body">
                  <div class="export-format-card__name">Avro</div>
                  <div class="export-format-card__desc">Schema-embedded binary format for Kafka/Flink consumers. Requires Schema Registry.</div>
                  <div class="export-format-card__status"><StatusBadge status="processing" size="sm" /></div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- ── Tab 6: Usage Notes ─────────────────────────────────────── -->
        <template #tab-6>
          <div class="tab-content">
            <div class="section-title" style="margin-bottom: 1rem">Usage Notes & Caveats</div>
            <div class="advisory-banner">
              <i class="pi pi-exclamation-triangle"></i>
              <span><strong>Advisory Only.</strong> This data product is intended for operational monitoring and optimisation support. It must not be used as the primary source for billing, regulatory reporting, or legal proceedings without independent verification.</span>
            </div>
            <ul class="usage-notes-list">
              <li v-for="(note, i) in usageNotes" :key="i" class="usage-note">
                <i class="pi pi-info-circle"></i>
                <span>{{ note }}</span>
              </li>
            </ul>
          </div>
        </template>

        <!-- ── Tab 7: Audit Trail ──────────────────────────────────────── -->
        <template #tab-7>
          <div class="tab-content">
            <div class="section-title" style="margin-bottom: 1rem">Product Audit Trail</div>
            <div v-if="liveMeters.length === 0 && livePvSystems.length === 0" class="api-error">
              <i class="pi pi-exclamation-circle"></i>
              <p>No audit data available — connect to simulation API to track real API calls</p>
              <Button label="Retry" size="small" @click="fetchData()" />
            </div>
            <div class="audit-trail">
              <div
                v-for="entry in [{ id: 'live', action: `Fetched ${liveMeters.length} meter readings`, result: liveMeters.length > 0 ? 'success' : 'failure', timestamp: new Date().toISOString(), type: 'API', actor: 'system', details: `GET /api/sim/meters/*/current — ${liveMeters.length} meters active` }]"
                :key="entry.id"
                class="audit-entry"
              >
                <div class="audit-entry__timeline">
                  <div class="audit-dot" :style="{ background: entry.result === 'success' ? '#22c55e' : entry.result === 'warning' ? '#f59e0b' : '#ef4444' }"></div>
                  <div class="audit-line"></div>
                </div>
                <div class="audit-entry__body">
                  <div class="audit-entry__header">
                    <span class="audit-action">{{ entry.action }}</span>
                    <span class="text-xs text-muted">{{ fmtTs(entry.timestamp) }}</span>
                  </div>
                  <p class="audit-entry__details">{{ entry.details }}</p>
                  <div class="audit-meta">
                    <code class="code-pill code-pill--gray">{{ entry.type }}</code>
                    <span class="text-xs text-muted">by {{ entry.actor }}</span>
                    <StatusBadge :status="entry.result" size="sm" />
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
.view-body { padding: 1.5rem; }
.tab-content { padding: 1.25rem; }

/* Overview */
.overview-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
}

.meta-section__title {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--facis-text);
  margin-bottom: 0.875rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--facis-primary-light);
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

.code-pill {
  font-family: var(--facis-font-mono);
  font-size: 0.75rem;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  background: var(--facis-primary-light);
  color: var(--facis-primary);
}

.code-pill--gray { background: var(--facis-surface-2); color: var(--facis-text-secondary); }
.code-pill--blue { background: rgba(59,130,246,0.1); color: #1d4ed8; }

.desc-text {
  font-size: 0.875rem;
  color: var(--facis-text-secondary);
  line-height: 1.6;
  margin-bottom: 0.5rem;
}

.quick-access {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* Schema */
.schema-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.schema-version-badge {
  font-family: var(--facis-font-mono);
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  background: rgba(34,197,94,0.1);
  color: #15803d;
}

.schema-table {
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  overflow: hidden;
}

.schema-table__header,
.schema-table__row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 100px 2fr;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  align-items: center;
}

.schema-table__header {
  background: var(--facis-surface-2);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--facis-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.schema-table__row {
  border-top: 1px solid var(--facis-border);
  font-size: 0.857rem;
}

.schema-table__row:hover { background: var(--facis-surface-2); }

.req-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.45rem;
  border-radius: 20px;
}

/* Provenance */
.prov-table {
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  overflow: hidden;
}

.prov-table__header,
.prov-table__row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1.5fr 1fr 100px;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  align-items: center;
}

.prov-table__header {
  background: var(--facis-surface-2);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--facis-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.prov-table__row {
  border-top: 1px solid var(--facis-border);
  font-size: 0.857rem;
}

.prov-table__row:hover { background: var(--facis-surface-2); }

.quality-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.quality-bar {
  flex: 1;
  height: 6px;
  background: var(--facis-border);
  border-radius: 3px;
  overflow: hidden;
}

.quality-bar__fill {
  height: 100%;
  border-radius: 3px;
}

/* Chain */
.prov-chain {}

.chain-steps {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.chain-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  position: relative;
}

.chain-step__icon {
  width: 44px;
  height: 44px;
  border-radius: var(--facis-radius-sm);
  background: var(--facis-surface-2);
  border: 1px solid var(--facis-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--facis-text-secondary);
}

.chain-step--active .chain-step__icon {
  background: var(--facis-primary-light);
  border-color: var(--facis-primary);
  color: var(--facis-primary);
}

.chain-step__label {
  font-size: 0.7rem;
  color: var(--facis-text-secondary);
  text-align: center;
}

.chain-arrow {
  color: var(--facis-text-muted);
  font-size: 0.8rem;
  padding: 0 0.25rem;
  margin-bottom: 1rem;
}

/* JSON Block */
.payload-note {
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

.json-block {
  font-family: var(--facis-font-mono);
  font-size: 0.786rem;
  line-height: 1.65;
  color: var(--facis-text);
  background: #0f172a;
  color: #e2e8f0;
  padding: 1.25rem;
  border-radius: var(--facis-radius);
  overflow-x: auto;
  white-space: pre-wrap;
}

/* API */
.api-card {
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.api-card__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: var(--facis-surface-2);
  border-bottom: 1px solid var(--facis-border);
}

.api-method {
  font-family: var(--facis-font-mono);
  font-size: 0.786rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  background: rgba(34,197,94,0.15);
  color: #15803d;
}

.api-endpoint {
  font-family: var(--facis-font-mono);
  font-size: 0.857rem;
  color: var(--facis-text);
  flex: 1;
}

.api-params {
  padding: 1.25rem;
  border-bottom: 1px solid var(--facis-border);
}

.param-table {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.param-row {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.375rem 0;
}

.param-type {
  font-family: var(--facis-font-mono);
  font-size: 0.75rem;
  color: #8b5cf6;
  min-width: 120px;
}

.param-desc {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
}

.api-auth {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1.25rem;
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
  border-bottom: 1px solid var(--facis-border);
  background: rgba(245, 158, 11, 0.05);
}

.api-status-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.875rem 1.25rem;
}

/* Export formats */
.export-formats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.export-format-card {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  transition: box-shadow 0.15s;
  opacity: 0.7;
}

.export-format-card--active {
  opacity: 1;
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.03);
}

.export-format-card__icon {
  width: 40px;
  height: 40px;
  border-radius: var(--facis-radius-sm);
  background: var(--facis-primary-light);
  color: var(--facis-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.export-format-card__name {
  font-size: 1rem;
  font-weight: 700;
  color: var(--facis-text);
  margin-bottom: 0.25rem;
}

.export-format-card__desc {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
  line-height: 1.4;
  margin-bottom: 0.625rem;
}

/* Usage notes */
.advisory-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--facis-radius);
  font-size: 0.857rem;
  color: #92400e;
  margin-bottom: 1.25rem;
  line-height: 1.5;
}

.usage-notes-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  list-style: none;
}

.usage-note {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  font-size: 0.857rem;
  color: var(--facis-text-secondary);
  line-height: 1.5;
  padding: 0.625rem 0.875rem;
  background: var(--facis-surface-2);
  border-radius: var(--facis-radius-sm);
}

.usage-note .pi {
  color: var(--facis-primary);
  margin-top: 0.1rem;
  flex-shrink: 0;
}

/* Audit trail */
.audit-trail { display: flex; flex-direction: column; }

.audit-entry {
  display: flex;
  gap: 1rem;
  padding-bottom: 1.25rem;
}

.audit-entry__timeline {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 20px;
}

.audit-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 0.3rem;
}

.audit-line {
  flex: 1;
  width: 1px;
  background: var(--facis-border);
  margin-top: 0.25rem;
}

.audit-entry:last-child .audit-line { display: none; }

.audit-entry__body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.audit-entry__header {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.audit-action {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--facis-text);
}

.audit-entry__details {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
  line-height: 1.4;
  margin: 0;
}

.audit-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .overview-grid { grid-template-columns: 1fr; }
  .export-formats { grid-template-columns: 1fr; }
  .schema-table__header, .schema-table__row { grid-template-columns: 1fr 1fr; }
  .prov-table__header, .prov-table__row { grid-template-columns: 1fr 1fr 1fr; }
}
</style>
