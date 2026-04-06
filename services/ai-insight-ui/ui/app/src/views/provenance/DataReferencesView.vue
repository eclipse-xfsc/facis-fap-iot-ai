<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'

interface DataReference {
  id: string
  sourceName: string
  sourceType: 'data-source' | 'schema' | 'external-api'
  targetName: string
  targetType: 'data-product' | 'schema' | 'data-source'
  relationship: 'derives-from' | 'validates-against' | 'composed-of' | 'mapped-to'
  status: 'resolved' | 'unresolved' | 'broken'
  lastValidated: string
}

const references: DataReference[] = [
  { id: 'ref-001', sourceName: 'Smart Meters (Modbus REST)',  sourceType: 'data-source',  targetName: 'Energy Consumption Timeseries', targetType: 'data-product', relationship: 'derives-from',      status: 'resolved',   lastValidated: new Date(Date.now() - 3_600_000).toISOString() },
  { id: 'ref-002', sourceName: 'PV Systems (SunSpec REST)',   sourceType: 'data-source',  targetName: 'Solar Generation Overview',    targetType: 'data-product', relationship: 'derives-from',      status: 'resolved',   lastValidated: new Date(Date.now() - 7_200_000).toISOString() },
  { id: 'ref-003', sourceName: 'Streetlights (DALI REST)',   sourceType: 'data-source',  targetName: 'Smart City Lighting Index',    targetType: 'data-product', relationship: 'derives-from',      status: 'resolved',   lastValidated: new Date(Date.now() - 7_200_000).toISOString() },
  { id: 'ref-004', sourceName: 'Traffic Zones (REST)',        sourceType: 'data-source',  targetName: 'Urban Traffic Flow Analytics', targetType: 'data-product', relationship: 'derives-from',      status: 'resolved',   lastValidated: new Date(Date.now() - 14_400_000).toISOString() },
  { id: 'ref-005', sourceName: 'EnergyMeterReading_v2',       sourceType: 'schema',       targetName: 'Energy Consumption Timeseries', targetType: 'data-product', relationship: 'validates-against', status: 'resolved',   lastValidated: new Date(Date.now() - 3_600_000).toISOString() },
  { id: 'ref-006', sourceName: 'SunSpecPVInverter_v1',        sourceType: 'schema',       targetName: 'Solar Generation Overview',    targetType: 'data-product', relationship: 'validates-against', status: 'unresolved', lastValidated: new Date(Date.now() - 86_400_000).toISOString() },
  { id: 'ref-007', sourceName: 'DALILightingZoneStatus_v1',   sourceType: 'schema',       targetName: 'Smart City Lighting Index',    targetType: 'data-product', relationship: 'validates-against', status: 'resolved',   lastValidated: new Date(Date.now() - 7_200_000).toISOString() },
  { id: 'ref-008', sourceName: 'Modbus/EnergyMeter',          sourceType: 'external-api', targetName: 'EnergyMeterReading_v2',        targetType: 'schema',       relationship: 'mapped-to',         status: 'resolved',   lastValidated: new Date(Date.now() - 86_400_000).toISOString() },
  { id: 'ref-009', sourceName: 'SunSpec/Inverter',            sourceType: 'external-api', targetName: 'SunSpecPVInverter_v1',         targetType: 'schema',       relationship: 'mapped-to',         status: 'unresolved', lastValidated: new Date(Date.now() - 259_200_000).toISOString() },
  { id: 'ref-010', sourceName: 'Energy Consumption Timeseries', sourceType: 'data-source', targetName: 'Grid Stability Report',       targetType: 'data-product', relationship: 'composed-of',       status: 'resolved',   lastValidated: new Date(Date.now() - 3_600_000).toISOString() }
]

const RELATIONSHIP_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  'derives-from':       { label: 'Derives From',       color: '#1d4ed8', bg: '#dbeafe' },
  'validates-against':  { label: 'Validates Against',  color: '#15803d', bg: '#dcfce7' },
  'composed-of':        { label: 'Composed Of',        color: '#7c3aed', bg: '#ede9fe' },
  'mapped-to':          { label: 'Mapped To',          color: '#0f766e', bg: '#ccfbf1' }
}

const TYPE_ICONS: Record<string, string> = {
  'data-source':  'pi-database',
  'schema':       'pi-file-o',
  'external-api': 'pi-cloud',
  'data-product': 'pi-box'
}

// Group references by target data product
const byProduct = computed(() => {
  const map = new Map<string, DataReference[]>()
  for (const ref of references) {
    if (ref.targetType === 'data-product') {
      const list = map.get(ref.targetName) ?? []
      list.push(ref)
      map.set(ref.targetName, list)
    }
  }
  return Array.from(map.entries()).map(([product, refs]) => ({ product, refs }))
})

