import type { AuthUser, Role } from '@/api/types'
import { useSessionStore } from '@/stores/session'

/** Menandai seorang user sebagai sedang login, tanpa melewati API. Panggil setelah `freshPinia()`. */
export function signInAs(role: Role, overrides: Partial<AuthUser> = {}): AuthUser {
  const user: AuthUser = {
    id: `u-${role.toLowerCase()}`,
    name: 'Pengguna Uji',
    email: 'uji@example.com',
    role,
    mustChangePassword: false,
    ...overrides,
  }
  useSessionStore().user = user
  return user
}
