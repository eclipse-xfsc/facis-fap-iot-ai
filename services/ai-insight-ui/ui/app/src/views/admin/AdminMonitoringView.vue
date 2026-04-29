<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import TimeSeriesChart from '@/components/common/TimeSeriesChart.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { getSimHealth, getAiHealth, type SimHealth, type AiHealth } from '@/services/api'

interface BackgroundJob {
  id: string
  name: string
  status: 'running' | 'completed' | 'failed' | 'queued'
  startedAt: string
  duration: number | null
  progress?: number
  triggeredBy: string
}

const jobs: BackgroundJob[] = [
  { id: 'job-001', name: 'Meter ingestion pipeline',       status: 'completed', startedAt: new Date(Date.now() - 120_000).toISOString(),    duration: 47,   triggeredBy: 'scheduler' },
  { id: 'job-002', name: 'PV systems ingestion pipeline',  status: 'completed', startedAt: new Date(Date.now() - 300_000).toISOString(),    duration: 31,   triggeredBy: 'scheduler' },
  { id: 'job-003', name: 'Schema validation run',          status: 'running',   startedAt: new Date(Date.now() - 60_000).toISOString(),     duration: null, progress: 62, triggeredBy: 'scheduler' },
  { id: 'job-004', name: 'Data product refresh — Energy',  status: 'completed', startedAt: new Date(Date.now() - 900_000).toISOString(),    duration: 88,   triggeredBy: 'scheduler' },
  { id: 'job-005', name: 'Audit log flush to storage',     status: 'completed', startedAt: new Date(Date.now() - 1_800_000).toISOString(),  duration: 5,    triggeredBy: 'system' },
  { id: 'job-006', name: 'Streetlight ingestion pipeline', status: 'failed',    startedAt: new Date(Date.now() - 3_600_000).toISOString(),  duration: 12,   triggeredBy: 'scheduler' },
  { id: 'job-007', name: 'Traffic zone ingestion pipeline',status: 'completed', startedAt: new Date(Date.now() - 5_400_000).toISOString(),  duration: 28,   triggeredBy: 'scheduler' },
  { id: 'job-008', name: 'Nightly cleanup job',            status: 'queued',    startedAt: new Date(Date.now() + 3_600_000).toISOString(),  duration: null, triggeredBy: 'scheduler' }
]

// Live service health
const simHealth = ref<SimHealth | null>(null)
const aiHealth = ref<AiHealth | null>(null)

async function fetchHealth(): Promise<void> {
  const [sh, ah] = await Promise.all([getSimHealth(), getAiHealth()])
  simHealth.value = sh
  aiHealth.value = ah
}

onMounted(fetchHealth)

// System health values (static — no direct API for host metrics)
const systemHealth = {
  cpu:     34,
  memory:  58,
  disk:    42,
  uptimeDays: 12
}

// 24h hourly labels
const hourLabels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

// Pipeline execution runs per hour (static — no pipeline metrics API)
const pipelineRuns = hourLabels.map((_, i) => {
  const base = (i >= 6 && i <= 22) ? 4 : 2
  return base + Math.floor(Math.random() * 3)
})

// Resource usage
const cpuData    = hourLabels.map(() => Math.round(20 + Math.random() * 30))
const memData    = hourLabels.map(() => Math.round(50 + Math.random() * 20))
const diskIo     = hourLabels.map(() => Math.round(10 + Math.random() * 40))

const chartDatasets = computed(() => [
  {
    label: 'CPU (%)',
    data: cpuData,
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59,130,246,0.06)',
    fill: true,
    tension: 0.4
  },
  {
    label: 'Memory (%)',
    data: memData,
    borderColor: '#8b5cf6',
    backgroundColor: 'rgba(139,92,246,0.06)',
    fill: true,
    tension: 0.4
  },
  {
    label: 'Disk I/O (MB/s)',
    data: diskIo,
    borderColor: '#f59e0b',
    tension: 0.4
  }
])

const pipelineDatasets = computed(() => [
  {
    label: 'Pipeline Runs',
    data: pipelineRuns,
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34,197,94,0.08)',
    fill: true,
    tension: 0.4
  }
])

