<script setup lang="ts">
export interface PipelineStep {
  label: string
  icon: string
  status: 'healthy' | 'warning' | 'error' | 'inactive'
  detail?: string
}

const props = withDefaults(defineProps<{
  steps?: PipelineStep[]
}>(), {
  steps: () => [
    { label: 'Source', icon: 'pi-database', status: 'healthy', detail: 'Ingesting' },
    { label: 'Ingestion', icon: 'pi-arrow-right-arrow-left', status: 'healthy', detail: 'MQTT/Modbus' },
    { label: 'Harmonization', icon: 'pi-sitemap', status: 'healthy', detail: 'Schema mapped' },
    { label: 'Aggregation', icon: 'pi-objects-column', status: 'warning', detail: 'Backpressure' },
    { label: 'Analytics', icon: 'pi-chart-bar', status: 'healthy', detail: 'AI running' },
    { label: 'Data Product', icon: 'pi-box', status: 'healthy', detail: 'Published' }
  ]
})

const STATUS_COLORS: Record<PipelineStep['status'], string> = {
  healthy:  '#22c55e',
  warning:  '#f59e0b',
  error:    '#ef4444',
  inactive: '#94a3b8'
}
</script>

<template>
  <div class="pipeline-flow">
    <div
      v-for="(step, idx) in steps"
      :key="idx"
      class="pipeline-step"
    >
      <div class="pipeline-step__box">
        <div class="pipeline-step__status-dot" :style="{ background: STATUS_COLORS[step.status] }"></div>
        <div class="pipeline-step__icon">
          <i :class="`pi ${step.icon}`"></i>
        </div>
        <div class="pipeline-step__label">{{ step.label }}</div>
        <div v-if="step.detail" class="pipeline-step__detail">{{ step.detail }}</div>
      </div>
      <div v-if="idx < steps.length - 1" class="pipeline-connector">
        <svg width="32" height="2" viewBox="0 0 32 2" fill="none">
          <line x1="0" y1="1" x2="32" y2="1" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4 3"/>
        </svg>
        <i class="pi pi-chevron-right pipeline-connector__arrow"></i>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pipeline-flow {
  display: flex;
  align-items: center;
  gap: 0;
  overflow-x: auto;
  padding: 0.5rem 0;
}

.pipeline-step {
  display: flex;
  align-items: center;
  gap: 0;
}

.pipeline-step__box {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  padding: 1rem 1.25rem;
  background: var(--facis-surface);
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  min-width: 100px;
  transition: box-shadow 0.15s;
}

.pipeline-step__box:hover {
  box-shadow: var(--facis-shadow-md);
}

.pipeline-step__status-dot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.pipeline-step__icon {
  font-size: 1.5rem;
  color: var(--facis-primary);
}

.pipeline-step__label {
  font-size: 0.786rem;
  font-weight: 600;
  color: var(--facis-text);
  text-align: center;
}

.pipeline-step__detail {
  font-size: 0.7rem;
  color: var(--facis-text-secondary);
  text-align: center;
}

.pipeline-connector {
  display: flex;
  align-items: center;
  gap: 0;
  color: var(--facis-text-muted);
  flex-shrink: 0;
  padding: 0 2px;
}

.pipeline-connector__arrow {
  font-size: 0.65rem;
  margin-left: -4px;
}
</style>
