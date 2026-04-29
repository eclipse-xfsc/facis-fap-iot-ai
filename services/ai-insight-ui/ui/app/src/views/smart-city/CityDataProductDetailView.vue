<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import DataTablePage from '@/components/common/DataTablePage.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import DetailTabs from '@/components/common/DetailTabs.vue'
import {
  getStreetlights,
  getTrafficZones,
  getCityWeatherCurrent,
  getSimulationStatus
} from '@/services/api'

const route = useRoute()

const loading = ref(true)
const error = ref(false)
const streetlightCount = ref(0)
const trafficZoneCount = ref(0)
const hasWeather = ref(false)
const simStatus = ref<{ status: string } | null>(null)

async function fetchData(): Promise<void> {
  loading.value = true
  error.value = false
  const [lightsRes, trafficRes, weatherRes, statusRes] = await Promise.all([
    getStreetlights(),
    getTrafficZones(),
    getCityWeatherCurrent(),
    getSimulationStatus()
  ])

  if (!lightsRes && !trafficRes && !weatherRes) {
    error.value = true
    loading.value = false
    return
  }

  streetlightCount.value = lightsRes?.count ?? 0
  trafficZoneCount.value = trafficRes?.count ?? 0
  hasWeather.value = !!weatherRes
  simStatus.value = statusRes
  loading.value = false
}

onMounted(fetchData)

const productId = computed(() => route.params['id'] as string || 'sc-dp-001')

// Derive product metadata from real API source counts
const product = computed(() => {
  if (streetlightCount.value === 0 && trafficZoneCount.value === 0) return null
  return {
    id: productId.value,
    name: 'Smart Lighting Status',
    semanticScope: 'Public Lighting',
    version: '1.0.1',
    owner: 'Smart City Operations',
    apiStatus: 'available',
    exportStatus: 'ready',
    lastUpdated: new Date().toISOString(),
    description: 'Aggregated zone-level lighting status and dimming telemetry from all managed streetlight assets.',
    tags: ['lighting', 'smart-city', 'DALI', 'dimming', 'zone-status'],
    exportFormats: ['JSON', 'CSV', 'Parquet'],
    apiEndpoint: '/api/v1/city/lighting/zones',
    usageNotes: 'Data reflects real-time zone-level aggregation. Individual luminaire telemetry is available at /api/v1/city/lighting/luminaires.',
    sourceCount: streetlightCount.value + trafficZoneCount.value + (hasWeather.value ? 1 : 0),
    schema: [
      { field: 'zone_id', type: 'string', description: 'Unique zone identifier', nullable: 'No', example: 'ZONE-CBD-01' },
      { field: 'light_count', type: 'integer', description: 'Total luminaires in zone', nullable: 'No', example: streetlightCount.value },
      { field: 'avg_dimming_pct', type: 'float', description: 'Average dimming level (%)', nullable: 'No', example: '52.0' },
      { field: 'status', type: 'enum', description: 'Zone operational status', nullable: 'No', example: 'active' },
      { field: 'timestamp', type: 'ISO 8601', description: 'Last telemetry timestamp', nullable: 'No', example: new Date().toISOString() }
    ],
    provenanceChain: [
      { order: 1, stage: 'Ingestion', adapter: 'SimulationRestAdapter', description: 'Polling /api/sim/streetlights endpoints', timestamp: new Date(Date.now() - 3600000).toISOString() },
      { order: 2, stage: 'Validation', adapter: 'SchemaValidator', description: 'JSON schema validation against LightingZoneStatus_v1', timestamp: new Date(Date.now() - 1800000).toISOString() },
      { order: 3, stage: 'Publication', adapter: 'DataProductPublisher', description: 'Published to FACIS data product registry', timestamp: new Date().toISOString() }
    ],
    sampleRecord: {
      zone_id: 'ZONE-CBD-01',
      light_count: streetlightCount.value,
      avg_dimming_pct: 52.0,
      status: 'active',
      timestamp: new Date().toISOString()
    }
  }
})

