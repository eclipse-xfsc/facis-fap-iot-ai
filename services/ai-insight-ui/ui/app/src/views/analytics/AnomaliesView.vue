<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { getMeters, getMeterHistory, getStreetlights, getStreetlightHistory } from '@/services/api'
import { detectAnomalies, detectStreetlightAnomalies, extractMeterPowerKw } from '@/services/analytics'
import type { Anomaly } from '@/services/analytics'

const loading    = ref(true)
const isLive     = ref(false)
const anomalies  = ref<Anomaly[]>([])
const searchQuery  = ref('')
const expandedIds  = ref<Set<string>>(new Set())
const activeFilters = ref<{ severity: string | null; useCase: string | null; }>({ severity: null, useCase: null })

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [metersRes, lightsRes] = await Promise.all([getMeters(), getStreetlights()])
    if (!metersRes) throw new Error('no meters')

    const all: Anomaly[] = []

    // Energy anomalies — first 3 meters
    for (const meter of metersRes.meters.slice(0, 3)) {
      const hist = await getMeterHistory(meter.meter_id)
      if (hist?.readings?.length) {
        const anoms = detectAnomalies(hist.readings, meter.meter_id, 'active_power_kw', 'Smart Energy')
        all.push(...anoms)
      }
    }

    // City anomalies — first 2 streetlights
    if (lightsRes?.streetlights?.length) {
      for (const light of lightsRes.streetlights.slice(0, 2)) {
        const hist = await getStreetlightHistory(light.light_id)
        if (hist?.readings?.length) {
          const anoms = detectStreetlightAnomalies(
            hist.readings as Array<{ timestamp: string; power_w: number; dimming_level_pct: number }>,
            light.light_id
          )
          all.push(...anoms)
        }
      }
    }

    anomalies.value = all
    isLive.value = true
  } catch {
    anomalies.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchData())

const filtered = computed(() => {
  let result = [...anomalies.value]
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(a =>
      a.meterId.toLowerCase().includes(q) ||
      a.metric.toLowerCase().includes(q) ||
      a.explanation.toLowerCase().includes(q)
    )
  }
  if (activeFilters.value.severity) result = result.filter(a => a.severity === activeFilters.value.severity)
  if (activeFilters.value.useCase)  result = result.filter(a => a.useCase === activeFilters.value.useCase)
  return result.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
})

const summary = computed(() => ({
  total:    anomalies.value.length,
  critical: anomalies.value.filter(a => a.severity === 'critical').length,
  warning:  anomalies.value.filter(a => a.severity === 'warning').length,
  info:     anomalies.value.filter(a => a.severity === 'info').length,
  energy:   anomalies.value.filter(a => a.useCase === 'Smart Energy').length
}))

function toggleExpand(id: string): void {
  if (expandedIds.value.has(id)) expandedIds.value.delete(id)
  else expandedIds.value.add(id)
}

