import { computed } from 'vue'
import { auth } from '@/auth'
import type { UserRole } from '@/data/types'

const MODULE_VIEW_ROLES: Record<string, UserRole[]> = {
  dashboard: ['viewer', 'analyst', 'operator', 'admin'],
  'use-cases': ['viewer', 'analyst', 'operator', 'admin'],
  'smart-energy': ['viewer', 'analyst', 'operator', 'admin'],
  'smart-city': ['viewer', 'analyst', 'operator', 'admin'],
  'data-sources': ['viewer', 'analyst', 'operator', 'admin'],
  'data-products': ['viewer', 'analyst', 'operator', 'admin'],
  analytics: ['viewer', 'analyst', 'operator', 'admin'],
  alerts: ['viewer', 'analyst', 'operator', 'admin'],
  integrations: ['analyst', 'operator', 'admin'],
  schemas: ['analyst', 'operator', 'admin'],
  provenance: ['analyst', 'operator', 'admin'],
  admin: ['admin'],
  'ai-assistant': ['viewer', 'analyst', 'operator', 'admin']
}

const MODULE_EDIT_ROLES: Record<string, UserRole[]> = {
  dashboard: ['operator', 'admin'],
  'use-cases': ['operator', 'admin'],
  'smart-energy': ['operator', 'admin'],
  'smart-city': ['operator', 'admin'],
  'data-sources': ['operator', 'admin'],
  'data-products': ['analyst', 'operator', 'admin'],
  analytics: ['analyst', 'operator', 'admin'],
  alerts: ['operator', 'admin'],
  integrations: ['operator', 'admin'],
  schemas: ['operator', 'admin'],
  provenance: ['admin'],
  admin: ['admin'],
  'ai-assistant': ['analyst', 'operator', 'admin']
}

export function useRbac() {
  const currentRole = computed(() => auth.user?.role ?? 'viewer')

  function canView(module: string): boolean {
    if (!auth.isAuthenticated || !auth.user) return false
    const allowed = MODULE_VIEW_ROLES[module] ?? ['admin']
    return allowed.includes(auth.user.role)
  }

  function canEdit(module: string): boolean {
    if (!auth.isAuthenticated || !auth.user) return false
    const allowed = MODULE_EDIT_ROLES[module] ?? ['admin']
    return allowed.includes(auth.user.role)
  }

  function canAdmin(): boolean {
    return auth.user?.role === 'admin'
  }

  function canAccessRoles(roles: UserRole[]): boolean {
    if (!auth.user) return false
    return roles.includes(auth.user.role)
  }

  const isAdmin = computed(() => auth.user?.role === 'admin')
  const isOperator = computed(() => auth.user?.role === 'operator' || auth.user?.role === 'admin')
  const isAnalyst = computed(() => ['analyst', 'operator', 'admin'].includes(auth.user?.role ?? ''))

  return { currentRole, isAdmin, isOperator, isAnalyst, canView, canEdit, canAdmin, canAccessRoles }
}
