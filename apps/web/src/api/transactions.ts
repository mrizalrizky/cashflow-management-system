import { request, requestFile, type DownloadedFile } from './http'
import type { PageParams, Paginated, Transaction, TxStatus, TxType } from './types'

/** `null` diperlakukan sama dengan tidak diisi (nilai dari dropdown yang dikosongkan). */
export interface TransactionFilters {
  search?: string
  dateFrom?: string | null
  dateTo?: string | null
  type?: TxType | null
  status?: TxStatus | null
  accountId?: string | null
  categoryId?: string | null
  projectId?: string | null
  /** Hanya transaksi tanpa proyek. */
  overhead?: boolean | null
  includeTransfers?: boolean | null
}

/** `amount` string digit; `transactionDate` tanggal kalender; `projectId` null untuk overhead. */
export interface TransactionInput {
  type: TxType
  amount: string
  transactionDate: string
  description: string
  accountId: string
  categoryId: string
  projectId: string | null
}

export interface TransferInput {
  fromAccountId: string
  toAccountId: string
  amount: string
  transactionDate: string
  description: string
}

/** Saldo akun sesudah disetujui hanya dikirim API kepada SUPER_ADMIN. */
export type ApprovedTransaction = Transaction & { accountBalance?: string }

function action<T>(id: string, name: string, body: Record<string, string>): Promise<T> {
  return request(`/transactions/${id}/${name}`, { method: 'POST', body })
}

export function listTransactions(
  params: PageParams & TransactionFilters,
): Promise<Paginated<Transaction>> {
  return request('/transactions', { query: { ...params } })
}

export function getTransaction(id: string): Promise<Transaction> {
  return request(`/transactions/${id}`)
}

export function createTransaction(input: TransactionInput): Promise<Transaction> {
  return request('/transactions', { method: 'POST', body: input })
}

/** Mengubah transaksi REJECTED sekaligus mengajukannya lagi. */
export function updateTransaction(
  id: string,
  input: Partial<TransactionInput>,
): Promise<Transaction> {
  return request(`/transactions/${id}`, { method: 'PATCH', body: input })
}

export function cancelTransaction(id: string, reason: string): Promise<Transaction> {
  return action(id, 'cancel', { reason })
}

/**
 * `expectedUpdatedAt` adalah `updatedAt` transaksi yang dilihat peninjau; API menolak (409)
 * bila transaksi atau buktinya berubah sesudah itu. Hanya boleh dikosongkan oleh pembuat
 * yang menyetujui transaksinya sendiri begitu selesai dicatat.
 */
export function approveTransaction(
  id: string,
  expectedUpdatedAt?: string,
): Promise<ApprovedTransaction> {
  return action(id, 'approve', expectedUpdatedAt ? { expectedUpdatedAt } : {})
}

export function rejectTransaction(
  id: string,
  reason: string,
  expectedUpdatedAt: string,
): Promise<Transaction> {
  return action(id, 'reject', { reason, expectedUpdatedAt })
}

export function voidTransaction(id: string, reason: string): Promise<Transaction> {
  return action(id, 'void', { reason })
}

/** Mengembalikan kedua sisi transfer: keluar dulu, lalu masuk. */
export function createTransfer(input: TransferInput): Promise<Transaction[]> {
  return request('/transactions/transfer', { method: 'POST', body: input })
}

/**
 * Daftar transaksi sebagai berkas CSV, dengan filter yang sama seperti daftar (tanpa halaman).
 * Isinya dibatasi API sesuai apa yang boleh dilihat pengguna.
 */
export function exportTransactions(filters: TransactionFilters): Promise<DownloadedFile> {
  return requestFile('/transactions/export', { ...filters })
}
