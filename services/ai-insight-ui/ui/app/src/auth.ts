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

    // Clean KC callback params from URL — keep just the path for the router
    window.history.replaceState({}, '', window.location.origin + '/dashboard')
  }
}

export function logout(): void {
  auth.user = null
  auth.isAuthenticated = false
  auth.initDone = false
  if (keycloak) {
    keycloak.logout({ redirectUri: window.location.origin })
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