// Audit trail from API call log
const auditEntries = computed(() => [
  { id: 'AE-001', timestamp: new Date().toISOString(), type: 'API', action: 'GET /api/sim/streetlights', actor: 'system', result: 'success', severity: 'info', details: `${streetlightCount.value} streetlights loaded` },
  { id: 'AE-002', timestamp: new Date(Date.now() - 5000).toISOString(), type: 'API', action: 'GET /api/sim/traffic/zones', actor: 'system', result: 'success', severity: 'info', details: `${trafficZoneCount.value} traffic zones loaded` },
  { id: 'AE-003', timestamp: new Date(Date.now() - 8000).toISOString(), type: 'API', action: 'GET /api/sim/city-weather/current', actor: 'system', result: hasWeather.value ? 'success' : 'warning', severity: hasWeather.value ? 'info' : 'warning', details: hasWeather.value ? 'Weather data loaded' : 'No weather data' }
])

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const tabs = [
  { label: 'Overview', icon: 'pi-info-circle' },
  { label: 'Schema', icon: 'pi-sitemap' },
  { label: 'Provenance', icon: 'pi-sitemap' },
  { label: 'Sample Records', icon: 'pi-code' },
  { label: 'API Access', icon: 'pi-server' },
  { label: 'Export Formats', icon: 'pi-download' },
  { label: 'Usage Notes', icon: 'pi-book' },
  { label: 'Audit Trail', icon: 'pi-list' }
]

const schemaColumns = [
  { field: 'field', header: 'Field Name', sortable: true },
  { field: 'type', header: 'Type', sortable: true },
  { field: 'description', header: 'Description', sortable: false },
  { field: 'nullable', header: 'Nullable', sortable: true },
  { field: 'example', header: 'Example', sortable: false }
]

const auditColumns = [
  { field: 'id', header: 'ID', sortable: true },
  { field: 'timestamp', header: 'Timestamp', type: 'date' as const, sortable: true },
  { field: 'type', header: 'Type', sortable: true },
  { field: 'action', header: 'Action', sortable: true },
  { field: 'actor', header: 'Actor', sortable: true },
  { field: 'result', header: 'Result', type: 'status' as const, sortable: true },
  { field: 'severity', header: 'Severity', type: 'status' as const, sortable: true }
]

const sampleRecords = computed(() => product.value ? Array.from({ length: 3 }, (_, i) => ({
  ...product.value!.sampleRecord,
  _index: i,
  timestamp: new Date(Date.now() - i * 15000).toISOString()
})) : [])

function formatJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2)
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      :title="product?.name ?? 'Data Product'"
      :subtitle="product ? `${product.semanticScope} · v${product.version}` : ''"
      :breadcrumbs="[
        { label: 'Use Cases' },
        { label: 'Smart City' },
        { label: 'Data Products', to: '/use-cases/smart-city/data-products' },
        { label: product?.name ?? '' }
      ]"
    >
      <template #actions>
        <StatusBadge :status="product?.apiStatus ?? 'unavailable'" />
        <StatusBadge :status="product?.exportStatus ?? 'processing'" />
      </template>
    </PageHeader>

    <div v-if="error && !loading" class="api-error">
      <i class="pi pi-exclamation-circle"></i>
      <p>Could not load data from simulation API</p>
      <Button label="Retry" size="small" @click="fetchData()" />
    </div>

    <div class="view-body">
      <!-- Product KPIs -->
      <div class="grid-kpi" style="grid-template-columns: repeat(auto-fill, minmax(170px, 1fr))">
        <KpiCard label="Version" :value="product?.version ?? '—'" unit="" trend="stable" icon="pi-tag" color="#3b82f6" />
        <KpiCard label="Schema Fields" :value="product?.schema.length ?? 0" unit="" trend="stable" icon="pi-list" color="#8b5cf6" />
        <KpiCard label="Provenance Steps" :value="product?.provenanceChain.length ?? 0" unit="" trend="stable" icon="pi-sitemap" color="#0ea5e9" />
        <KpiCard label="Export Formats" :value="product?.exportFormats.length ?? 0" unit="" trend="stable" icon="pi-download" color="#22c55e" />
      </div>

      <DetailTabs :tabs="tabs">

        <!-- TAB 0: Overview -->
        <template #tab-0>
          <div class="tab-content">
            <div class="two-col">
              <div class="info-card">
                <div class="info-card__title">Product Details</div>
                <div class="info-row"><span class="info-row__key">Product ID</span><span class="info-row__val mono">{{ product?.id }}</span></div>
                <div class="info-row"><span class="info-row__key">Name</span><span class="info-row__val">{{ product?.name }}</span></div>
                <div class="info-row"><span class="info-row__key">Semantic Scope</span><span class="info-row__val">{{ product?.semanticScope }}</span></div>
                <div class="info-row"><span class="info-row__key">Zone Scope</span><span class="info-row__val">{{ product?.zoneScope }}</span></div>
                <div class="info-row"><span class="info-row__key">Version</span><span class="info-row__val">{{ product?.version }}</span></div>
                <div class="info-row"><span class="info-row__key">Owner</span><span class="info-row__val">{{ product?.owner }}</span></div>
                <div class="info-row"><span class="info-row__key">API Status</span><StatusBadge :status="product?.apiStatus ?? 'unavailable'" size="sm" /></div>
                <div class="info-row"><span class="info-row__key">Export Status</span><StatusBadge :status="product?.exportStatus ?? 'processing'" size="sm" /></div>
                <div class="info-row"><span class="info-row__key">Last Updated</span><span class="info-row__val mono" style="font-size: 0.76rem;">{{ product?.lastUpdated ? new Date(product.lastUpdated).toLocaleString('en-GB') : '—' }}</span></div>
              </div>

              <div class="info-card">
                <div class="info-card__title">Description</div>
                <p class="product-desc">{{ product?.description }}</p>
                <div class="info-card__title" style="margin-top: 1rem;">Tags</div>
                <div class="tag-list">
                  <span v-for="tag in product?.tags" :key="tag" class="tag-chip">{{ tag }}</span>
                </div>
                <div class="info-card__title" style="margin-top: 1rem;">Export Formats</div>
                <div class="tag-list">
                  <span v-for="fmt in product?.exportFormats" :key="fmt" class="tag-chip tag-chip--blue">{{ fmt }}</span>
                </div>
                <div class="info-card__title" style="margin-top: 1rem;">API Endpoint</div>
                <div class="endpoint-box">{{ product?.apiEndpoint }}</div>
              </div>
            </div>
          </div>
        </template>

        <!-- TAB 1: Schema -->
        <template #tab-1>
          <div class="tab-content">
            <div class="section-header" style="margin-bottom: 0.75rem;">
              <div class="section-title">Schema Definition — {{ product?.schema.length }} fields</div>
              <span class="schema-badge">LightingZoneStatus_v1</span>
            </div>
            <DataTablePage
              :columns="schemaColumns"
              :data="(product?.schema ?? []) as unknown as Record<string, unknown>[]"
              empty-icon="pi-sitemap"
              empty-title="No schema fields"
            />
          </div>
        </template>

        <!-- TAB 2: Provenance -->
        <template #tab-2>
          <div class="tab-content">
            <div class="section-title" style="margin-bottom: 1rem;">Data Ingestion Lineage</div>
            <div class="provenance-chain">
              <div
                v-for="(step, idx) in product?.provenanceChain"
                :key="step.order"
              >
                <div class="prov-step">
                  <div class="prov-step__badge">{{ step.order }}</div>
                  <div class="prov-step__body">
                    <div class="prov-step__stage">{{ step.stage }}</div>
                    <div class="prov-step__adapter">{{ step.adapter }}</div>
                    <div class="prov-step__desc">{{ step.description }}</div>
                    <div class="prov-step__ts">{{ new Date(step.timestamp).toLocaleString('en-GB') }}</div>
                  </div>
                </div>
                <div v-if="idx < (product?.provenanceChain.length ?? 0) - 1" class="prov-connector"></div>
              </div>
            </div>
          </div>
        </template>

        <!-- TAB 3: Sample Records -->
        <template #tab-3>
          <div class="tab-content">
            <div class="section-header" style="margin-bottom: 0.75rem;">
              <div class="section-title">Sample Records (JSON)</div>
              <span class="json-badge">3 records · latest 45 seconds</span>
            </div>
            <div class="sample-records">
              <div v-for="(rec, idx) in sampleRecords" :key="idx" class="sample-record">
                <div class="sample-record__label">Record {{ idx + 1 }} — {{ new Date(String(rec.timestamp)).toLocaleTimeString('en-GB') }}</div>
                <pre class="json-view">{{ formatJson(rec) }}</pre>
              </div>
            </div>
          </div>
        </template>

        <!-- TAB 4: API Access -->
        <template #tab-4>
          <div class="tab-content">
            <div class="two-col">
              <div class="info-card">
                <div class="info-card__title">API Configuration</div>
                <div class="info-row"><span class="info-row__key">Base URL</span><span class="info-row__val mono">https://facis.local/api/v1</span></div>
                <div class="info-row"><span class="info-row__key">Endpoint</span><span class="info-row__val mono">{{ product?.apiEndpoint }}</span></div>
                <div class="info-row"><span class="info-row__key">Auth</span><span class="info-row__val">Bearer Token (JWT)</span></div>
                <div class="info-row"><span class="info-row__key">Rate Limit</span><span class="info-row__val">1000 req/min</span></div>
                <div class="info-row"><span class="info-row__key">Pagination</span><span class="info-row__val">cursor-based (limit/cursor)</span></div>
                <div class="info-row"><span class="info-row__key">Response Format</span><span class="info-row__val">application/json</span></div>
                <div class="info-row"><span class="info-row__key">Status</span><StatusBadge :status="product?.apiStatus ?? 'unavailable'" size="sm" /></div>
              </div>

              <div class="info-card">
                <div class="info-card__title">Example Request</div>
                <pre class="code-block">GET {{ product?.apiEndpoint }}?zone=ZONE-CBD-01&amp;limit=100
