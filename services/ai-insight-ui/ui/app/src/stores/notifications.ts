import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AlertEvent } from '@/data/types'

const INITIAL_ALERTS: AlertEvent[] = [
  {
    id: 'alert-001',
    useCase: 'Smart Energy',
    source: 'Meter-SITE-A-001',
    category: 'Data Quality',
    severity: 'warning',
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    status: 'open',
    message: 'Active power reading anomaly detected: 42 kW spike above baseline for >3 minutes.'
  },
  {
    id: 'alert-002',
    useCase: 'Smart City',
    source: 'Zone-CBD-03',
    category: 'Device Health',
    severity: 'error',
    timestamp: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    status: 'open',
    message: 'Luminaire LU-0312 not responding to dim commands. Fault state confirmed.'
  },
  {
    id: 'alert-003',
    useCase: 'Smart Energy',
    source: 'PV-System-02',
    category: 'Performance',
    severity: 'info',
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    status: 'acknowledged',
    message: 'PV output 18% below forecast for current irradiance conditions. Possible soiling event.'
  },
  {
    id: 'alert-004',
    useCase: 'Platform',
    source: 'MQTT Adapter',
    category: 'Connectivity',
    severity: 'critical',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    status: 'resolved',
    message: 'MQTT broker connection lost for 4m 32s. 128 messages buffered and replayed on reconnect.'
  },
  {
    id: 'alert-005',
    useCase: 'Smart City',
    source: 'TrafficSensor-N12',
    category: 'Data Quality',
    severity: 'warning',
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    status: 'open',
    message: 'Vehicle count sensor reporting values 3σ above weekly average. Manual verification recommended.'
  }
]

export const useNotificationsStore = defineStore('notifications', () => {
  const alerts = ref<AlertEvent[]>([...INITIAL_ALERTS])
  const readIds = ref<Set<string>>(new Set())

  const unreadCount = computed(() =>
    alerts.value.filter(a => !readIds.value.has(a.id) && a.status !== 'resolved').length
  )

  const openAlerts = computed(() => alerts.value.filter(a => a.status === 'open'))
  const criticalAlerts = computed(() => alerts.value.filter(a => a.severity === 'critical' && a.status !== 'resolved'))

  function addAlert(alert: Omit<AlertEvent, 'id'>): void {
    const newAlert: AlertEvent = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    }
    alerts.value.unshift(newAlert)
  }

  function markRead(id: string): void {
    readIds.value.add(id)
  }

  function markAllRead(): void {
    alerts.value.forEach(a => readIds.value.add(a.id))
  }

  function acknowledge(id: string): void {
    const alert = alerts.value.find(a => a.id === id)
    if (alert) {
      alert.status = 'acknowledged'
      readIds.value.add(id)
    }
  }

  function resolve(id: string): void {
    const alert = alerts.value.find(a => a.id === id)
    if (alert) {
      alert.status = 'resolved'
      readIds.value.add(id)
    }
  }

  function clearAll(): void {
    alerts.value = []
    readIds.value.clear()
  }

  function isRead(id: string): boolean {
    return readIds.value.has(id)
  }

  return {
    alerts,
    unreadCount,
    openAlerts,
    criticalAlerts,
    addAlert,
    markRead,
    markAllRead,
    acknowledge,
    resolve,
    clearAll,
    isRead
  }
})
