<script setup lang="ts">
import type { KpiItem } from '@/data/types'

const props = withDefaults(defineProps<{
  label: string
  value: string | number
  unit?: string
  trend?: KpiItem['trend']
  trendValue?: string
  icon?: string
  color?: string
  loading?: boolean
}>(), {
  unit: '',
  trend: 'stable',
  icon: 'pi-chart-line',
  color: '#3b82f6',
  loading: false
})
</script>

<template>
  <div class="kpi-card">
    <div class="kpi-card__header">
      <div class="kpi-card__icon" :style="{ background: `${color}18`, color: color }">
        <i :class="`pi ${icon}`"></i>
      </div>
      <div v-if="!loading && trend !== 'stable'" class="kpi-card__trend" :class="`kpi-card__trend--${trend}`">
        <i :class="trend === 'up' ? 'pi pi-arrow-up' : 'pi pi-arrow-down'"></i>
        <span v-if="trendValue">{{ trendValue }}</span>
      </div>
    </div>

    <div class="kpi-card__body">
      <template v-if="loading">
        <div class="kpi-card__skeleton kpi-card__skeleton--value"></div>
        <div class="kpi-card__skeleton kpi-card__skeleton--label"></div>
      </template>
      <template v-else>
        <div class="kpi-card__value">
          <span class="kpi-card__number">{{ value }}</span>
          <span v-if="unit" class="kpi-card__unit">{{ unit }}</span>
        </div>
        <div class="kpi-card__label">{{ label }}</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.kpi-card {
  background: var(--facis-surface);
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  box-shadow: var(--facis-shadow);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  transition: box-shadow 0.15s ease;
}

.kpi-card:hover {
  box-shadow: var(--facis-shadow-md);
}

.kpi-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.kpi-card__icon {
  width: 40px;
  height: 40px;
  border-radius: var(--facis-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.kpi-card__trend {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 20px;
}

.kpi-card__trend--up {
  color: var(--facis-success);
  background: var(--facis-success-light);
}

.kpi-card__trend--down {
  color: var(--facis-error);
  background: var(--facis-error-light);
}

.kpi-card__body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.kpi-card__value {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}

.kpi-card__number {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--facis-text);
  line-height: 1;
  letter-spacing: -0.02em;
}

.kpi-card__unit {
  font-size: 0.857rem;
  font-weight: 500;
  color: var(--facis-text-secondary);
}

.kpi-card__label {
  font-size: 0.786rem;
  font-weight: 500;
  color: var(--facis-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.kpi-card__skeleton {
  border-radius: 4px;
  background: linear-gradient(90deg, var(--facis-border) 25%, var(--facis-surface-2) 50%, var(--facis-border) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

.kpi-card__skeleton--value {
  height: 28px;
  width: 70%;
  margin-bottom: 0.5rem;
}

.kpi-card__skeleton--label {
  height: 12px;
  width: 55%;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
