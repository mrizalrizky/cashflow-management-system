export const PATHS = {
  root: '/',
  login: '/masuk',
  setupPin: '/buat-pin',
  dashboard: '/dashboard',
  transactions: '/transaksi',
  installments: '/cicilan',
  wishlist: '/wishlist',
  masterData: '/master-data',
  settings: '/pengaturan',
  auditLog: '/pengaturan/audit-log',
} as const

/** Halaman pertama setelah masuk. */
export const HOME = PATHS.dashboard

/** Pola rute halaman detail transaksi. */
export const TRANSACTION_DETAIL_ROUTE = `${PATHS.transactions}/:id`

/** Pola rute halaman detail cicilan. */
export const INSTALLMENT_DETAIL_ROUTE = `${PATHS.installments}/:id`

export function installmentPath(id: string): string {
  return `${PATHS.installments}/${id}`
}

/** Pola rute halaman detail barang wishlist. */
export const WISHLIST_DETAIL_ROUTE = `${PATHS.wishlist}/:id`

export function wishlistPath(id: string): string {
  return `${PATHS.wishlist}/${id}`
}

export function transactionPath(id: string): string {
  return `${PATHS.transactions}/${id}`
}
