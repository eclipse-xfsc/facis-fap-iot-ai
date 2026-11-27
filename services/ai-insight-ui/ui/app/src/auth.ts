/**
 * Auth module — OpenID Connect login through the guard (authorization code +
 * PKCE, public client). The user logs in by presenting a role credential from
 * a wallet on the guard's login page; the guard issues short-lived tokens
 * (5 minutes, no refresh token) whose claims come from that credential.
 *
 * Configuration (Vite env, at build time):
 *   VITE_OIDC_ISSUER     the guard's issuer URL, e.g. https://login.example.org/
 *   VITE_OIDC_CLIENT_ID  this application's client id (facis-ai-insight-ui)
 *   VITE_OIDC_AUDIENCE   the API audience requested for the access token (facis-ai-insight)
 *   VITE_OIDC_SCOPE      default "openid"
 *
 * The access token is kept in sessionStorage until it expires, so a reload does
 * not ask for a new presentation; once it expires the user logs in again.
 * Tokens are verified by the APIs (signature against the guard's JWKS); this
 * module only reads the ID token's claims for display, after checking that the
 * nonce and audience are its own.
 */

import { reactive } from 'vue'
import type { User, UserRole } from '@/data/types'

const env = import.meta.env
const ISSUER = String(env.VITE_OIDC_ISSUER || '').replace(/\/?$/, '/')
const CLIENT_ID = String(env.VITE_OIDC_CLIENT_ID || 'facis-ai-insight-ui')
const AUDIENCE = String(env.VITE_OIDC_AUDIENCE || 'facis-ai-insight')
const SCOPE = String(env.VITE_OIDC_SCOPE || 'openid')

const FLOW_KEY = 'facis_oidc_flow'      // state, nonce, PKCE verifier, return path
const SESSION_KEY = 'facis_oidc_session' // tokens and expiry

interface Session { accessToken: string; idToken: string; expiresAt: number }
interface Discovery { authorization_endpoint: string; token_endpoint: string; end_session_endpoint?: string }

export const auth = reactive<{
  user: User | null
  isAuthenticated: boolean
  initDone: boolean
}>({
  user: null,
  isAuthenticated: false,
  initDone: false
})

let session: Session | null = null

/**
 * The application's roles, from the credential roles (the credential schemas):
 * administrator -> admin; operator -> operator; data_engineer, data_scientist,
 * data_analyst -> analyst; anything else -> viewer. The highest one wins.
 */
export function uiRole(roles: unknown): UserRole {
  const r = Array.isArray(roles) ? roles.filter((x): x is string => typeof x === 'string') : []
  if (r.includes('administrator')) return 'admin'
  if (r.includes('operator')) return 'operator'
  if (r.some((x) => ['data_engineer', 'data_scientist', 'data_analyst'].includes(x))) return 'analyst'
  return 'viewer'
}

export function getRole(): UserRole {
  return auth.user?.role ?? 'viewer'
}

/** The current access token, or null when there is none or it has expired. */
export function getAccessToken(): string | null {
  if (!session || Date.now() >= session.expiresAt) return null
  return session.accessToken
}

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const random = (n = 32): string => b64url(crypto.getRandomValues(new Uint8Array(n)))
const decodeJwt = (jwt: string): Record<string, unknown> => {
  const part = jwt.split('.')[1] || ''
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4))
  return JSON.parse(decodeURIComponent(Array.from(json, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')))
}

let discovery: Promise<Discovery> | null = null
function discover(): Promise<Discovery> {
  if (!ISSUER || ISSUER === '/') return Promise.reject(new Error('VITE_OIDC_ISSUER is not set'))
  discovery = discovery || fetch(ISSUER + '.well-known/openid-configuration').then((r) => {
    if (!r.ok) throw new Error('OpenID configuration of ' + ISSUER + ': HTTP ' + r.status)
    return r.json()
  })
  return discovery
}

const base = (): string => (env.BASE_URL || '/').replace(/\/$/, '')
const redirectUri = (): string => `${window.location.origin}${base()}/`

/** The path inside the application, without the base, to come back to after login. */
function currentAppPath(): string {
  const p = window.location.pathname
  const b = base()
  if (b === '' || p === b || p.startsWith(b + '/')) {
    const stripped = p.slice(b.length)
    if (stripped && stripped !== '/') return stripped
  }
  return '/dashboard'
}

function setUser(idToken: string): void {
  const c = decodeJwt(idToken)
  const name = typeof c.name === 'string' ? c.name : ''
  auth.user = {
    id: typeof c.sub === 'string' ? c.sub : 'unknown',
    firstName: name.split(' ')[0] || 'User',
    lastName: name.split(' ').slice(1).join(' '),
    email: typeof c.email === 'string' ? c.email : '',
    role: uiRole(c.roles),
    lastActive: new Date().toISOString(),
    status: 'active'
  }
  auth.isAuthenticated = true
}

/** Sends the browser to the guard's login (the page unloads). */
export async function login(returnTo = currentAppPath()): Promise<never> {
  const d = await discover()
  const verifier = random(48)
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  const flow = { state: random(), nonce: random(), verifier, returnTo }
  window.sessionStorage.setItem(FLOW_KEY, JSON.stringify(flow))
  const q = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: redirectUri(), scope: SCOPE,
    audience: AUDIENCE, state: flow.state, nonce: flow.nonce,
    code_challenge: challenge, code_challenge_method: 'S256'
  })
  window.location.assign(`${d.authorization_endpoint}?${q}`)
  return new Promise<never>(() => { /* the page is unloading */ })
}

