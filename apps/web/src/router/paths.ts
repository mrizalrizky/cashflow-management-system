import type { Role } from '@/api/types'

export const PATHS = {
  root: '/',
  login: '/login',
  changePassword: '/ganti-password',
  dashboard: '/dashboard',
  transactions: '/transaksi',
  masterData: '/master-data',
  users: '/pengguna',
  auditLog: '/audit-log',
} as const

/** Pola rute halaman detail transaksi. */
export const TRANSACTION_DETAIL_ROUTE = `${PATHS.transactions}/:id`

export function transactionPath(id: string): string {
  return `${PATHS.transactions}/${id}`
}

const LANDING: Record<Role, string> = {
  SUPER_ADMIN: PATHS.dashboard,
  PROJECT_MANAGER: PATHS.transactions,
  STAFF: PATHS.transactions,
}

/** Halaman pertama yang dibuka tiap peran setelah login. */
export function landingPath(role: Role): string {
  return LANDING[role]
}