// Module warnings summary — first two use real service health when available
const moduleAlerts = computed(() => {
  const simOk = simHealth.value?.status === 'ok'
  const aiOk = aiHealth.value?.status === 'ok'
  const simChecked = simHealth.value !== null
  const aiChecked = aiHealth.value !== null

  return [
    {
      module: `Simulation API${simChecked ? ` (${simHealth.value?.version ?? ''})` : ''}`,
      warnings: simChecked && !simOk ? 1 : 0,
      errors: 0,
      color: simChecked ? (simOk ? '#22c55e' : '#f59e0b') : '#94a3b8'
    },
    {
      module: `AI Insight API${aiChecked ? ` (${aiHealth.value?.service ?? ''})` : ''}`,
      warnings: aiChecked && !aiOk ? 1 : 0,
      errors: 0,
      color: aiChecked ? (aiOk ? '#22c55e' : '#f59e0b') : '#94a3b8'
    },
    { module: 'Integrations',     warnings: 1, errors: 1, color: '#ef4444' },
    { module: 'Schema & Mapping', warnings: 1, errors: 0, color: '#f59e0b' },
    { module: 'Data Products',    warnings: 0, errors: 0, color: '#22c55e' },
    { module: 'Analytics',        warnings: 0, errors: 0, color: '#22c55e' },
    { module: 'Alerts',           warnings: 2, errors: 0, color: '#f59e0b' }
  ]
})

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit'
  })
}

const JOB_STATUS_CONFIG: Record<BackgroundJob['status'], { color: string; bg: string; icon: string }> = {
  completed: { color: '#15803d', bg: '#dcfce7', icon: 'pi-check-circle' },
  running:   { color: '#1d4ed8', bg: '#dbeafe', icon: 'pi-spin pi-spinner' },
  failed:    { color: '#991b1b', bg: '#fee2e2', icon: 'pi-times-circle' },
  queued:    { color: '#64748b', bg: '#f1f5f9', icon: 'pi-clock' }
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="System Monitoring"
      subtitle="Platform performance, resource utilisation, background jobs, and health summary"
      :breadcrumbs="[{ label: 'Administration' }, { label: 'Monitoring' }]"
    />

    <div class="view-body">
      <!-- Health KPIs -->
      <div class="grid-kpi">
        <KpiCard
          label="CPU Usage"
          :value="systemHealth.cpu"
          unit="%"
          :trend="systemHealth.cpu > 70 ? 'up' : 'stable'"
          icon="pi-server"
          color="#3b82f6"
        />
        <KpiCard
          label="Memory Usage"
          :value="systemHealth.memory"
          unit="%"
          :trend="systemHealth.memory > 80 ? 'up' : 'stable'"
          icon="pi-database"
          color="#8b5cf6"
        />
        <KpiCard
          label="Disk Usage"
          :value="systemHealth.disk"
          unit="%"
          trend="stable"
          icon="pi-hdd"
          color="#f59e0b"
        />
        <KpiCard
          label="Uptime"
          :value="systemHealth.uptimeDays"
          unit="days"
          trend="up"
          icon="pi-check-circle"
          color="#22c55e"
        />
      </div>

      <!-- Resource usage chart -->
      <div class="card card-body">
        <div class="section-label">Resource Usage — Last 24h</div>
        <TimeSeriesChart
          :datasets="chartDatasets"
          :labels="hourLabels"
          y-axis-label="Usage (%)"
          :height="260"
        />
      </div>

      <!-- Pipeline execution chart -->
      <div class="card card-body">
        <div class="section-label">Pipeline Execution Runs — Last 24h</div>
        <TimeSeriesChart
          :datasets="pipelineDatasets"
          :labels="hourLabels"
          y-axis-label="Runs / hour"
          :height="200"
        />
      </div>

      <!-- Bottom row: jobs + module alerts -->
      <div class="two-col">
        <!-- Background jobs -->
        <div class="card card-body">
          <div class="section-label">Recent Background Jobs</div>
          <div class="jobs-list">
            <div v-for="job in jobs" :key="job.id" class="job-row">
              <div class="job-left">
                <div
                  class="job-status-icon"
                  :style="{ background: JOB_STATUS_CONFIG[job.status].bg, color: JOB_STATUS_CONFIG[job.status].color }"
                >
                  <i :class="`pi ${JOB_STATUS_CONFIG[job.status].icon}`"></i>
                </div>
                <div class="job-info">
                  <span class="job-name">{{ job.name }}</span>
                  <span class="job-trigger">{{ job.triggeredBy }}</span>
                </div>
              </div>
              <div class="job-right">
                <div class="jr-duration">{{ formatDuration(job.duration) }}</div>
                <div class="jr-time">{{ formatDate(job.startedAt) }}</div>
                <div v-if="job.progress !== undefined && job.status === 'running'" class="jr-progress-bar">
                  <div class="jr-progress-fill" :style="{ width: `${job.progress}%` }"></div>
                  <span class="jr-pct">{{ job.progress }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Module health summary -->
        <div class="card card-body">
          <div class="section-label">Module Health Summary</div>
          <div class="module-health-list">
            <div v-for="mod in moduleAlerts" :key="mod.module" class="mhl-row">
              <div class="mhl-indicator" :style="{ background: mod.color }"></div>
              <span class="mhl-module">{{ mod.module }}</span>
              <div class="mhl-badges">
                <span v-if="mod.errors > 0" class="mhl-badge mhl-badge--error">
                  <i class="pi pi-times-circle"></i> {{ mod.errors }} error{{ mod.errors !== 1 ? 's' : '' }}
                </span>
                <span v-if="mod.warnings > 0" class="mhl-badge mhl-badge--warn">
                  <i class="pi pi-exclamation-triangle"></i> {{ mod.warnings }} warning{{ mod.warnings !== 1 ? 's' : '' }}
                </span>
                <span v-if="mod.warnings === 0 && mod.errors === 0" class="mhl-badge mhl-badge--ok">
                  <i class="pi pi-check-circle"></i> Healthy
                </span>
              </div>
            </div>
          </div>

          <div class="platform-info">
            <div class="pi-label">Platform Info</div>
            <div class="pi-grid">
              <span class="pig-label">Version</span><span class="pig-val">1.4.0</span>
              <span class="pig-label">Build</span><span class="pig-val font-mono">2026.04.05.1</span>
              <span class="pig-label">Node.js</span><span class="pig-val">v20.12.0</span>
              <span class="pig-label">Environment</span><span class="pig-val"><StatusBadge status="active" size="sm" /></span>
            </div>
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

.section-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--facis-text);
  margin-bottom: 1rem;
}

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

