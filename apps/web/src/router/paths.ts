import type { Role } from '@/api/types'

export const PATHS = {
  root: '/',
  login: '/login',
  changePassword: '/ganti-password',
  dashboard: '/dashboard',
  transactions: '/transaksi',
  projects: '/proyek',
  masterData: '/master-data',
  users: '/pengguna',
  auditLog: '/audit-log',
} as const

/** Pola rute halaman detail proyek. */
export const PROJECT_DETAIL_ROUTE = `${PATHS.projects}/:id`

export function projectPath(id: string): string {
  return `${PATHS.projects}/${id}`
}

/** Pola rute halaman detail transaksi. */
export const TRANSACTION_DETAIL_ROUTE = `${PATHS.transactions}/:id`

export function transactionPath(id: string): string {
  return `${PATHS.transactions}/${id}`
}

const LANDING: Record<Role, string> = {
  SUPER_ADMIN: PATHS.dashboard,
  PROJECT_MANAGER: PATHS.projects,
  STAFF: PATHS.transactions,
}

/** Halaman pertama yang dibuka tiap peran setelah login. */
export function landingPath(role: Role): string {
  return LANDING[role]
}
