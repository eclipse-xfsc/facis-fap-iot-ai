<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions
} from 'chart.js'
import type { ChartDataset } from '@/data/types'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const props = withDefaults(defineProps<{
  datasets: ChartDataset[]
  labels: string[]
  yAxisLabel?: string
  y2AxisLabel?: string
  height?: number
  title?: string
}>(), {
  height: 300,
  yAxisLabel: '',
  y2AxisLabel: ''
})

const hasSecondAxis = computed(() => props.datasets.some(d => d.yAxisID === 'y2'))

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.datasets.map(d => ({
    label: d.label,
    data: d.data,
    borderColor: d.borderColor ?? '#005fff',
    backgroundColor: d.backgroundColor ?? 'transparent',
    yAxisID: d.yAxisID ?? 'y',
    fill: d.fill ?? false,
    tension: d.tension ?? 0.4,
    borderWidth: 2,
    pointRadius: props.labels.length > 48 ? 0 : 3,
    pointHoverRadius: 5
  }))
}))

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false
  },
  plugins: {
    legend: {
      position: 'top',
      labels: {
        font: { family: 'Inter', size: 12 },
        usePointStyle: true,
        pointStyleWidth: 10,
        boxHeight: 8,
        padding: 16
      }
    },
    title: props.title ? {
      display: true,
      text: props.title,
      font: { family: 'Inter', size: 13, weight: '600' },
      padding: { bottom: 12 }
    } : { display: false },
    tooltip: {
      backgroundColor: 'rgba(15,23,42,0.92)',
      titleFont: { family: 'Inter', size: 12 },
      bodyFont: { family: 'Inter', size: 12 },
      padding: 10,
      cornerRadius: 6
    }
  },
  scales: {
    x: {
      grid: { color: 'rgba(226,232,240,0.6)' },
      ticks: {
        font: { family: 'Inter', size: 11 },
        color: '#94a3b8',
        maxTicksLimit: 12
      }
    },
    y: {
      position: 'left',
      grid: { color: 'rgba(226,232,240,0.6)' },
      ticks: {
        font: { family: 'Inter', size: 11 },
        color: '#94a3b8'
      },
      title: props.yAxisLabel ? {
        display: true,
        text: props.yAxisLabel,
        font: { family: 'Inter', size: 11 },
        color: '#64748b'
      } : { display: false }
    },
    ...(hasSecondAxis.value ? {
      y2: {
        position: 'right' as const,
        grid: { drawOnChartArea: false },
        ticks: {
          font: { family: 'Inter', size: 11 },
          color: '#94a3b8'
        },
        title: props.y2AxisLabel ? {
          display: true,
          text: props.y2AxisLabel,
          font: { family: 'Inter', size: 11 },
          color: '#64748b'
        } : { display: false }
      }
    } : {})
  }
}))
</script>

<template>
  <div class="ts-chart" :style="{ height: `${height}px` }">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>

<style scoped>
.ts-chart {
  width: 100%;
  position: relative;
}
</style>
