import type { Role } from '@/api/types'

export const PATHS = {
  root: '/',
  login: '/login',
  changePassword: '/ganti-password',
  dashboard: '/dashboard',
  transactions: '/transaksi',
  projects: '/proyek',
  users: '/pengguna',
} as const

const LANDING: Record<Role, string> = {
  SUPER_ADMIN: PATHS.dashboard,
  PROJECT_MANAGER: PATHS.projects,
  STAFF: PATHS.transactions,
}

/** Halaman pertama yang dibuka tiap peran setelah login. */
export function landingPath(role: Role): string {
  return LANDING[role]
}
