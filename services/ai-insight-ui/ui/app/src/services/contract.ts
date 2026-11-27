// FAP General Guideline §9 — message contract types.
//
// Every message that flows between the SPA and ORCE conforms to one of three
// envelopes: a Command (browser → ORCE request), a Result (ORCE → browser
// response to a specific Command), or an Event (ORCE → browser unsolicited
// push). Sticking to one shared contract is what makes the dispatcher
// topology in §10 and the one-handler reducer in §11 viable.
//
// Reference: /Users/danielpires/Developer/Ciberseg/Atlas/guidelines and examples/
//            FAP_UI_General_Guideline_Reference_Aligned.md  §9

/**
 * Browser → ORCE request envelope (§9 "Recommended request envelope").
 *
 * `action` is the routable verb the dispatcher switches on (e.g. `alerts.list`,
 * `schemas.describe`). `requestId` is generated browser-side and echoed back
 * unchanged in the matching Result so the transport layer can correlate.
 */
export interface CommandRequest<P = unknown> {
  type: 'command'
  action: string
  /** Server-issued. Optional on first request; persisted by the reducer once received. */
  sessionId?: string
  /** Current view/screen identifier — informs server-side routing decisions. */
  step?: string
  /** Browser-generated UUID. Echoed back in the matching Result for correlation. */
  requestId: string
  /**
   * Caller's access token, from the token issuer (verified mode). Proxy flows
   * forward it as `Authorization: Bearer`; downstream, identity derives only
   * from the cryptographically verified JWT — never from client headers.
   */
  token?: string
  payload: P
  meta?: { clientTs: number; source: 'dashboard' }
}

/**
 * Structured error block per §12 "Error handling pattern" — four distinct
 * levels so the reducer can dispatch to the right surface (inline field
 * highlight, action-level banner, integration retry, system fallback).
 */
export interface ContractErrors {
  /** Field-level errors keyed by field name; render inline. */
  fields?: Record<string, string>
  /** Action-level rule/state failure; render banner, stay on current step. */
  action?: string
  /** External service issue; offer retry or support path. */
  integration?: { service: string; message: string }
  /** Unexpected failure; safe message only — log internal detail server-side. */
  system?: string
}

/**
 * ORCE → browser response envelope (§9 "Recommended response envelope").
 *
 * Always returns an explicit `ok` flag — never use missing properties to imply
 * success (§12 mandatory rule). `next.step` drives client-side step
 * transitions; `data` carries the business payload; `ui` carries optional
 * server-driven UI hints (toast, modal); `errors` is structured per §12.
 */
export interface ResultResponse<D = unknown> {
  type: 'result'
  ok: boolean
  /** Mirrors the request's `action`. */
  action: string
  /** Server-issued; client persists on first receipt and echoes in subsequent commands. */
  sessionId?: string
  /** Mirrors the request's `requestId` for correlation. */
  requestId: string
  next?: { step?: string; availableActions?: string[] }
  data: D
  ui?: {
    toast?: { kind: 'success' | 'info' | 'warning' | 'error'; message: string }
    modal?: unknown
  }
  errors?: ContractErrors | null
}

/**
 * ORCE → browser unsolicited push envelope (§9 "Recommended async event envelope").
 *
 * Used for broadcasts (alerts.new, kpi.update) and progress streams
 * (jobProgress, jobComplete). Has no `requestId` — the reducer routes by
 * `event` name only.
 */
export interface EventEnvelope<D = unknown> {
  type: 'event'
  event: string
  data: D
}

/**
 * Discriminated union of all valid inbound messages from ORCE.
 *
 * Use in the single inbound handler (§11):
 *   uibuilder.onChange('msg', (msg: InboundMessage) => { switch (msg.type) {...} })
 */
export type InboundMessage =
  | ResultResponse<unknown>
  | EventEnvelope<unknown>
