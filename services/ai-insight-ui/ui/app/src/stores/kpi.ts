import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { KpiItem } from '@/data/types'

export const useKpiStore = defineStore('kpi', () => {
  const energyKpis = ref<KpiItem[]>([
    {
      label: 'Total Active Power',
      value: 847.3,
      unit: 'kW',
      trend: 'up',
      trendValue: '+4.2%',
      icon: 'pi-bolt',
      color: '#f59e0b'
    },
    {
      label: 'Energy Today',
      value: '12,841',
      unit: 'kWh',
      trend: 'down',
      trendValue: '-2.1%',
      icon: 'pi-chart-line',
      color: '#3b82f6'
    },
    {
      label: 'PV Generation',
      value: 234.7,
      unit: 'kW',
      trend: 'up',
      trendValue: '+18.5%',
      icon: 'pi-sun',
      color: '#22c55e'
    },
    {
      label: 'Avg Power Factor',
      value: 0.94,
      unit: 'pf',
      trend: 'stable',
      trendValue: '0.00',
      icon: 'pi-sliders-h',
      color: '#8b5cf6'
    },
    {
      label: 'Active Meters',
      value: 24,
      unit: '',
      trend: 'stable',
      trendValue: '',
      icon: 'pi-gauge',
      color: '#64748b'
    },
    {
      label: 'Data Quality',
      value: 98.7,
      unit: '%',
      trend: 'up',
      trendValue: '+0.3%',
      icon: 'pi-check-circle',
      color: '#22c55e'
    }
  ])

  const smartCityKpis = ref<KpiItem[]>([
    {
      label: 'Active Luminaires',
      value: 1248,
      unit: '',
      trend: 'stable',
      trendValue: '',
      icon: 'pi-lightbulb',
      color: '#f59e0b'
    },
    {
      label: 'Avg Dimming Level',
      value: 62,
      unit: '%',
      trend: 'down',
      trendValue: '-8%',
      icon: 'pi-sliders-v',
      color: '#3b82f6'
    },
    {
      label: 'Active Zones',
      value: 14,
      unit: '',
      trend: 'stable',
      trendValue: '',
      icon: 'pi-map',
      color: '#22c55e'
    },
    {
      label: 'Fault Rate',
      value: 1.2,
      unit: '%',
      trend: 'down',
      trendValue: '-0.4%',
      icon: 'pi-exclamation-triangle',
      color: '#ef4444'
    },
    {
      label: 'Energy Saved',
      value: 34.8,
      unit: '%',
      trend: 'up',
      trendValue: '+2.1%',
      icon: 'pi-leaf',
      color: '#22c55e'
    },
    {
      label: 'Motion Events / hr',
      value: 312,
      unit: '/hr',
      trend: 'up',
      trendValue: '+12%',
      icon: 'pi-user',
      color: '#8b5cf6'
    }
  ])

  const platformKpis = ref<KpiItem[]>([
    {
      label: 'Connected Sources',
      value: 38,
      unit: '',
      trend: 'stable',
      trendValue: '',
      icon: 'pi-database',
      color: '#3b82f6'
    },
    {
      label: 'Data Products',
      value: 12,
      unit: '',
      trend: 'up',
      trendValue: '+1',
      icon: 'pi-box',
      color: '#8b5cf6'
    },
    {
      label: 'Open Alerts',
      value: 3,
      unit: '',
      trend: 'down',
      trendValue: '-2',
      icon: 'pi-bell',
      color: '#f59e0b'
    },
    {
      label: 'Ingestion Rate',
      value: '4.2k',
      unit: 'msg/min',
      trend: 'up',
      trendValue: '+5%',
      icon: 'pi-arrow-right-arrow-left',
      color: '#22c55e'
    }
  ])

  async function refresh(): Promise<void> {
    // Placeholder for Wave 2 — will fetch live KPIs from the API or UIBuilder
    // For now, simulate minor value drift
    energyKpis.value = energyKpis.value.map(kpi => ({
      ...kpi,
      value: typeof kpi.value === 'number'
        ? Math.round((kpi.value + (Math.random() - 0.5) * kpi.value * 0.02) * 10) / 10
        : kpi.value
    }))
  }

  return {
    energyKpis,
    smartCityKpis,
    platformKpis,
    refresh
  }
})
