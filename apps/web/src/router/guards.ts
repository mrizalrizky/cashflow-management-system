import type { RouteMeta } from 'vue-router'
import type { AuthUser } from '@/api/types'
import { HOME, PATHS } from './paths'

export interface NavigationInput {
  user: AuthUser | null
  to: { path: string; fullPath: string; meta: RouteMeta }
}

export type NavigationResult = true | { path: string; query?: Record<string, string> }

/**
 * Tujuan setelah masuk yang aman dipakai: hanya path di dalam aplikasi ini.
 * `//host` dan `/\host` ditolak karena browser membacanya sebagai alamat situs lain.
 */
export function safeRedirect(value: unknown): string | null {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : null
}

/** Hanya soal kenyamanan: yang benar-benar menjaga data adalah API. */
export function resolveNavigation({ user, to }: NavigationInput): NavigationResult {
  if (!user) return to.meta.public ? true : { path: PATHS.login, query: { redirect: to.fullPath } }
  if (to.meta.public || to.path === PATHS.root) return { path: HOME }
  return true
}

/** Halaman yang dibuka setelah masuk atau setelah membuat PIN. */
export function postLoginPath(redirect?: unknown): string {
  return safeRedirect(redirect) ?? HOME
}
