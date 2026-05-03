<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import {
  getInsightLatest,
  postInsightEnergySummary,
  postInsightAnomalyReport,
  postInsightCityStatus,
} from '@/services/api'
import { useNotificationsStore } from '@/stores/notifications'

interface InsightCard {
  id: string
  type: 'energy-summary' | 'anomaly-report' | 'city-status'
  title: string
  summary: string
  findings: string[]
  recommendations: string[]
  generated_at: string
}

const loading        = ref(true)
const isLive         = ref(false)
const insights       = ref<InsightCard[]>([])
const lastError      = ref<string | null>(null)
const notifications  = useNotificationsStore()

// Window: today (UTC). The backend uses strict-less-than on the date column,
// so we set end to 00:00 of the *next* day to include today's daily rows.
function todayWindow(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0))
  const end = new Date(start.getTime() + 24 * 3600 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

// Pull a string array out of an unknown payload key, defensively.
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x) => typeof x === 'string' && x.length > 0).map((x) => String(x))
}

function shapeInsight(type: InsightCard['type'], title: string, raw: unknown): InsightCard | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  return {
    id: String(r['output_id'] ?? `${type}-${Date.now()}`),
    type,
    title,
    summary: String(r['summary'] ?? '').slice(0, 800),
    findings: asStringArray(r['key_findings']).slice(0, 6),
    recommendations: asStringArray(r['recommendations']).slice(0, 6),
    generated_at: String(r['generated_at'] ?? r['created_at'] ?? new Date().toISOString()),
  }
}