const outgoingRefs = computed(() => references.filter(r => r.targetType === 'data-product' || r.targetType === 'data-source'))
const schemaRefs = computed(() => references.filter(r => r.sourceType === 'schema' || r.targetType === 'schema' || r.sourceType === 'external-api'))

const stats = computed(() => ({
  total: references.length,
  resolved: references.filter(r => r.status === 'resolved').length,
  unresolved: references.filter(r => r.status === 'unresolved').length,
  broken: references.filter(r => r.status === 'broken').length
}))

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Data References"
      subtitle="Upstream and downstream data dependencies, lineage links, and schema relationships"
      :breadcrumbs="[{ label: 'Provenance & Audit' }, { label: 'Data References' }]"
    />

    <div class="view-body">
      <!-- Summary row -->
      <div class="ref-summary">
        <div class="rs-tile">
          <span class="rst-num">{{ stats.total }}</span>
          <span class="rst-lbl">Total References</span>
        </div>
        <div class="rs-divider"></div>
        <div class="rs-tile">
          <span class="rst-num rst-num--green">{{ stats.resolved }}</span>
          <span class="rst-lbl">Resolved</span>
        </div>
        <div class="rs-divider"></div>
        <div class="rs-tile">
          <span class="rst-num rst-num--orange">{{ stats.unresolved }}</span>
          <span class="rst-lbl">Unresolved</span>
        </div>
        <div class="rs-divider"></div>
        <div class="rs-tile">
          <span class="rst-num rst-num--red">{{ stats.broken }}</span>
          <span class="rst-lbl">Broken</span>
        </div>
      </div>

      <!-- Outgoing reference table -->
      <div class="card card-body">
        <div class="section-label">Outgoing References — Sources to Data Products</div>
        <p class="section-sub">What data products use which sources and how they relate.</p>
        <div class="ref-table">
          <div class="rt-header">
            <span>Source</span>
            <span>Relationship</span>
            <span>Target</span>
            <span>Status</span>
            <span>Last Validated</span>
          </div>
          <div
            v-for="ref in outgoingRefs"
            :key="ref.id"
            class="rt-row"
          >
            <div class="rt-cell rt-source">
              <div class="rt-icon rt-icon--source">
                <i :class="`pi ${TYPE_ICONS[ref.sourceType]}`"></i>
              </div>
              <div class="rt-name-group">
                <span class="rt-name">{{ ref.sourceName }}</span>
                <span class="rt-type">{{ ref.sourceType }}</span>
              </div>
            </div>
            <div class="rt-cell">
              <span
                class="rel-badge"
                :style="{ background: RELATIONSHIP_CONFIG[ref.relationship].bg, color: RELATIONSHIP_CONFIG[ref.relationship].color }"
              >{{ RELATIONSHIP_CONFIG[ref.relationship].label }}</span>
            </div>
            <div class="rt-cell rt-target">
              <div class="rt-icon rt-icon--target">
                <i :class="`pi ${TYPE_ICONS[ref.targetType]}`"></i>
              </div>
              <div class="rt-name-group">
                <span class="rt-name">{{ ref.targetName }}</span>
                <span class="rt-type">{{ ref.targetType }}</span>
              </div>
            </div>
            <div class="rt-cell">
              <StatusBadge :status="ref.status" size="sm" />
            </div>
            <div class="rt-cell rt-date">
              {{ formatDate(ref.lastValidated) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Linked products composition -->
      <div class="card card-body">
        <div class="section-label">Linked Data Products — Source Composition</div>
        <div class="products-list">
          <div v-for="{ product, refs } in byProduct" :key="product" class="product-block">
            <div class="pb-header">
              <div class="pb-icon"><i class="pi pi-box"></i></div>
              <span class="pb-name">{{ product }}</span>
              <span class="pb-count">{{ refs.length }} source{{ refs.length !== 1 ? 's' : '' }}</span>
            </div>
            <div class="pb-sources">
              <div v-for="ref in refs" :key="ref.id" class="pbs-row">
                <div class="pbs-icon">
                  <i :class="`pi ${TYPE_ICONS[ref.sourceType]}`"></i>
                </div>
                <span class="pbs-name">{{ ref.sourceName }}</span>
                <span
                  class="rel-badge rel-badge--sm"
                  :style="{ background: RELATIONSHIP_CONFIG[ref.relationship].bg, color: RELATIONSHIP_CONFIG[ref.relationship].color }"
                >{{ RELATIONSHIP_CONFIG[ref.relationship].label }}</span>
                <StatusBadge :status="ref.status" size="sm" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Schema relationships -->
      <div class="card card-body">
        <div class="section-label">Schema Relationships</div>
        <div class="schema-rels">
          <div v-for="ref in schemaRefs" :key="ref.id" class="sr-row">
            <div class="srr-left">
              <div class="srr-node srr-node--a">
                <i :class="`pi ${TYPE_ICONS[ref.sourceType]}`"></i>
                <span>{{ ref.sourceName }}</span>
              </div>
              <div class="srr-connector">
                <div class="srr-line"></div>
                <span
                  class="rel-badge"
                  :style="{ background: RELATIONSHIP_CONFIG[ref.relationship].bg, color: RELATIONSHIP_CONFIG[ref.relationship].color }"
                >{{ RELATIONSHIP_CONFIG[ref.relationship].label }}</span>
                <div class="srr-line"></div>
                <i class="pi pi-arrow-right srr-arrow"></i>
              </div>
              <div class="srr-node srr-node--b">
                <i :class="`pi ${TYPE_ICONS[ref.targetType]}`"></i>
                <span>{{ ref.targetName }}</span>
              </div>
            </div>
            <StatusBadge :status="ref.status" size="sm" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-page { display: flex; flex-direction: column; }

.view-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Summary */
.ref-summary {
  display: flex;
  align-items: center;
  background: var(--facis-surface);
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  box-shadow: var(--facis-shadow);
  padding: 1rem 1.5rem;
  width: fit-content;
  gap: 0;
}

.rs-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
  padding: 0 1.5rem;
}

.rs-divider {
  width: 1px;
  height: 36px;
  background: var(--facis-border);
  flex-shrink: 0;
}

.rst-num {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--facis-text);
  line-height: 1;
}

