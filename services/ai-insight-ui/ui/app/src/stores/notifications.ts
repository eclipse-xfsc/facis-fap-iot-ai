import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AlertEvent } from '@/data/types'
import { getAlerts } from '@/services/api'

export const useNotificationsStore = defineStore('notifications', () => {
  // Alerts come from /api/v1/alerts (Phase-5 ORCE flow). The flow's catch
  // node pushes uncaught flow errors onto a bounded ring buffer; views may
  // also unshift locally-detected anomalies via addAlert() for immediate
  // display. No mock seed — empty until either source produces data.
  const alerts = ref<AlertEvent[]>([])
  const readIds = ref<Set<string>>(new Set())
  const loaded = ref(false)

  async function loadFromApi(): Promise<void> {
    if (loaded.value) return
    try {
      const resp = await getAlerts()
      if (resp && Array.isArray(resp.alerts)) {
        const ALLOWED_SEV: AlertEvent['severity'][] = ['critical', 'error', 'warning', 'info']
        const ALLOWED_STATUS: AlertEvent['status'][] = ['open', 'acknowledged', 'resolved']
        alerts.value = resp.alerts
          .filter((a): a is Record<string, unknown> => a !== null && typeof a === 'object')
          .map((a) => ({
            id: String(a.id ?? `alert-${Date.now()}`),
            useCase: (a.useCase as AlertEvent['useCase']) ?? 'Platform',
            source: String(a.source ?? 'unknown'),
            category: String(a.category ?? 'Runtime'),
            severity: (ALLOWED_SEV.includes(a.severity as AlertEvent['severity'])
              ? a.severity
              : 'info') as AlertEvent['severity'],
            timestamp: String(a.timestamp ?? new Date().toISOString()),
            status: (ALLOWED_STATUS.includes(a.status as AlertEvent['status'])
              ? a.status
              : 'open') as AlertEvent['status'],
            message: String(a.message ?? ''),
          }))
        loaded.value = true
      }
    } catch { /* leave alerts as-is on transient failure */ }
  }

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
    loaded,
    loadFromApi,
    addAlert,
    markRead,
    markAllRead,
    acknowledge,
    resolve,
    clearAll,
    isRead
  }
})
