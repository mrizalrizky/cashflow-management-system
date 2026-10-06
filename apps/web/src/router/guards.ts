import type { RouteMeta } from 'vue-router'
import type { AuthUser, Role } from '@/api/types'
import { landingPath, PATHS } from './paths'

export interface NavigationInput {
  user: AuthUser | null
  to: { path: string; fullPath: string; meta: RouteMeta }
}

export type NavigationResult = true | { path: string; query?: Record<string, string> }

export function isRoleAllowed(meta: RouteMeta, role: Role): boolean {
  return !meta.roles || meta.roles.includes(role)
}

/**
 * Tujuan setelah login yang aman dipakai: hanya path di dalam aplikasi ini.
 * `//host` dan `/\host` ditolak karena browser membacanya sebagai alamat situs lain.
 */
export function safeRedirect(value: unknown): string | null {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : null
}

/**
 * Menentukan boleh tidaknya sebuah navigasi. Ini hanya soal kenyamanan pengguna:
 * yang benar-benar menjaga data adalah API.
 */
export function resolveNavigation({ user, to }: NavigationInput): NavigationResult {
  if (!user) {
    return to.meta.public ? true : { path: PATHS.login, query: { redirect: to.fullPath } }
  }
  if (user.mustChangePassword) {
    return to.meta.allowPendingPasswordChange ? true : { path: PATHS.changePassword }
  }
  const home = { path: landingPath(user.role) }
  if (to.meta.public || to.path === PATHS.root) return home
  return isRoleAllowed(to.meta, user.role) ? true : home
}

/** Halaman yang dibuka setelah login atau setelah ganti password. */
export function postLoginPath(user: AuthUser, redirect?: unknown): string {
  if (user.mustChangePassword) return PATHS.changePassword
  return safeRedirect(redirect) ?? landingPath(user.role)
}