async function fetchData(): Promise<void> {
  loading.value = true
  lastError.value = null

  try {
    // Pull cached + persisted alerts in parallel with the three insight endpoints.
    // The insight POSTs are what populate the cache that getInsightLatest() reads,
    // so we trigger them explicitly for today's window. Each call returns LLM-
    // narrated content with key_findings + recommendations from real Trino data.
    const { start, end } = todayWindow()
    const body = { start_ts: start, end_ts: end, timezone: 'UTC' }

    const [energy, anomaly, city, _alerts] = await Promise.all([
      postInsightEnergySummary(body.start_ts, body.end_ts),
      postInsightAnomalyReport(body.start_ts, body.end_ts),
      postInsightCityStatus(body.start_ts, body.end_ts),
      notifications.loadFromApi(),
    ])

    const cards: InsightCard[] = []
    const e = shapeInsight('energy-summary', 'Energy Summary',  energy);  if (e) cards.push(e)
    const a = shapeInsight('anomaly-report', 'Anomaly Report',  anomaly); if (a) cards.push(a)
    const c = shapeInsight('city-status',    'City Status',     city);    if (c) cards.push(c)

    if (cards.length === 0) {
      // Fallback to whatever's cached (e.g. from a previous run today)
      const latest = await getInsightLatest()
      const lat = (latest && (latest.latest as Record<string, unknown>)) || {}
      for (const [type, raw] of Object.entries(lat)) {
        const card = shapeInsight(type as InsightCard['type'], type.replace(/-/g, ' '), raw)
        if (card) cards.push(card)
      }
    }

    insights.value = cards
    isLive.value = cards.length > 0
  } catch (err) {
    lastError.value = err instanceof Error ? err.message : 'Failed to load analytics'
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchData())

const totalFindings        = computed(() => insights.value.reduce((n, i) => n + i.findings.length, 0))
const totalRecommendations = computed(() => insights.value.reduce((n, i) => n + i.recommendations.length, 0))
const energyCard           = computed(() => insights.value.find((i) => i.type === 'energy-summary') || null)
const anomalyCard          = computed(() => insights.value.find((i) => i.type === 'anomaly-report') || null)
const cityCard             = computed(() => insights.value.find((i) => i.type === 'city-status')    || null)
const fallbackCount        = computed(() => insights.value.filter((i) => i.summary.startsWith('Fallback insight')).length)

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch { return ts }
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Analytics Overview"
      subtitle="LLM-narrated insights computed from gold-layer Trino aggregates"
      :breadcrumbs="[{ label: 'Analytics' }, { label: 'Overview' }]"
    />

    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span>
      Live — {{ insights.length }} insights generated for today's window
      <span v-if="fallbackCount > 0" class="fallback-tag">
        ({{ fallbackCount }} fallback narration — LLM busy)
      </span>
    </div>

    <div class="view-body">
      <div v-if="loading" class="loading-state">
        <i class="pi pi-spin pi-spinner" style="font-size:1.5rem;color:var(--facis-primary)"></i>
        <span>Generating insights from today's gold-layer data…</span>
      </div>

      <div v-else-if="lastError" class="empty-state">
        <i class="pi pi-exclamation-triangle" style="font-size:2rem;color:#ef4444"></i>
        <p class="empty-title">Could not reach the AI Insight backend</p>
        <p class="empty-sub">{{ lastError }}</p>
      </div>

      <div v-else-if="insights.length === 0" class="empty-state">
        <i class="pi pi-info-circle" style="font-size:2rem;color:#64748b"></i>
        <p class="empty-title">No insights available for the current window</p>
        <p class="empty-sub">The AI Insight flow returned no results — check that today's gold-layer rows exist.</p>
      </div>

      <template v-else>
        <!-- KPI strip — counts derived from the live insight responses -->
        <div class="grid-kpi">
          <KpiCard label="Insights Generated" :value="insights.length"        trend="stable" icon="pi-sparkles"      color="#005fff" />
          <KpiCard label="Key Findings"       :value="totalFindings"          trend="stable" icon="pi-search"        color="#f59e0b" />
          <KpiCard label="Recommendations"    :value="totalRecommendations"   trend="stable" icon="pi-lightbulb"     color="#22c55e" />
          <KpiCard label="Open Alerts"        :value="notifications.openAlerts.length" trend="stable" icon="pi-bell"  color="#ef4444" />
          <KpiCard label="LLM Fallbacks"      :value="fallbackCount"          trend="stable" icon="pi-flag"          color="#8b5cf6" />
          <KpiCard label="Data Source"        value="Trino Gold"              trend="stable" icon="pi-database"      color="#005fff" />
        </div>

        <!-- Three-column: one card per insight type -->
        <div class="three-col">
          <div v-for="card in insights" :key="card.id" class="card insight-card">
            <div class="domain-header" :class="{
              'domain-header--energy': card.type === 'energy-summary',
              'domain-header--anomaly': card.type === 'anomaly-report',
              'domain-header--city': card.type === 'city-status',
            }">
              <div class="domain-icon"><i class="pi" :class="{
                'pi-bolt': card.type === 'energy-summary',
                'pi-exclamation-triangle': card.type === 'anomaly-report',
                'pi-map': card.type === 'city-status',
              }"></i></div>
              <div>
                <div class="domain-title">{{ card.title }}</div>
                <div class="domain-subtitle">{{ formatDate(card.generated_at) }}</div>
              </div>
              <span v-if="card.summary.startsWith('Fallback insight')" class="badge-fallback">FALLBACK</span>
            </div>

            <div class="card-body">
              <p class="card-summary">{{ card.summary || '—' }}</p>

              <div v-if="card.findings.length" class="findings-block">
                <div class="findings-header">
                  <i class="pi pi-search"></i>
                  <span>Findings</span>
                </div>
                <ul class="findings-list">
                  <li v-for="(f, i) in card.findings" :key="i">{{ f }}</li>
                </ul>
              </div>

              <div v-if="card.recommendations.length" class="recs-block">
                <div class="recs-header">
                  <i class="pi pi-lightbulb"></i>
                  <span>Recommendations</span>
                </div>
                <ul class="recs-list">
                  <li v-for="(r, i) in card.recommendations" :key="i">{{ r }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- Recent alerts timeline -->
        <div class="card">
          <div class="card-header">
            <span class="section-title" style="margin-bottom:0">Recent Alerts</span>
            <span class="record-count">{{ notifications.alerts.length }} from /api/v1/alerts</span>
          </div>
          <div v-if="!notifications.alerts.length" class="empty-row">
            <i class="pi pi-check-circle" style="color:var(--facis-success)"></i>
            <span>No alerts in the ring buffer right now.</span>
          </div>
          <div v-else class="recent-list">
            <div v-for="a in notifications.alerts.slice(0, 8)" :key="a.id" class="recent-row">
              <StatusBadge :status="a.severity" size="sm" />
              <div class="insight-info">
                <span class="insight-title">{{ a.message || a.category }}</span>
                <span class="insight-sub">{{ a.useCase }} · {{ a.source }}</span>
              </div>
              <span class="recent-time">{{ formatDate(a.timestamp) }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.live-banner { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #15803d; background: #dcfce7; padding: 0.375rem 1.5rem; border-bottom: 1px solid #bbf7d0; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.fallback-tag { font-weight: 500; color: #78716c; margin-left: 0.5rem; }

.loading-state, .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; padding: 4rem 1rem; color: var(--facis-text-secondary); font-size: 0.875rem; }
.empty-title { font-size: 1rem; font-weight: 600; color: var(--facis-text); margin: 0; }
.empty-sub { font-size: 0.85rem; color: var(--facis-text-secondary); margin: 0; max-width: 480px; text-align: center; }

.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }

.three-col { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
@media (max-width: 1200px) { .three-col { grid-template-columns: 1fr 1fr; } }
@media (max-width: 768px)  { .three-col { grid-template-columns: 1fr; } }

.insight-card { display: flex; flex-direction: column; }
.card-body { padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
.card-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid var(--facis-border); }
.record-count { font-size: 0.75rem; font-weight: 500; color: var(--facis-text-secondary); }

.card-summary { margin: 0; font-size: 0.85rem; line-height: 1.55; color: var(--facis-text); }

.domain-header { display: flex; align-items: center; gap: 0.875rem; padding: 1rem 1.25rem; border-bottom: 1px solid var(--facis-border); position: relative; }
.domain-header--energy  .domain-icon { background: #fef3c7; color: #92400e; }
.domain-header--anomaly .domain-icon { background: #fee2e2; color: #b91c1c; }
.domain-header--city    .domain-icon { background: #f3e8ff; color: #7c3aed; }
.domain-icon { width: 36px; height: 36px; border-radius: var(--facis-radius-sm); display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; }
.domain-title { font-size: 0.9rem; font-weight: 600; color: var(--facis-text); text-transform: capitalize; }
.domain-subtitle { font-size: 0.72rem; color: var(--facis-text-secondary); }

.badge-fallback { position: absolute; right: 1.25rem; top: 1rem; font-size: 0.65rem; font-weight: 700; background: #fef3c7; color: #92400e; padding: 0.15rem 0.5rem; border-radius: 4px; }

.findings-header, .recs-header { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: var(--facis-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.4rem; }
.findings-header i, .recs-header i { color: var(--facis-primary); }
.findings-list, .recs-list { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.4rem; }
.findings-list li, .recs-list li { font-size: 0.82rem; line-height: 1.5; color: var(--facis-text-secondary); }
.findings-block, .recs-block { background: var(--facis-surface-2, #f8fafc); border-radius: 6px; padding: 0.75rem 0.875rem; }

.recent-list { display: flex; flex-direction: column; }
.recent-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 1.25rem; border-bottom: 1px solid var(--facis-border); }
.recent-row:last-child { border-bottom: none; }
.insight-info { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
.insight-title { font-size: 0.82rem; font-weight: 500; color: var(--facis-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.insight-sub { font-size: 0.72rem; color: var(--facis-text-secondary); }
.recent-time { font-size: 0.72rem; color: var(--facis-text-muted); flex-shrink: 0; min-width: 110px; text-align: right; }
.empty-row { display: flex; align-items: center; gap: 0.5rem; padding: 1.25rem; color: var(--facis-text-secondary); font-size: 0.85rem; }
</style>