@media (max-width: 1000px) {
  .two-col { grid-template-columns: 1fr; }
}

/* Jobs */
.jobs-list { display: flex; flex-direction: column; gap: 0; }

.job-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.875rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--facis-border);
}

.job-row:last-child { border-bottom: none; }

.job-left {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  flex: 1;
}

.job-status-icon {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  flex-shrink: 0;
}

.job-info { display: flex; flex-direction: column; gap: 0.1rem; }

.job-name {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--facis-text);
  line-height: 1.3;
}

.job-trigger {
  font-size: 0.714rem;
  color: var(--facis-text-muted);
}

.job-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.2rem;
  flex-shrink: 0;
  min-width: 120px;
}

.jr-duration {
  font-size: 0.786rem;
  font-weight: 500;
  color: var(--facis-text);
}

.jr-time {
  font-size: 0.714rem;
  color: var(--facis-text-muted);
}

.jr-progress-bar {
  width: 100%;
  height: 6px;
  background: var(--facis-surface-2);
  border-radius: 20px;
  overflow: visible;
  position: relative;
  margin-top: 0.25rem;
}

.jr-progress-fill {
  height: 100%;
  background: var(--facis-primary);
  border-radius: 20px;
  transition: width 0.4s ease;
}

.jr-pct {
  font-size: 0.7rem;
  color: var(--facis-primary);
  margin-top: 2px;
  display: block;
  text-align: right;
}

/* Module health */
.module-health-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 1.5rem;
}

.mhl-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0;
  border-bottom: 1px solid var(--facis-border);
}

.mhl-row:last-child { border-bottom: none; }

.mhl-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.mhl-module {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--facis-text);
  flex: 1;
}

.mhl-badges {
  display: flex;
  gap: 0.375rem;
}

.mhl-badge {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.714rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 20px;
}

.mhl-badge--error { background: var(--facis-error-light); color: #991b1b; }
.mhl-badge--warn  { background: var(--facis-warning-light); color: #92400e; }
.mhl-badge--ok    { background: var(--facis-success-light); color: #15803d; }

/* Platform info */
.platform-info {
  border-top: 1px solid var(--facis-border);
  padding-top: 1rem;
}

.pi-label {
  font-size: 0.786rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--facis-text-secondary);
  margin-bottom: 0.75rem;
}

.pi-grid {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 0.5rem 1rem;
  align-items: center;
}

.pig-label {
  font-size: 0.786rem;
  color: var(--facis-text-muted);
}

.pig-val {
  font-size: 0.875rem;
  color: var(--facis-text);
}

.font-mono { font-family: var(--facis-font-mono); font-size: 0.786rem !important; }
</style>
