import type { ApprovedTransaction } from '@/api/transactions'
import { formatRupiah } from './money'

/** Nilai pilihan "tanpa proyek" di dropdown proyek (filter dan form). */
export const OVERHEAD = 'overhead'
export const AMOUNT_MAX_DIGITS = 13
export const DESCRIPTION_MAX_LENGTH = 500

/**
 * Peringatan bila persetujuan membuat saldo akun minus. API hanya mengirim saldonya kepada
 * SUPER_ADMIN, jadi untuk peran lain hasilnya selalu null.
 */
export function negativeBalanceWarning(approved: ApprovedTransaction): string | null {
  const balance = approved.accountBalance
  if (!balance?.startsWith('-')) return null
  return `Saldo ${approved.account.name} sekarang minus: ${formatRupiah(balance)}`
}
