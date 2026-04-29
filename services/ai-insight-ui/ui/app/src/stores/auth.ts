import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { User, UserRole } from '@/data/types'

function extractRoleFromToken(tp: Record<string, any>): UserRole {
  const roles = tp?.realm_access?.roles ?? []
  if (roles.includes('admin')) return 'admin'
  if (roles.includes('operator')) return 'operator'
  if (roles.includes('analyst')) return 'analyst'
  return 'viewer'
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const isAuthenticated = ref(false)
  const isDemoMode = ref(false)
  const keycloakAvailable = ref(false)
  const loading = ref(false)
  const initDone = ref(false)

  const role = computed<UserRole>(() => user.value?.role ?? 'viewer')

  // Persist auth state to sessionStorage so it survives page reloads
  watch(user, (u) => {
    if (u) {
      window.sessionStorage.setItem('facis_user', JSON.stringify(u))
    } else {
      window.sessionStorage.removeItem('facis_user')
    }
  })

  watch(isDemoMode, (v) => {
    window.sessionStorage.setItem('facis_demo', v ? '1' : '0')
  })

  async function init(): Promise<void> {
    if (initDone.value) return
    initDone.value = true

    keycloakAvailable.value =
      window.location.protocol === 'https:' || window.location.hostname === 'localhost'

    // 1. Try restoring from sessionStorage
    try {
      const stored = window.sessionStorage.getItem('facis_user')
      if (stored) {
        user.value = JSON.parse(stored)
        isAuthenticated.value = true
        isDemoMode.value = window.sessionStorage.getItem('facis_demo') === '1'
        return
      }
    } catch { /* ignore */ }

    // 2. Check for Keycloak OIDC callback (?code=&state= in URL)
    const params = new URLSearchParams(window.location.search)
    if (params.has('code') && params.has('state')) {
      loading.value = true
      try {
        const KC = (await import('keycloak-js')).default as any
        const kc = new KC({
          url: import.meta.env?.VITE_KEYCLOAK_URL || 'https://identity.facis.cloud',
          realm: import.meta.env?.VITE_KEYCLOAK_REALM || 'facis',
          clientId: import.meta.env?.VITE_KEYCLOAK_CLIENT_ID || 'facis-ai-insight'
        })
        const ok = await kc.init({ checkLoginIframe: false, pkceMethod: 'S256' })
        if (ok && kc.tokenParsed) {
          const tp = kc.tokenParsed
          user.value = {
            id: tp.sub ?? 'unknown',
            firstName: tp.given_name ?? tp.preferred_username ?? 'User',
            lastName: tp.family_name ?? '',
            email: tp.email ?? '',
            role: extractRoleFromToken(tp),
            lastActive: new Date().toISOString(),
            status: 'active'
          }
          isAuthenticated.value = true
          isDemoMode.value = false
          // Clean URL
          window.history.replaceState({}, '', window.location.pathname + window.location.hash)
        }
      } catch (e) {
        console.warn('KC callback failed', e)
      } finally {
        loading.value = false
      }
    }
    // 3. Otherwise: not authenticated, router will redirect to /login
  }

  function setFromKeycloak(kc: any): void {
    const tp = kc.tokenParsed
    if (!tp) return
    user.value = {
      id: tp.sub ?? 'unknown',
      firstName: tp.given_name ?? tp.preferred_username ?? 'User',
      lastName: tp.family_name ?? '',
      email: tp.email ?? '',
      role: extractRoleFromToken(tp),
      lastActive: new Date().toISOString(),
      status: 'active'
    }
    isAuthenticated.value = true
    isDemoMode.value = false
  }

  function useDemoUser(): void {
    user.value = {
      id: 'demo-admin', firstName: 'Demo', lastName: 'Admin',
      email: 'admin@facis.local', role: 'admin',
      lastActive: new Date().toISOString(), status: 'active'
    }
    isAuthenticated.value = true
    isDemoMode.value = true
  }

  function hasRole(r: UserRole): boolean {
    if (!user.value) return false
    const h: UserRole[] = ['viewer', 'analyst', 'operator', 'admin']
    return h.indexOf(user.value.role) >= h.indexOf(r)
  }

  function canAccess(requiredRoles: UserRole[]): boolean {
    return !!user.value && requiredRoles.includes(user.value.role)
  }

  async function logout(): Promise<void> {
    user.value = null
    isAuthenticated.value = false
    isDemoMode.value = false
    initDone.value = false
    window.sessionStorage.removeItem('facis_user')
    window.sessionStorage.removeItem('facis_demo')
  }

  return {
    user, role, isAuthenticated, isDemoMode, keycloakAvailable,
    loading, initDone,
    init, setFromKeycloak, useDemoUser, hasRole, canAccess, logout
  }
})
