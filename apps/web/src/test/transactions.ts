import type {
  AccountOption,
  Attachment,
  Category,
  Paginated,
  ProjectOption,
  Transaction,
  TransactionPermissions,
} from '@/api/types'

/** Data contoh yang dipakai bersama oleh test halaman transaksi. */
export const KAS: AccountOption = { id: 'a-kas', name: 'Kas Kecil', type: 'CASH' }
export const BANK: AccountOption = { id: 'a-bank', name: 'Bank Utama', type: 'BANK' }
export const RUMAH: ProjectOption = { id: 'p-rumah', code: 'PRJ-2026-001', name: 'Rumah Pak Budi' }
export const KAFE: ProjectOption = { id: 'p-kafe', code: 'PRJ-2026-002', name: 'Interior Kafe' }

export const MATERIAL: Category = { id: 'c-material', name: 'Material', type: 'OUT', isSystem: false, isActive: true }
export const UPAH: Category = { id: 'c-upah', name: 'Upah Tukang', type: 'OUT', isSystem: false, isActive: true }
export const TERMIN: Category = { id: 'c-termin', name: 'Termin Klien', type: 'IN', isSystem: false, isActive: true }
export const TRANSFER_KELUAR: Category = {
  id: 'c-transfer-out',
  name: 'Transfer Keluar',
  type: 'OUT',
  isSystem: true,
  isActive: true,
}

export const NO_PERMISSIONS: TransactionPermissions = {
  canEdit: false,
  canCancel: false,
  canReview: false,
  canVoid: false,
  canAttach: false,
}

export function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'f-nota',
    fileName: 'nota.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 348_160,
    createdAt: '2026-10-01T03:05:00.000Z',
    ...overrides,
  }
}

/** Pengeluaran staf di proyek Rumah yang masih menunggu; timpa bagian yang sedang diuji. */
export function makeTransaction(
  overrides: Partial<Omit<Transaction, 'permissions'>> & {
    permissions?: Partial<TransactionPermissions>
  } = {},
): Transaction {
  const { permissions, ...rest } = overrides
  return {
    id: 't-semen',
    type: 'OUT',
    amount: '150000',
    transactionDate: '2026-10-01',
    description: 'Beli semen',
    status: 'PENDING',
    account: { id: KAS.id, name: KAS.name },
    category: { id: MATERIAL.id, name: MATERIAL.name },
    project: RUMAH,
    isTransfer: false,
    transferGroupId: null,
    createdBy: { id: 'u-staf', name: 'Sari' },
    reviewedBy: null,
    reviewedAt: null,
    rejectReason: null,
    voidedBy: null,
    voidedAt: null,
    voidReason: null,
    attachments: [],
    createdAt: '2026-10-01T03:00:00.000Z',
    updatedAt: '2026-10-01T03:00:00.000Z',
    ...rest,
    permissions: { ...NO_PERMISSIONS, ...permissions },
  }
}

export function pageOf<T>(items: T[], total = items.length): Paginated<T> {
  return { data: items, meta: { page: 1, pageSize: 20, total } }
}