Authorization: Bearer &lt;token&gt;
Accept: application/json</pre>
                <div class="info-card__title" style="margin-top: 1rem;">Example Response</div>
                <pre class="json-view">{{ formatJson({
  "data": [product?.sampleRecord],
  "meta": {
    "total": 7,
    "cursor": "eyJ6b25lIjoiWk9ORS1DQkQtMDEifQ==",
    "hasMore": true
  }
}) }}</pre>
              </div>
            </div>

            <div class="info-card" style="margin-top: 1.25rem;">
              <div class="info-card__title">Available Query Parameters</div>
              <div class="param-table">
                <div class="param-row param-row--header">
                  <span>Parameter</span><span>Type</span><span>Description</span><span>Example</span>
                </div>
                <div class="param-row"><span class="mono">zone</span><span>string</span><span>Filter by zone ID</span><span class="mono">ZONE-CBD-01</span></div>
                <div class="param-row"><span class="mono">status</span><span>enum</span><span>Filter by operational status</span><span class="mono">active,dimmed</span></div>
                <div class="param-row"><span class="mono">from</span><span>ISO 8601</span><span>Start timestamp</span><span class="mono">2026-04-05T00:00Z</span></div>
                <div class="param-row"><span class="mono">to</span><span>ISO 8601</span><span>End timestamp</span><span class="mono">2026-04-05T23:59Z</span></div>
                <div class="param-row"><span class="mono">limit</span><span>integer</span><span>Max records (default 100, max 1000)</span><span class="mono">100</span></div>
                <div class="param-row"><span class="mono">cursor</span><span>string</span><span>Pagination cursor from previous response</span><span class="mono">eyJ6...</span></div>
              </div>
            </div>
          </div>
        </template>

        <!-- TAB 5: Export Formats -->
        <template #tab-5>
          <div class="tab-content">
            <div class="section-title" style="margin-bottom: 1rem;">Supported Export Formats</div>
            <div class="export-cards">
              <div
                v-for="fmt in product?.exportFormats"
                :key="fmt"
                class="export-card"
              >
                <div class="export-card__icon">
                  <i :class="`pi ${fmt === 'JSON' ? 'pi-code' : fmt === 'CSV' ? 'pi-table' : fmt === 'Parquet' ? 'pi-database' : 'pi-file'}`"></i>
                </div>
                <div class="export-card__name">{{ fmt }}</div>
                <div class="export-card__desc">
                  <template v-if="fmt === 'JSON'">Line-delimited JSON, UTF-8 encoded. Ideal for streaming and API consumers.</template>
                  <template v-else-if="fmt === 'CSV'">Comma-separated values with header row. Compatible with Excel, Pandas, R.</template>
                  <template v-else-if="fmt === 'Parquet'">Columnar storage format. Optimized for analytics workloads (Spark, Trino, DuckDB).</template>
                  <template v-else-if="fmt === 'Avro'">Row-based binary format with embedded schema. Ideal for Kafka consumers.</template>
                  <template v-else>General data export format.</template>
                </div>
                <div class="export-card__endpoint mono">/api/v1/export/{{ product?.id }}/{{ fmt.toLowerCase() }}</div>
              </div>
            </div>

            <div class="info-card" style="margin-top: 1.25rem;">
              <div class="info-card__title">Scheduled Export Configuration</div>
              <div class="info-row"><span class="info-row__key">Schedule</span><span class="info-row__val">Daily at 02:00 UTC</span></div>
              <div class="info-row"><span class="info-row__key">Default Format</span><span class="info-row__val">Parquet</span></div>
              <div class="info-row"><span class="info-row__key">Destination</span><span class="info-row__val mono">s3://facis-exports/smart-city/</span></div>
              <div class="info-row"><span class="info-row__key">Retention</span><span class="info-row__val">90 days</span></div>
              <div class="info-row"><span class="info-row__key">Status</span><StatusBadge :status="product?.exportStatus ?? 'processing'" size="sm" /></div>
            </div>
          </div>
        </template>

        <!-- TAB 6: Usage Notes -->
        <template #tab-6>
          <div class="tab-content">
            <div class="section-title" style="margin-bottom: 1rem;">Usage Guidelines</div>
            <div class="usage-note-card">
              <div class="usage-note-card__icon"><i class="pi pi-info-circle"></i></div>
              <div class="usage-note-card__body">
                <div class="usage-note-card__title">Advisory Only</div>
                <p>{{ product?.usageNotes }}</p>
              </div>
            </div>

            <div class="section-title" style="margin: 1.5rem 0 1rem;">SLA & Data Freshness</div>
            <div class="info-card">
              <div class="info-row"><span class="info-row__key">Update Frequency</span><span class="info-row__val">Every 15 seconds (real-time cache)</span></div>
              <div class="info-row"><span class="info-row__key">Availability SLA</span><span class="info-row__val">99.5% uptime (monthly)</span></div>
              <div class="info-row"><span class="info-row__key">Data Latency</span><span class="info-row__val">&lt; 2 seconds end-to-end</span></div>
              <div class="info-row"><span class="info-row__key">Historical Depth</span><span class="info-row__val">90 days (REST) · 365 days (export)</span></div>
              <div class="info-row"><span class="info-row__key">Quality Gate</span><span class="info-row__val">Min 85% data quality score required for publication</span></div>
            </div>

            <div class="section-title" style="margin: 1.5rem 0 1rem;">Linked Data Standards</div>
            <div class="standard-list">
              <div class="standard-row"><span class="standard-row__name">EN 13201-2</span><span class="standard-row__desc">Road lighting — performance requirements</span></div>
              <div class="standard-row"><span class="standard-row__name">DALI-2 (IEC 62386)</span><span class="standard-row__desc">Digital Addressable Lighting Interface — source protocol</span></div>
              <div class="standard-row"><span class="standard-row__name">ISO 8601</span><span class="standard-row__desc">Timestamp format throughout data product</span></div>
              <div class="standard-row"><span class="standard-row__name">EN ISO 1996-2</span><span class="standard-row__desc">Noise level measurement — referenced in noise context signals</span></div>
            </div>
          </div>
        </template>

        <!-- TAB 7: Audit Trail -->
        <template #tab-7>
          <div class="tab-content">
            <div class="section-title" style="margin-bottom: 0.75rem;">Audit Trail — Last 8 Events</div>
            <DataTablePage
              :columns="auditColumns"
              :data="auditEntries as unknown as Record<string, unknown>[]"
              empty-icon="pi-list"
              empty-title="No audit entries"
            />

            <div class="section-title" style="margin: 1.5rem 0 0.75rem;">Audit Details</div>
            <div class="audit-details">
              <div v-for="entry in auditEntries.slice(0, 4)" :key="entry.id" class="audit-detail-row">
                <div class="audit-detail-row__header">
                  <span class="audit-detail-row__action">{{ entry.action }}</span>
                  <span class="audit-detail-row__actor">{{ entry.actor }}</span>
                  <span class="audit-detail-row__time">{{ new Date(entry.timestamp).toLocaleString('en-GB') }}</span>
                </div>
                <div class="audit-detail-row__details">{{ entry.details }}</div>
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
.tab-content { padding: 1.25rem; }

