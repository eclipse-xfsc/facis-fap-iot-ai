/**
 * Auth module — single global Keycloak instance.
 * Uses `onLoad: 'login-required'` so KC handles the entire login flow.
 * No custom login page, no sessionStorage, no competing instances.
 *
 * Validated with POC at /kc-test.html on the live cluster.
 */

import { reactive } from 'vue'
import type { User, UserRole } from '@/data/types'

let keycloak: any = null

export const auth = reactive<{
  user: User | null
  isAuthenticated: boolean
  initDone: boolean
}>({
  user: null,
  isAuthenticated: false,
  initDone: false
})

export function getRole(): UserRole {
  return auth.user?.role ?? 'viewer'
}

/**
 * Returns the current Keycloak access token (or null if uninitialised /
 * expired). Used by `api.ts` to attach `Authorization: Bearer <jwt>` on
 * routes that the ORCE flows authorize via Keycloak userinfo (e.g. admin proxy).
 */
export function getAccessToken(): string | null {
  return (keycloak && keycloak.token) || null
}

/**
 * Initialise Keycloak. Called once by the router guard on first navigation.
 *
 * - If user has no KC session → KC redirects to login form (page unloads, code stops here)
 * - If user has KC session or callback code in URL → `authenticated = true`, token parsed
 * - After this returns, `auth.isAuthenticated` is guaranteed `true`
 */
export async function initAuth(): Promise<void> {
  if (auth.initDone) return
  auth.initDone = true

  const KC = (await import('keycloak-js')).default as any
  keycloak = new KC({
    url: 'https://identity.facis.cloud',
    realm: 'facis',
    clientId: 'facis-ai-insight'
  })

  const authenticated = await keycloak.init({
    onLoad: 'login-required',
    checkLoginIframe: false
  })

  if (authenticated && keycloak.tokenParsed) {
    const tp = keycloak.tokenParsed
    const roles: string[] = tp.realm_access?.roles ?? []
    let role: UserRole = 'viewer'
    if (roles.includes('admin')) role = 'admin'
    else if (roles.includes('operator')) role = 'operator'
    else if (roles.includes('analyst')) role = 'analyst'

    auth.user = {
      id: tp.sub ?? 'unknown',
      firstName: tp.given_name ?? tp.preferred_username ?? 'User',
      lastName: tp.family_name ?? '',
      email: tp.email ?? '',
      role,
      lastActive: new Date().toISOString(),
      status: 'active'
    }
    auth.isAuthenticated = true

    // Clean KC callback params from URL — preserve the SPA base path AND the
    // deep-link the user actually requested (e.g. /aiInsight/admin/users), so
    // bookmarks and shared URLs survive the Keycloak round-trip.
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
    const currentPath = window.location.pathname
    const stripped = currentPath.startsWith(base) ? currentPath.slice(base.length) : currentPath
    const target = stripped && stripped !== '/' ? stripped : '/dashboard'
    window.history.replaceState({}, '', `${window.location.origin}${base}${target}`)
  }
}

export function logout(): void {
  auth.user = null
  auth.isAuthenticated = false
  auth.initDone = false
  // Wipe any persisted state from older builds (Pinia auth-store legacy keys).
  try {
    window.sessionStorage.removeItem('facis_user')
    window.sessionStorage.removeItem('facis_demo')
  } catch { /* ignore */ }
  if (keycloak) {
    // Post-logout must redirect to a URI inside the registered allow-list
    // (`https://fap-iotai.facis.cloud/aiInsight/*`). The bare origin is NOT
    // in that list and Keycloak silently rejects it, leaving the user stuck.
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
    keycloak.logout({ redirectUri: `${window.location.origin}${base}/` })
  }
}

export function hasRole(r: UserRole): boolean {
  if (!auth.user) return false
  const h: UserRole[] = ['viewer', 'analyst', 'operator', 'admin']
  return h.indexOf(auth.user.role) >= h.indexOf(r)
}

export function canAccess(requiredRoles: UserRole[]): boolean {
  return !!auth.user && requiredRoles.includes(auth.user.role)
}

export function setFromKeycloak(_kc: any): void {
  // Kept for compatibility — but initAuth() now handles this directly
}
