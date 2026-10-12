import { ref, type Ref } from 'vue'
import { voidTransaction } from '@/api/transactions'
import type { Transaction } from '@/api/types'
import { useNotify } from './useNotify'

export const TRANSFER_VOID_NOTE =
  'Bagian dari transfer antar akun. Void akan membatalkan kedua sisinya.'

/** Isi `ReasonDialog` untuk tindakan yang sedang diminta. */
export interface ReasonRequest {
  title: string
  label: string
  confirmLabel: string
  note?: string
  submit: (reason: string) => Promise<unknown>
}

export interface TransactionActionsOptions {
  /** Transaksi berhasil diubah; argumennya keadaan terbarunya. */
  onChanged: (transaction: Transaction) => void
}

export interface TransactionActions {
  /** True selagi sebuah tindakan berjalan; semua tombol tindakan dimatikan. */
  busy: Ref<boolean>
  /** Untuk `v-model:visible` dan props `ReasonDialog`. */
  reasonOpen: Ref<boolean>
  reasonRequest: Ref<ReasonRequest | null>
  void(transaction: Transaction): void
}

/**
 * Membatalkan (void) sebuah transaksi dengan alasan dan pesan yang seragam. Halaman pemakainya
 * memasang satu `ReasonDialog` dan menampilkan tombolnya sesuai `permissions` transaksi.
 */
export function useTransactionActions(options: TransactionActionsOptions): TransactionActions {
  const notify = useNotify()
  const busy = ref(false)
  const reasonOpen = ref(false)
  const reasonRequest = ref<ReasonRequest | null>(null)

  /** Menjalankan satu tindakan; null bila tindakan lain masih berjalan. Kegagalan dilempar. */
  async function run(call: () => Promise<Transaction>, done: string): Promise<Transaction | null> {
    if (busy.value) return null
    busy.value = true
    try {
      const result = await call()
      options.onChanged(result)
      notify.success(done)
      return result
    } finally {
      busy.value = false
    }
  }

  function voidTx(transaction: Transaction): void {
    reasonRequest.value = {
      title: 'Void transaksi',
      label: 'Alasan void',
      confirmLabel: 'Void',
      note: transaction.isTransfer
        ? TRANSFER_VOID_NOTE
        : 'Transaksi dibatalkan dan tidak lagi dihitung di saldo.',
      submit: (reason) => run(() => voidTransaction(transaction.id, reason), 'Transaksi di-void'),
    }
    reasonOpen.value = true
  }

  return { busy, reasonOpen, reasonRequest, void: voidTx }
}
