import type { AuthUser } from '@/api/types'
import { useSessionStore } from '@/stores/session'

/** Menandai pemilik sebagai sedang masuk, tanpa melewati API. Panggil setelah `freshPinia()`. */
export function signIn(overrides: Partial<AuthUser> = {}): AuthUser {
  const user: AuthUser = { id: 'u-owner', name: 'Pemilik', ...overrides }
  useSessionStore().user = user
  return user
}
