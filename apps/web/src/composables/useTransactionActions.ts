import { ref, type Ref } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { ApiError } from '@/api/http'
import {
  approveTransaction,
  cancelTransaction,
  rejectTransaction,
  voidTransaction,
} from '@/api/transactions'
import type { Transaction } from '@/api/types'
import { txTypeLabel } from '@/lib/labels'
import { formatRupiah } from '@/lib/money'
import { negativeBalanceWarning } from '@/lib/transactions'
import { useNotify } from './useNotify'

export const TRANSFER_VOID_NOTE =
  'Bagian dari transfer antar akun. Void akan membatalkan kedua sisinya.'
const CHANGED = 'Transaksi berubah sejak Anda membukanya. Periksa lagi sebelum memproses.'
const PROCESSED = 'Transaksi sudah diproses pengguna lain'

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
  /** Memuat ulang transaksi yang ternyata sudah berubah; null bila tidak bisa dimuat. */
  refresh: () => Promise<Transaction | null>
}

export interface TransactionActions {
  /** True selagi sebuah tindakan berjalan; semua tombol tindakan dimatikan. */
  busy: Ref<boolean>
  /** Untuk `v-model:visible` dan props `ReasonDialog`. */
  reasonOpen: Ref<boolean>
  reasonRequest: Ref<ReasonRequest | null>
  approve(transaction: Transaction): void
  reject(transaction: Transaction): void
  cancel(transaction: Transaction): void
  void(transaction: Transaction): void
}

/**
 * Menyetujui, menolak, membatalkan dan void sebuah transaksi, dengan konfirmasi, alasan dan
 * pesan yang seragam. Halaman pemakainya memasang satu `ReasonDialog` dan menampilkan tombol
 * sesuai `permissions` transaksi.
 */
export function useTransactionActions(options: TransactionActionsOptions): TransactionActions {
  const confirm = useConfirm()
  const notify = useNotify()
  const busy = ref(false)
  const reasonOpen = ref(false)
  const reasonRequest = ref<ReasonRequest | null>(null)

  /** 409: transaksi sudah bukan seperti yang dilihat pengguna. Tampilkan yang terbaru. */
  async function showLatest(seen: Transaction): Promise<void> {
    const latest = await options.refresh()
    notify.warn(latest && latest.status !== seen.status ? PROCESSED : CHANGED)
  }

  /**
   * Menjalankan satu tindakan. Mengembalikan hasilnya, atau null bila transaksi ternyata
   * sudah berubah (sudah ditangani). Kegagalan lain dilempar ke pemanggil.
   */
  async function run<T extends Transaction>(
    seen: Transaction,
    call: () => Promise<T>,
    done: string,
  ): Promise<T | null> {
    busy.value = true
    try {
      const result = await call()
      options.onChanged(result)
      notify.success(done)
      return result
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.statusCode !== 409) throw cause
      await showLatest(seen)
      return null
    } finally {
      busy.value = false
    }
  }

  function askReason(request: ReasonRequest): void {
    reasonRequest.value = request
    reasonOpen.value = true
  }

  function approve(transaction: Transaction): void {
    const { id, type, amount, description, updatedAt } = transaction
    confirm.require({
      header: 'Setujui transaksi',
      message: `Setujui ${txTypeLabel(type).toLowerCase()} ${formatRupiah(amount)} untuk "${description}"?`,
      acceptLabel: 'Setujui',
      rejectLabel: 'Batal',
      rejectProps: { severity: 'secondary', variant: 'text' },
      accept: async () => {
        try {
          const approved = await run(
            transaction,
            () => approveTransaction(id, updatedAt),
            'Transaksi disetujui',
          )
          const warning = approved && negativeBalanceWarning(approved)
          if (warning) notify.warn(warning)
        } catch (cause) {
          notify.error(cause, 'Gagal menyetujui transaksi')
        }
      },
    })
  }

  function reject(transaction: Transaction): void {
    askReason({
      title: 'Tolak transaksi',
      label: 'Alasan penolakan',
      confirmLabel: 'Tolak',
      submit: (reason) =>
        run(
          transaction,
          () => rejectTransaction(transaction.id, reason, transaction.updatedAt),
          'Transaksi ditolak',
        ),
    })
  }

  function cancel(transaction: Transaction): void {
    askReason({
      title: 'Batalkan transaksi',
      label: 'Alasan pembatalan',
      confirmLabel: 'Batalkan transaksi',
      submit: (reason) =>
        run(transaction, () => cancelTransaction(transaction.id, reason), 'Transaksi dibatalkan'),
    })
  }

  function voidTx(transaction: Transaction): void {
    askReason({
      title: 'Void transaksi',
      label: 'Alasan void',
      confirmLabel: 'Void',
      note: transaction.isTransfer
        ? TRANSFER_VOID_NOTE
        : 'Transaksi yang sudah disetujui dibatalkan dan saldo akun dikembalikan.',
      submit: (reason) =>
        run(transaction, () => voidTransaction(transaction.id, reason), 'Transaksi di-void'),
    })
  }

  return { busy, reasonOpen, reasonRequest, approve, reject, cancel, void: voidTx }
}
