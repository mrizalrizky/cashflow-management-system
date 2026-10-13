export const PATHS = {
  root: '/',
  login: '/masuk',
  setupPin: '/buat-pin',
  dashboard: '/dashboard',
  transactions: '/transaksi',
  masterData: '/master-data',
  settings: '/pengaturan',
  auditLog: '/pengaturan/audit-log',
} as const

/** Halaman pertama setelah masuk. */
export const HOME = PATHS.dashboard

/** Pola rute halaman detail transaksi. */
export const TRANSACTION_DETAIL_ROUTE = `${PATHS.transactions}/:id`

export function transactionPath(id: string): string {
  return `${PATHS.transactions}/${id}`
}
