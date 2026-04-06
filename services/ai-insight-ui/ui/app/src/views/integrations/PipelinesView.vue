<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import PipelineFlow from '@/components/common/PipelineFlow.vue'
import type { PipelineStep } from '@/components/common/PipelineFlow.vue'

interface PipelineStepDetail extends PipelineStep {
  throughput: string
  lastSuccess: string
  warnings: number
}

const now = new Date()
function ts(minutesAgo: number): string {
  return new Date(now.getTime() - minutesAgo * 60_000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

const energySteps: PipelineStep[] = [
  { label: 'Source', icon: 'pi-database', status: 'healthy', detail: 'MQTT/Modbus' },
  { label: 'Ingestion', icon: 'pi-arrow-right-arrow-left', status: 'healthy', detail: 'Node-RED' },
  { label: 'Harmonization', icon: 'pi-sitemap', status: 'healthy', detail: 'Schema v2' },
  { label: 'Aggregation', icon: 'pi-objects-column', status: 'healthy', detail: '15-min intervals' },
  { label: 'Analytics', icon: 'pi-chart-bar', status: 'healthy', detail: 'AI Service' },
  { label: 'Data Product', icon: 'pi-box', status: 'healthy', detail: 'Published' }
]

const energyDetails: PipelineStepDetail[] = [
  { ...energySteps[0], throughput: '1,240 msg/min', lastSuccess: ts(1), warnings: 0 },
  { ...energySteps[1], throughput: '1,240 msg/min', lastSuccess: ts(1), warnings: 0 },
  { ...energySteps[2], throughput: '1,238 msg/min', lastSuccess: ts(1), warnings: 2 },
  { ...energySteps[3], throughput: '96 records/min', lastSuccess: ts(2), warnings: 0 },
  { ...energySteps[4], throughput: '3 analyses/hr', lastSuccess: ts(15), warnings: 0 },
  { ...energySteps[5], throughput: 'v2.1.0 live', lastSuccess: ts(5), warnings: 0 }
]

const citySteps: PipelineStep[] = [
  { label: 'Source', icon: 'pi-database', status: 'healthy', detail: 'DALI/Zigbee' },
  { label: 'Ingestion', icon: 'pi-arrow-right-arrow-left', status: 'healthy', detail: 'Node-RED' },
  { label: 'Harmonization', icon: 'pi-sitemap', status: 'warning', detail: 'Partial schema' },
  { label: 'Aggregation', icon: 'pi-objects-column', status: 'healthy', detail: 'Zone level' },
  { label: 'Analytics', icon: 'pi-chart-bar', status: 'healthy', detail: 'Running' },
  { label: 'Data Product', icon: 'pi-box', status: 'healthy', detail: 'Published' }
]

const cityDetails: PipelineStepDetail[] = [
  { ...citySteps[0], throughput: '2,880 msg/min', lastSuccess: ts(0), warnings: 0 },
  { ...citySteps[1], throughput: '2,880 msg/min', lastSuccess: ts(0), warnings: 0 },
  { ...citySteps[2], throughput: '2,824 msg/min', lastSuccess: ts(2), warnings: 8 },
  { ...citySteps[3], throughput: '7 zones synced', lastSuccess: ts(2), warnings: 0 },
  { ...citySteps[4], throughput: '2 analyses/hr', lastSuccess: ts(25), warnings: 0 },
  { ...citySteps[5], throughput: 'v1.0.1 live', lastSuccess: ts(3), warnings: 0 }
]

const STATUS_COLORS: Record<string, string> = {
  healthy: '#22c55e',
  warning: '#f59e0b',
  error:   '#ef4444',
  inactive: '#94a3b8'
}

const PIPELINE_STATS = {
  energy: { runsToday: 96, avgDuration: '47s', successRate: '100%', lastRun: ts(5) },
  city:   { runsToday: 144, avgDuration: '23s', successRate: '98.6%', lastRun: ts(3) }
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Pipelines"
      subtitle="End-to-end data pipeline status, throughput, and step health"
      :breadcrumbs="[{ label: 'Integrations' }, { label: 'Pipelines' }]"
    />

    <div class="view-body">
      <!-- Energy Pipeline -->
      <div class="pipeline-section card card-body">
        <div class="pipeline-header">
          <div class="pipeline-title-group">
            <div class="pipeline-dot" :style="{ background: STATUS_COLORS['healthy'] }"></div>
            <h3 class="pipeline-title">Smart Energy Pipeline</h3>
            <span class="pipeline-badge pipeline-badge--healthy">Healthy</span>
          </div>
          <div class="pipeline-stats">
            <div class="ps-item"><span class="ps-label">Runs today</span><strong>{{ PIPELINE_STATS.energy.runsToday }}</strong></div>
            <div class="ps-item"><span class="ps-label">Avg duration</span><strong>{{ PIPELINE_STATS.energy.avgDuration }}</strong></div>
            <div class="ps-item"><span class="ps-label">Success rate</span><strong class="ps-green">{{ PIPELINE_STATS.energy.successRate }}</strong></div>
            <div class="ps-item"><span class="ps-label">Last run</span><strong>{{ PIPELINE_STATS.energy.lastRun }}</strong></div>
          </div>
        </div>

        <PipelineFlow :steps="energySteps" />

        <div class="step-details-grid">
          <div v-for="(step, idx) in energyDetails" :key="idx" class="step-detail-card">
            <div class="sdc-name">{{ step.label }}</div>
            <div class="sdc-throughput">{{ step.throughput }}</div>
            <div class="sdc-row">
              <span class="sdc-label">Last OK</span>
              <span class="sdc-value">{{ step.lastSuccess }}</span>
            </div>
            <div v-if="step.warnings > 0" class="sdc-warnings">
              <i class="pi pi-exclamation-triangle"></i> {{ step.warnings }} warning{{ step.warnings !== 1 ? 's' : '' }}
            </div>
          </div>
        </div>
      </div>

      <!-- Smart City Pipeline -->
      <div class="pipeline-section card card-body">
        <div class="pipeline-header">
          <div class="pipeline-title-group">
            <div class="pipeline-dot" :style="{ background: STATUS_COLORS['warning'] }"></div>
            <h3 class="pipeline-title">Smart City Pipeline</h3>
            <span class="pipeline-badge pipeline-badge--warning">1 Warning</span>
          </div>
          <div class="pipeline-stats">
            <div class="ps-item"><span class="ps-label">Runs today</span><strong>{{ PIPELINE_STATS.city.runsToday }}</strong></div>
            <div class="ps-item"><span class="ps-label">Avg duration</span><strong>{{ PIPELINE_STATS.city.avgDuration }}</strong></div>
            <div class="ps-item"><span class="ps-label">Success rate</span><strong class="ps-orange">{{ PIPELINE_STATS.city.successRate }}</strong></div>
            <div class="ps-item"><span class="ps-label">Last run</span><strong>{{ PIPELINE_STATS.city.lastRun }}</strong></div>
          </div>
        </div>

        <PipelineFlow :steps="citySteps" />

        <div class="step-details-grid">
          <div v-for="(step, idx) in cityDetails" :key="idx" class="step-detail-card" :class="{ 'step-detail-card--warning': step.status === 'warning' }">
            <div class="sdc-name">{{ step.label }}</div>
            <div class="sdc-throughput">{{ step.throughput }}</div>
            <div class="sdc-row">
              <span class="sdc-label">Last OK</span>
              <span class="sdc-value">{{ step.lastSuccess }}</span>
            </div>
            <div v-if="step.warnings > 0" class="sdc-warnings">
              <i class="pi pi-exclamation-triangle"></i> {{ step.warnings }} warning{{ step.warnings !== 1 ? 's' : '' }}
            </div>
          </div>
        </div>

        <div class="pipeline-notice">
          <i class="pi pi-exclamation-triangle"></i>
          <span><strong>Harmonization step:</strong> TrafficFlow_v1_draft schema partially mapped. 8 events per minute skip validation. Non-critical — data still passes through with warnings.</span>
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

.pipeline-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.pipeline-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.pipeline-title-group {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.pipeline-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pipeline-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--facis-text);
}

.pipeline-badge {
  font-size: 0.714rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 20px;
}

.pipeline-badge--healthy {
  background: var(--facis-success-light);
  color: #15803d;
}

.pipeline-badge--warning {
  background: var(--facis-warning-light);
  color: #92400e;
}

.pipeline-stats {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.ps-item {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  align-items: center;
}

.ps-label {
  font-size: 0.714rem;
  color: var(--facis-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ps-item strong {
  font-size: 0.9rem;
  color: var(--facis-text);
}

.ps-green { color: var(--facis-success) !important; }
.ps-orange { color: var(--facis-warning) !important; }

.step-details-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0.75rem;
}

@media (max-width: 1200px) {
  .step-details-grid { grid-template-columns: repeat(3, 1fr); }
}

.step-detail-card {
  background: var(--facis-surface-2);
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius-sm);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.step-detail-card--warning {
  border-color: var(--facis-warning);
  background: #fffbeb;
}

.sdc-name {
  font-size: 0.786rem;
  font-weight: 600;
  color: var(--facis-text);
}

.sdc-throughput {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--facis-primary);
}

.sdc-row {
  display: flex;
  gap: 0.375rem;
  align-items: center;
}

.sdc-label {
  font-size: 0.7rem;
  color: var(--facis-text-muted);
}

.sdc-value {
  font-size: 0.75rem;
  color: var(--facis-text-secondary);
}

.sdc-warnings {
  font-size: 0.714rem;
  color: #92400e;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.2rem;
}

.pipeline-notice {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  background: var(--facis-warning-light);
  border: 1px solid #fde68a;
  border-radius: var(--facis-radius-sm);
  padding: 0.75rem 1rem;
  font-size: 0.8rem;
  color: #92400e;
  line-height: 1.5;
}

.pipeline-notice .pi {
  flex-shrink: 0;
  margin-top: 0.1rem;
}
</style>
