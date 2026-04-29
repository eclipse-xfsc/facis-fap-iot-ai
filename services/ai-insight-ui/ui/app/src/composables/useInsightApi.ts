import { ref } from 'vue'
import type { EnergyInsight, DataProduct, AlertEvent } from '@/data/types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

interface ApiResponse<T> {
  data: T | null
  error: string | null
  loading: boolean
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    ...options
  })
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

// ─── Insights ────────────────────────────────────────────────────────────────

export function useInsightApi() {
  const state = ref<ApiResponse<EnergyInsight[]>>({
    data: null,
    error: null,
    loading: false
  })

  async function fetchInsights(useCaseId?: string): Promise<EnergyInsight[]> {
    state.value.loading = true
    state.value.error = null
    try {
      const path = useCaseId ? `/insights?useCase=${useCaseId}` : '/insights'
      const result = await apiFetch<EnergyInsight[]>(path)
      state.value.data = result
      return result
    } catch (err) {
      state.value.error = err instanceof Error ? err.message : 'Failed to fetch insights'
      return []
    } finally {
      state.value.loading = false
    }
  }

  async function fetchInsight(id: string): Promise<EnergyInsight | null> {
    try {
      return await apiFetch<EnergyInsight>(`/insights/${id}`)
    } catch {
      return null
    }
  }

  async function askAi(query: string, context?: Record<string, unknown>): Promise<string> {
    try {
      const result = await apiFetch<{ answer: string }>('/ai/query', {
        method: 'POST',
        body: JSON.stringify({ query, context })
      })
      return result.answer
    } catch (err) {
      throw err instanceof Error ? err : new Error('AI query failed')
    }
  }

  return { state, fetchInsights, fetchInsight, askAi }
}

// ─── Data Products API ───────────────────────────────────────────────────────

export function useDataProductApi() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchProducts(category?: string): Promise<DataProduct[]> {
    loading.value = true
    error.value = null
    try {
      const path = category ? `/data-products?category=${category}` : '/data-products'
      return await apiFetch<DataProduct[]>(path)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch data products'
      return []
    } finally {
      loading.value = false
    }
  }

  async function fetchProduct(id: string): Promise<DataProduct | null> {
    try {
      return await apiFetch<DataProduct>(`/data-products/${id}`)
    } catch {
      return null
    }
  }

  async function exportProduct(id: string, format: 'json' | 'csv' | 'parquet'): Promise<Blob | null> {
    try {
      const response = await fetch(`${BASE_URL}/data-products/${id}/export?format=${format}`)
      if (!response.ok) throw new Error('Export failed')
      return response.blob()
    } catch {
      return null
    }
  }

  return { loading, error, fetchProducts, fetchProduct, exportProduct }
}

// ─── Alerts API ──────────────────────────────────────────────────────────────

export function useAlertsApi() {
  const loading = ref(false)

  async function fetchAlerts(status?: string): Promise<AlertEvent[]> {
    loading.value = true
    try {
      const path = status ? `/alerts?status=${status}` : '/alerts'
      return await apiFetch<AlertEvent[]>(path)
    } catch {
      return []
    } finally {
      loading.value = false
    }
  }

  async function acknowledgeAlert(id: string): Promise<boolean> {
    try {
      await apiFetch(`/alerts/${id}/acknowledge`, { method: 'POST' })
      return true
    } catch {
      return false
    }
  }

  async function resolveAlert(id: string): Promise<boolean> {
    try {
      await apiFetch(`/alerts/${id}/resolve`, { method: 'POST' })
      return true
    } catch {
      return false
    }
  }

  return { loading, fetchAlerts, acknowledgeAlert, resolveAlert }
}