async function completeLogin(params: URLSearchParams): Promise<string> {
  const flow = JSON.parse(window.sessionStorage.getItem(FLOW_KEY) || 'null')
  window.sessionStorage.removeItem(FLOW_KEY)
  if (!flow || params.get('state') !== flow.state) throw new Error('login response does not match the login request')
  const d = await discover()
  const r = await fetch(d.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code: params.get('code') || '', redirect_uri: redirectUri(),
      client_id: CLIENT_ID, code_verifier: flow.verifier
    })
  })
  if (!r.ok) throw new Error('token endpoint: HTTP ' + r.status)
  const t = await r.json()
  const id = decodeJwt(t.id_token || '')
  const aud = Array.isArray(id.aud) ? id.aud : [id.aud]
  if (id.nonce !== flow.nonce || !aud.includes(CLIENT_ID)) throw new Error('ID token is not for this login')
  session = { accessToken: t.access_token, idToken: t.id_token, expiresAt: Date.now() + (Number(t.expires_in) || 300) * 1000 - 10000 }
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return flow.returnTo || '/dashboard'
}

/**
 * Called once before the app mounts. Completes a login coming back from the
 * guard, restores an unexpired session, or sends the browser to the login.
 * After it returns, `auth.isAuthenticated` is true.
 */
export async function initAuth(): Promise<void> {
  if (auth.initDone) return
  auth.initDone = true
  // Wipe what older builds kept (Keycloak-based store).
  try {
    window.sessionStorage.removeItem('facis_user')
    window.sessionStorage.removeItem('facis_demo')
  } catch { /* ignore */ }

  const params = new URLSearchParams(window.location.search)
  if (params.has('error')) {
    throw new Error('login refused: ' + (params.get('error_description') || params.get('error')))
  }
  if (params.has('code') && params.has('state')) {
    const target = await completeLogin(params)
    window.history.replaceState({}, '', `${window.location.origin}${base()}${target}`)
  } else {
    try { session = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null') } catch { session = null }
    if (!session || Date.now() >= session.expiresAt) {
      window.sessionStorage.removeItem(SESSION_KEY)
      await login()
    }
  }
  if (session) setUser(session.idToken)
}

/** Ends the guard session and comes back to the application's start page. */
export async function logout(): Promise<void> {
  const idToken = session?.idToken
  session = null
  auth.user = null
  auth.isAuthenticated = false
  auth.initDone = false
  window.sessionStorage.removeItem(SESSION_KEY)
  try {
    const d = await discover()
    if (d.end_session_endpoint && idToken) {
      const q = new URLSearchParams({ id_token_hint: idToken, post_logout_redirect_uri: redirectUri() })
      window.location.assign(`${d.end_session_endpoint}?${q}`)
      return
    }
  } catch { /* fall through */ }
  window.location.assign(redirectUri())
}

export function hasRole(r: UserRole): boolean {
  if (!auth.user) return false
  const h: UserRole[] = ['viewer', 'analyst', 'operator', 'admin']
  return h.indexOf(auth.user.role) >= h.indexOf(r)
}

export function canAccess(requiredRoles: UserRole[]): boolean {
  return !!auth.user && requiredRoles.includes(auth.user.role)
}