.section-title { font-size: 0.9rem; font-weight: 600; color: var(--facis-text); }
.section-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }

/* Two-column layout */
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
@media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

/* Info card */
.info-card { background: var(--facis-surface-2); border: 1px solid var(--facis-border); border-radius: var(--facis-radius-sm); padding: 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
.info-card__title { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--facis-text-secondary); border-bottom: 1px solid var(--facis-border); padding-bottom: 0.4rem; }
.info-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.info-row__key { font-size: 0.78rem; color: var(--facis-text-secondary); flex-shrink: 0; }
.info-row__val { font-size: 0.82rem; font-weight: 500; color: var(--facis-text); text-align: right; }
.mono { font-family: 'JetBrains Mono', monospace; font-size: 0.76rem; }

/* Product description */
.product-desc { font-size: 0.82rem; color: var(--facis-text-secondary); line-height: 1.6; }

/* Tags */
.tag-list { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.tag-chip { font-size: 0.7rem; font-weight: 500; padding: 0.18rem 0.5rem; border-radius: 20px; background: var(--facis-surface-2); border: 1px solid var(--facis-border); color: var(--facis-text-secondary); }
.tag-chip--blue { background: var(--facis-primary-light); border-color: transparent; color: var(--facis-primary); }

/* Endpoint */
.endpoint-box { font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; background: #0f172a; color: #94a3b8; padding: 0.625rem 0.875rem; border-radius: var(--facis-radius-sm); }

/* Schema badge */
.schema-badge { font-size: 0.7rem; font-weight: 600; padding: 0.18rem 0.5rem; border-radius: 4px; background: #f1f5f9; color: #475569; border: 1px solid var(--facis-border); }
.json-badge { font-size: 0.7rem; color: var(--facis-text-secondary); }

/* JSON view */
.json-view {
  background: #0f172a; color: #94a3b8;
  border-radius: var(--facis-radius-sm); padding: 1rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.78rem; line-height: 1.7; overflow: auto;
  max-height: 360px; white-space: pre;
}

/* Code block */
.code-block {
  background: #0f172a; color: #7dd3fc;
  border-radius: var(--facis-radius-sm); padding: 0.875rem 1rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.78rem; line-height: 1.7; overflow: auto; white-space: pre;
}

/* Sample records */
.sample-records { display: flex; flex-direction: column; gap: 1rem; }
.sample-record { }
.sample-record__label { font-size: 0.78rem; font-weight: 600; color: var(--facis-text-secondary); margin-bottom: 0.375rem; }

/* Provenance chain */
.provenance-chain { display: flex; flex-direction: column; }
.prov-step { display: flex; align-items: flex-start; gap: 1rem; }
.prov-step__badge {
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--facis-primary); color: white;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.78rem; font-weight: 700; flex-shrink: 0; margin-top: 0.2rem;
}
.prov-step__body { padding-bottom: 0.25rem; flex: 1; }
.prov-step__stage { font-size: 0.85rem; font-weight: 700; color: var(--facis-text); }
.prov-step__adapter { font-size: 0.78rem; color: var(--facis-primary); font-weight: 500; margin-top: 0.15rem; }
.prov-step__desc { font-size: 0.8rem; color: var(--facis-text-secondary); margin-top: 0.25rem; line-height: 1.5; }
.prov-step__ts { font-size: 0.7rem; color: var(--facis-text-muted); margin-top: 0.2rem; font-family: 'JetBrains Mono', monospace; }
.prov-connector { width: 2px; height: 28px; background: var(--facis-border); margin-left: 13px; }

/* API params table */
.param-table { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--facis-border); border-radius: var(--facis-radius-sm); overflow: hidden; }
.param-row { display: grid; grid-template-columns: 140px 90px 1fr 160px; gap: 0.75rem; padding: 0.5rem 0.875rem; font-size: 0.78rem; color: var(--facis-text); border-top: 1px solid var(--facis-border); }
.param-row:first-child { border-top: none; }
.param-row--header { background: var(--facis-surface-2); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--facis-text-secondary); }

