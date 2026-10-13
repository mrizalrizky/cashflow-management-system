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
  includeTransfers?: boolean | null
}

/** `amount` string digit; `transactionDate` tanggal kalender. */
export interface TransactionInput {
  type: TxType
  amount: string
  transactionDate: string
  description: string
  accountId: string
  categoryId: string
  /** Wajib untuk kategori cicilan; null untuk yang lain. */
  installmentId: string | null
}

export interface TransferInput {
  fromAccountId: string
  toAccountId: string
  amount: string
  transactionDate: string
  description: string
}

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

export function updateTransaction(
  id: string,
  input: Partial<TransactionInput>,
): Promise<Transaction> {
  return request(`/transactions/${id}`, { method: 'PATCH', body: input })
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