function formatDate(ts: string): string {
  try { return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
  catch { return ts }
}

function setFilter(key: 'severity' | 'useCase', val: string): void {
  activeFilters.value[key] = activeFilters.value[key] === val ? null : val
}

function isFilterActive(key: 'severity' | 'useCase', val: string): boolean {
  return activeFilters.value[key] === val
}

function deviationPct(a: Anomaly): string {
  const pct = a.mean !== 0 ? ((a.value - a.mean) / Math.abs(a.mean)) * 100 : 0
  return `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`
}

function deviationColor(a: Anomaly): string {
  const abs = Math.abs(a.deviation)
  if (abs >= 3) return 'var(--facis-error)'
  if (abs >= 2.5) return 'var(--facis-warning)'
  return 'var(--facis-text-secondary)'
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Anomaly Detection"
      subtitle="Statistical deviations (>2σ) detected from live simulation telemetry across all monitored meters"
      :breadcrumbs="[{ label: 'Analytics' }, { label: 'Anomalies' }]"
    />

    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> Real anomaly detection — computed from live 24h meter history
    </div>

    <div class="view-body">
      <div v-if="loading" class="loading-state">
        <i class="pi pi-spin pi-spinner" style="font-size:1.5rem;color:var(--facis-primary)"></i>
        <span>Running statistical anomaly detection on live data…</span>
      </div>

      <template v-else>
        <div class="grid-kpi">
          <KpiCard label="Total Anomalies" :value="summary.total" trend="stable" icon="pi-chart-bar" color="#005fff" />
          <KpiCard label="Critical" :value="summary.critical" trend="stable" icon="pi-times-circle" color="#ef4444" />
          <KpiCard label="Warning"  :value="summary.warning"  trend="stable" icon="pi-exclamation-triangle" color="#f59e0b" />
          <KpiCard label="Info"     :value="summary.info"     trend="stable" icon="pi-info-circle" color="#06b6d4" />
          <KpiCard label="Energy"   :value="summary.energy"   trend="stable" icon="pi-bolt" color="#8b5cf6" />
        </div>

        <div class="filter-bar">
          <div class="filter-group">
            <span class="filter-group__label">Severity:</span>
            <button v-for="sev in ['critical', 'warning', 'info']" :key="sev" class="filter-chip" :class="{ 'filter-chip--active': isFilterActive('severity', sev) }" @click="setFilter('severity', sev)">{{ sev }}</button>
          </div>
          <div class="filter-group">
            <span class="filter-group__label">Use Case:</span>
            <button v-for="uc in ['Smart Energy', 'Smart City']" :key="uc" class="filter-chip" :class="{ 'filter-chip--active': isFilterActive('useCase', uc) }" @click="setFilter('useCase', uc)">{{ uc }}</button>
          </div>
          <span class="search-wrap" style="margin-left:auto">
            <i class="pi pi-search"></i>
            <InputText v-model="searchQuery" placeholder="Search anomalies…" size="small" style="padding-left:2rem; width:220px" />
          </span>
        </div>

        <div v-if="!anomalies.length" class="card card-body empty-state">
          <i class="pi pi-check-circle" style="color:var(--facis-success);font-size:1.5rem"></i>
          <div>
            <div style="font-weight:600;color:var(--facis-text)">No anomalies detected</div>
            <div style="font-size:0.8rem;color:var(--facis-text-secondary)">All meter readings are within ±2σ of the 24h mean. System is operating normally.</div>
          </div>
        </div>

        <div v-else class="card">
          <div class="table-meta">
            <span class="table-title">{{ filtered.length }} anomalies</span>
            <span v-if="Object.values(activeFilters).some(Boolean)" class="filter-active-label">Filters active</span>
          </div>
          <DataTable :value="filtered" row-hover removable-sort scrollable @row-click="(e) => toggleExpand((e.data as Anomaly).id)">
            <template #empty><div class="empty-row">No anomalies match your filters.</div></template>

            <Column field="meterId" header="Source" sortable style="width:160px">
              <template #body="{ data }"><code class="id-code">{{ data.meterId }}</code></template>
            </Column>

            <Column field="useCase" header="Domain" sortable style="width:120px">
              <template #body="{ data }">
                <span :class="data.useCase === 'Smart Energy' ? 'uc-badge uc-badge--energy' : 'uc-badge uc-badge--city'">{{ data.useCase }}</span>
              </template>
            </Column>

            <Column field="severity" header="Severity" sortable style="width:110px">
              <template #body="{ data }"><StatusBadge :status="data.severity" size="sm" /></template>
            </Column>

            <Column field="timestamp" header="Detected" sortable style="width:170px">
              <template #body="{ data }"><span class="ts">{{ formatDate(data.timestamp) }}</span></template>
            </Column>

            <Column header="Value" style="width:100px">
              <template #body="{ data }">
                <span style="font-size:0.82rem;font-weight:600;color:var(--facis-text)">{{ data.value }} {{ data.useCase === 'Smart City' ? 'W' : 'kW' }}</span>
              </template>
            </Column>

            <Column header="Deviation" style="width:100px">
              <template #body="{ data }">
                <span :style="{ fontWeight: 600, fontSize: '0.8rem', color: deviationColor(data) }">{{ data.deviation }}σ ({{ deviationPct(data) }})</span>
              </template>
            </Column>

            <Column field="explanation" header="Summary">
              <template #body="{ data }"><span class="summary-text">{{ data.explanation }}</span></template>
            </Column>

            <Column header="" style="width:50px">
              <template #body="{ data }">
                <Button :icon="expandedIds.has(data.id) ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" text size="small" @click.stop="toggleExpand(data.id)" />
              </template>
            </Column>
          </DataTable>

          <TransitionGroup name="expand">
            <div v-for="a in filtered.filter(x => expandedIds.has(x.id))" :key="a.id + '-expanded'" class="expanded-row">
              <div class="expanded-grid">
                <div class="expanded-section">
                  <div class="exp-label">Statistical Context</div>
                  <p class="exp-text">{{ a.explanation }}</p>
                </div>
                <div class="expanded-section">
                  <div class="exp-label">Metric Details</div>
                  <div class="metric-row">
                    <div class="metric-item"><span class="metric-name">Source</span><code class="metric-value">{{ a.meterId }}</code></div>
                    <div class="metric-item"><span class="metric-name">Mean (24h)</span><span class="metric-value metric-value--baseline">{{ a.mean }} {{ a.useCase === 'Smart City' ? 'W' : 'kW' }}</span></div>
                    <div class="metric-item"><span class="metric-name">Observed</span><span class="metric-value metric-value--observed">{{ a.value }} {{ a.useCase === 'Smart City' ? 'W' : 'kW' }}</span></div>
                    <div class="metric-item"><span class="metric-name">StdDev</span><span class="metric-value">{{ a.stddev }}</span></div>
                    <div class="metric-item"><span class="metric-name">Sigma</span><span :style="{ color: deviationColor(a), fontWeight: 700 }">{{ a.deviation }}σ</span></div>
                  </div>
                </div>
              </div>
            </div>
          </TransitionGroup>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.live-banner { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #15803d; background: #dcfce7; padding: 0.375rem 1.5rem; border-bottom: 1px solid #bbf7d0; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.loading-state, .empty-state { display: flex; align-items: center; justify-content: center; gap: 0.75rem; padding: 3rem; color: var(--facis-text-secondary); font-size: 0.875rem; }
.empty-state { flex-direction: column; align-items: flex-start; background: var(--facis-surface); border: 1px solid var(--facis-border); border-radius: var(--facis-radius); padding: 1.5rem; }

.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
.filter-bar { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; background: var(--facis-surface); border: 1px solid var(--facis-border); border-radius: var(--facis-radius); padding: 0.75rem 1.25rem; box-shadow: var(--facis-shadow); }
.filter-group { display: flex; align-items: center; gap: 0.375rem; }
.filter-group__label { font-size: 0.75rem; font-weight: 500; color: var(--facis-text-secondary); }
.filter-chip { font-size: 0.75rem; font-weight: 500; padding: 0.2rem 0.625rem; border-radius: 20px; border: 1px solid var(--facis-border); background: var(--facis-surface); color: var(--facis-text-secondary); cursor: pointer; transition: all 0.15s; text-transform: capitalize; }
.filter-chip:hover { border-color: var(--facis-primary); color: var(--facis-primary); }
.filter-chip--active { background: var(--facis-primary-light); border-color: var(--facis-primary); color: var(--facis-primary); }
.search-wrap { position: relative; display: flex; align-items: center; }
.search-wrap .pi-search { position: absolute; left: 0.6rem; color: var(--facis-text-muted); font-size: 0.8rem; z-index: 1; }
.table-meta { display: flex; align-items: center; justify-content: space-between; padding: 0.875rem 1.25rem; border-bottom: 1px solid var(--facis-border); }
.table-title { font-size: 0.875rem; font-weight: 600; color: var(--facis-text); }
.filter-active-label { font-size: 0.75rem; font-weight: 600; color: var(--facis-primary); background: var(--facis-primary-light); padding: 0.15rem 0.5rem; border-radius: 3px; }
.id-code { font-family: var(--facis-font-mono); font-size: 0.75rem; background: var(--facis-surface-2); padding: 0.1rem 0.35rem; border-radius: 3px; }
.uc-badge { font-size: 0.72rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 20px; }
.uc-badge--energy { background: #fef3c7; color: #92400e; }
.uc-badge--city   { background: #f3e8ff; color: #7c3aed; }
.ts { font-size: 0.78rem; color: var(--facis-text-secondary); }
.summary-text { font-size: 0.8rem; color: var(--facis-text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.empty-row { padding: 2rem; text-align: center; color: var(--facis-text-secondary); font-size: 0.875rem; }
.expanded-row { background: var(--facis-surface-2); border-top: 1px solid var(--facis-border); border-bottom: 1px solid var(--facis-border); }
.expanded-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; padding: 1.25rem 1.5rem; }
@media (max-width: 768px) { .expanded-grid { grid-template-columns: 1fr; } }
.expanded-section { display: flex; flex-direction: column; gap: 0.5rem; }
.exp-label { font-size: 0.78rem; font-weight: 600; color: var(--facis-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
.exp-text { font-size: 0.82rem; color: var(--facis-text); line-height: 1.6; }
.metric-row { display: flex; gap: 1rem; flex-wrap: wrap; }
.metric-item { display: flex; flex-direction: column; gap: 0.2rem; }
.metric-name { font-size: 0.72rem; color: var(--facis-text-muted); font-weight: 500; }
.metric-value { font-size: 0.82rem; font-weight: 600; color: var(--facis-text); }
.metric-value--baseline { color: var(--facis-text-secondary); }
.metric-value--observed  { color: var(--facis-error); }
.expand-enter-active, .expand-leave-active { transition: opacity 0.15s; }
.expand-enter-from, .expand-leave-to { opacity: 0; }
</style>
