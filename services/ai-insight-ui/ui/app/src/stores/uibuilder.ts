import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// ─── Protocol types ────────────────────────────────────────────────────────────

export interface InsightResponsePayload {
  type: string
  summary: string
  keyFindings: string[]
  recommendations: string[]
  metadata?: Record<string, unknown>
  data?: unknown
}

export interface LlmResponsePayload {
  text: string
  provider: string
  model: string
  timestamp: string
}

export interface KpiUpdatePayload {
  netGrid: number
  pvGeneration: number
  dailyCost: number
}

export interface UibMessage {
  topic: string
  payload: {
    recordDetails?: {
      insight?: InsightResponsePayload
      response?: LlmResponsePayload
      [key: string]: unknown
    }
    [key: string]: unknown
  }
}

type MessageHandler = (msg: UibMessage) => void

// ─── Pending requests ─────────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (value: string) => void
  reject: (reason: unknown) => void
  timeoutId: ReturnType<typeof setTimeout>
}

export const useUiBuilderStore = defineStore('uibuilder', () => {
  const connected = ref(false)
  const connecting = ref(false)
  const lastError = ref<string | null>(null)
  const lastKpi = ref<KpiUpdatePayload | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let uib: any = null
  const handlers: MessageHandler[] = []
  const pending = new Map<string, PendingRequest>()

  // ─── Init ──────────────────────────────────────────────────────────────────

  async function init(): Promise<void> {
    if (connecting.value || connected.value) return
    connecting.value = true

    try {
      // UIBuilder attaches itself to window.uibuilder when the client script loads.
      // In production the script is served by Node-RED at /uibuilder/vendor/uibuilder.esm.js
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any
      if (win.uibuilder) {
        uib = win.uibuilder
        uib.start()

        uib.onChange('connected', (val: boolean) => {
          connected.value = val
        })

        // Listen to all incoming messages and dispatch to handlers + pending resolvers
        uib.onTopic('*', (msg: UibMessage) => {
          _dispatch(msg)
        })

        connected.value = true
      } else {
        // UIBuilder not available — running standalone / dev mode
        lastError.value = 'UIBuilder runtime not found. Running in mock data mode.'
      }
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : 'UIBuilder init failed'
    } finally {
      connecting.value = false
    }
  }

  // ─── Internal dispatcher ───────────────────────────────────────────────────

  function _dispatch(msg: UibMessage): void {
    const topic = msg?.topic ?? ''

    // Handle live KPI pushes
    if (topic === 'kpi.update') {
      const kpi = msg.payload?.recordDetails as KpiUpdatePayload | undefined
      if (kpi) lastKpi.value = kpi
    }

    // Resolve pending insight.response promises
    if (topic === 'insight.response') {
      const insight = msg.payload?.recordDetails?.insight
      if (insight) {
        const entry = pending.get('insight.request')
        if (entry) {
          clearTimeout(entry.timeoutId)
          pending.delete('insight.request')
          const text = _formatInsightResponse(insight)
          entry.resolve(text)
        }
      }
    }

    // Resolve pending llm.response promises
    if (topic === 'llm.response') {
      const resp = msg.payload?.recordDetails?.response
      if (resp) {
        const entry = pending.get('llm.freeform')
        if (entry) {
          clearTimeout(entry.timeoutId)
          pending.delete('llm.freeform')
          entry.resolve(resp.text ?? '')
        }
      }
    }

    // Broadcast to all registered handlers
    handlers.forEach(h => h(msg))
  }

  function _formatInsightResponse(insight: InsightResponsePayload): string {
    let out = insight.summary ?? ''
    if (insight.keyFindings?.length) {
      out += '\n\n**Key Findings:**\n' + insight.keyFindings.map(f => `- ${f}`).join('\n')
    }
    if (insight.recommendations?.length) {
      out += '\n\n**Recommendations:**\n' + insight.recommendations.map(r => `- ${r}`).join('\n')
    }
    return out
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Send a smart-prompt insight request. Returns a promise that resolves when
   *  the backend responds with `insight.response`, or rejects after timeout. */
  function requestInsight(
    action: string,
    params: Record<string, unknown>,
    promptText: string,
    timeoutMs = 30_000
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!uib || !connected.value) {
        reject(new Error('UIBuilder not connected'))
        return
      }

      const timeoutId = setTimeout(() => {
        pending.delete('insight.request')
        reject(new Error('insight.request timed out'))
      }, timeoutMs)

      pending.set('insight.request', { resolve, reject, timeoutId })

      uib.send({
        topic: 'insight.request',
        payload: { action, params, promptText }
      })
    })
  }

  /** Send a free-form LLM query. Returns a promise that resolves when the
   *  backend responds with `llm.response`, or rejects after timeout. */
  function requestLlm(query: string, timeoutMs = 60_000): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!uib || !connected.value) {
        reject(new Error('UIBuilder not connected'))
        return
      }

      const timeoutId = setTimeout(() => {
        pending.delete('llm.freeform')
        reject(new Error('llm.freeform timed out'))
      }, timeoutMs)

      pending.set('llm.freeform', { resolve, reject, timeoutId })

      uib.send({ topic: 'llm.freeform', payload: { query } })
    })
  }

  /** Low-level send — bypasses request/response tracking */
  function send(topic: string, payload: unknown): void {
    if (!uib || !connected.value) {
      console.debug('[UIBuilder] send skipped (not connected):', topic, payload)
      return
    }
    uib.send({ topic, payload })
  }

  function onMessage(handler: MessageHandler): () => void {
    handlers.push(handler)
    return () => {
      const idx = handlers.indexOf(handler)
      if (idx !== -1) handlers.splice(idx, 1)
    }
  }

  function disconnect(): void {
    // Cancel all pending requests
    for (const [key, entry] of pending.entries()) {
      clearTimeout(entry.timeoutId)
      entry.reject(new Error('UIBuilder disconnected'))
      pending.delete(key)
    }
    if (uib) {
      try { uib.disconnect?.() } catch { /* ignore */ }
    }
    uib = null
    connected.value = false
    handlers.length = 0
  }

  const isAvailable = computed(() => connected.value)

  return {
    connected,
    connecting,
    lastError,
    lastKpi,
    isAvailable,
    init,
    send,
    requestInsight,
    requestLlm,
    onMessage,
    disconnect
  }
})