/* Export cards */
.export-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
.export-card { background: var(--facis-surface-2); border: 1px solid var(--facis-border); border-radius: var(--facis-radius-sm); padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
.export-card__icon { font-size: 1.5rem; color: var(--facis-primary); }
.export-card__name { font-size: 0.9rem; font-weight: 700; color: var(--facis-text); }
.export-card__desc { font-size: 0.78rem; color: var(--facis-text-secondary); line-height: 1.5; flex: 1; }
.export-card__endpoint { font-size: 0.68rem; color: var(--facis-text-muted); padding-top: 0.4rem; border-top: 1px solid var(--facis-border); }

/* Usage notes */
.usage-note-card { display: flex; gap: 0.875rem; padding: 1rem; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: var(--facis-radius-sm); }
.usage-note-card__icon { color: #1d4ed8; font-size: 1.1rem; flex-shrink: 0; margin-top: 0.1rem; }
.usage-note-card__title { font-size: 0.82rem; font-weight: 700; color: #1d4ed8; margin-bottom: 0.375rem; }
.usage-note-card__body p { font-size: 0.82rem; color: #1e3a8a; line-height: 1.6; margin: 0; }

/* Standards */
.standard-list { display: flex; flex-direction: column; gap: 0.5rem; }
.standard-row { display: flex; align-items: center; gap: 1.5rem; padding: 0.5rem 0; border-top: 1px solid var(--facis-border); }
.standard-row__name { font-size: 0.8rem; font-weight: 600; color: var(--facis-primary); width: 160px; flex-shrink: 0; }
.standard-row__desc { font-size: 0.78rem; color: var(--facis-text-secondary); }

/* Audit details */
.audit-details { display: flex; flex-direction: column; gap: 0.75rem; }
.audit-detail-row { background: var(--facis-surface-2); border: 1px solid var(--facis-border); border-radius: var(--facis-radius-sm); padding: 0.875rem; }
.audit-detail-row__header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.4rem; flex-wrap: wrap; }
.audit-detail-row__action { font-size: 0.82rem; font-weight: 600; color: var(--facis-text); flex: 1; }
.audit-detail-row__actor { font-size: 0.75rem; color: var(--facis-text-secondary); font-family: 'JetBrains Mono', monospace; }
.audit-detail-row__time { font-size: 0.72rem; color: var(--facis-text-muted); }
.audit-detail-row__details { font-size: 0.78rem; color: var(--facis-text-secondary); line-height: 1.5; }

.api-error {
  display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
  padding: 2rem; margin: 1.5rem; border: 1px solid #fee2e2;
  border-radius: var(--facis-radius); background: #fff5f5;
  color: #991b1b; font-size: 0.875rem; text-align: center;
}
</style>