.rst-num--green { color: var(--facis-success); }
.rst-num--orange { color: var(--facis-warning); }
.rst-num--red   { color: var(--facis-error); }

.rst-lbl {
  font-size: 0.714rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--facis-text-secondary);
  font-weight: 500;
}

/* Sections */
.section-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--facis-text);
  margin-bottom: 0.5rem;
}

.section-sub {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
  margin-bottom: 1rem;
}

/* Reference table */
.ref-table {
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
}

.rt-header {
  display: grid;
  grid-template-columns: 2fr 1.2fr 2fr 1fr 1.5fr;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--facis-surface-2);
  border-radius: var(--facis-radius-sm) var(--facis-radius-sm) 0 0;
  font-size: 0.714rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--facis-text-secondary);
}

.rt-row {
  display: grid;
  grid-template-columns: 2fr 1.2fr 2fr 1fr 1.5fr;
  gap: 0.75rem;
  padding: 0.75rem;
  align-items: center;
  border-bottom: 1px solid var(--facis-border);
  transition: background 0.1s;
}

.rt-row:last-child { border-bottom: none; }
.rt-row:hover { background: var(--facis-surface-2); }

.rt-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.rt-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  flex-shrink: 0;
}

.rt-icon--source { background: var(--facis-primary-light); color: var(--facis-primary); }
.rt-icon--target { background: #dcfce7; color: #15803d; }

.rt-name-group { display: flex; flex-direction: column; gap: 0.1rem; }
.rt-name { font-weight: 500; color: var(--facis-text); font-size: 0.8rem; }
.rt-type { font-size: 0.7rem; color: var(--facis-text-muted); }
.rt-date { font-size: 0.75rem; color: var(--facis-text-secondary); }

.rel-badge {
  font-size: 0.714rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 20px;
  white-space: nowrap;
}

.rel-badge--sm {
  font-size: 0.7rem;
  padding: 0.15rem 0.45rem;
}

/* Products */
.products-list {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.product-block {
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius-sm);
  overflow: hidden;
}

.pb-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 1rem;
  background: var(--facis-surface-2);
  border-bottom: 1px solid var(--facis-border);
}

.pb-icon {
  width: 28px;
  height: 28px;
  background: #dcfce7;
  color: #15803d;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
}

.pb-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--facis-text);
  flex: 1;
}

.pb-count {
  font-size: 0.75rem;
  color: var(--facis-text-secondary);
}

.pb-sources { padding: 0.5rem 1rem; }

.pbs-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--facis-border);
}

.pbs-row:last-child { border-bottom: none; }

.pbs-icon {
  width: 24px;
  height: 24px;
  background: var(--facis-primary-light);
  color: var(--facis-primary);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
}

.pbs-name {
  font-size: 0.8rem;
  color: var(--facis-text);
  flex: 1;
}

/* Schema relationships */
.schema-rels { display: flex; flex-direction: column; gap: 0.75rem; }

.sr-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--facis-surface-2);
  border-radius: var(--facis-radius-sm);
  border: 1px solid var(--facis-border);
}

.srr-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  flex-wrap: wrap;
}

.srr-node {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  font-weight: 500;
  padding: 0.35rem 0.75rem;
  border-radius: var(--facis-radius-sm);
}

.srr-node--a { background: var(--facis-primary-light); color: var(--facis-primary); }
.srr-node--b { background: #dcfce7; color: #15803d; }

.srr-connector {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.srr-line {
  width: 20px;
  height: 1px;
  background: var(--facis-border-strong);
}

.srr-arrow {
  font-size: 0.65rem;
  color: var(--facis-text-muted);
}
</style>
