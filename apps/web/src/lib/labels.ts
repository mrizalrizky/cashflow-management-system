import type { AccountType, Role, TxStatus, TxType } from '@/api/types'
import { hasOwn } from './changes'

export interface Option<T> {
  value: T
  label: string
}

/** Nama tampilan untuk nilai enum dari API, beserta pilihannya untuk dropdown. */
function labelSet<T extends string>(labels: Record<T, string>) {
  return {
    label: (value: T): string => labels[value],
    options: (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] })),
  }
}

const roles = labelSet<Role>({
  SUPER_ADMIN: 'Super Admin',
  PROJECT_MANAGER: 'Koordinator Proyek',
  STAFF: 'Staf',
})
export const roleLabel = roles.label
export const ROLE_OPTIONS: Option<Role>[] = roles.options

const accountTypes = labelSet<AccountType>({ CASH: 'Kas', BANK: 'Bank' })
export const accountTypeLabel = accountTypes.label
export const ACCOUNT_TYPE_OPTIONS: Option<AccountType>[] = accountTypes.options

const txTypes = labelSet<TxType>({ IN: 'Pemasukan', OUT: 'Pengeluaran' })
export const txTypeLabel = txTypes.label
export const TX_TYPE_OPTIONS: Option<TxType>[] = txTypes.options

const txStatuses = labelSet<TxStatus>({
  APPROVED: 'Tercatat',
  VOID: 'Dibatalkan',
  // Tidak dibuat lagi oleh edisi pribadi; hilang bersama tipenya.
  PENDING: 'Menunggu',
  REJECTED: 'Ditolak',
})
export const txStatusLabel = txStatuses.label
/** Status yang bisa dipilih di filter: hanya yang masih dibuat API. */
export const TX_STATUS_OPTIONS: Option<TxStatus>[] = txStatuses.options.filter(
  (option) => option.value === 'APPROVED' || option.value === 'VOID',
)

/** Warna tag PrimeVue untuk tiap status transaksi. */
export const TX_STATUS_SEVERITY: Record<TxStatus, 'warn' | 'success' | 'danger' | 'secondary'> = {
  PENDING: 'warn',
  APPROVED: 'success',
  REJECTED: 'danger',
  VOID: 'secondary',
}

export const ACTIVE_OPTIONS: Option<boolean>[] = [
  { label: 'Aktif', value: true },
  { label: 'Nonaktif', value: false },
]

/**
 * Nama tampilan untuk nilai yang daftarnya bisa bertambah di API (tindakan dan jenis data di
 * log audit). Nilai yang belum dikenal ditampilkan apa adanya, bukan disembunyikan.
 */
function openLabelSet(labels: Record<string, string>) {
  return {
    label: (value: string): string => (hasOwn(labels, value) ? labels[value]! : value),
    options: Object.entries(labels).map(([value, label]) => ({ value, label })),
  }
}

const auditActions = openLabelSet({
  LOGIN: 'Masuk',
  LOGIN_FAILED: 'Gagal masuk',
  LOGOUT: 'Keluar',
  TOKEN_REUSE: 'Sesi dipakai ulang',
  CHANGE_PASSWORD: 'Mengganti password',
  RESET_PASSWORD: 'Mereset password',
  CREATE: 'Membuat',
  UPDATE: 'Mengubah',
  SET_MEMBERS: 'Mengatur koordinator',
  RESUBMIT: 'Mengajukan lagi',
  CANCEL: 'Membatalkan',
  APPROVE: 'Menyetujui',
  REJECT: 'Menolak',
  VOID: 'Void',
  TRANSFER: 'Transfer antar akun',
  ATTACH: 'Menambah bukti',
  DETACH: 'Menghapus bukti',
  EXPORT: 'Mengekspor',
})
export const auditActionLabel = auditActions.label
export const AUDIT_ACTION_OPTIONS: Option<string>[] = auditActions.options

const auditEntities = openLabelSet({
  transaction: 'Transaksi',
  account: 'Akun',
  category: 'Kategori',
  user: 'Pengguna',
})
export const auditEntityLabel = auditEntities.label
export const AUDIT_ENTITY_OPTIONS: Option<string>[] = auditEntities.options
