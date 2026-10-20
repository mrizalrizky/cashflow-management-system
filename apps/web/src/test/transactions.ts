import type {
  AccountOption,
  Attachment,
  Category,
  Installment,
  InstallmentList,
  Paginated,
  Transaction,
  TransactionPermissions,
} from '@/api/types'

/** Data contoh yang dipakai bersama oleh test halaman transaksi. */
export const KAS: AccountOption = { id: 'a-kas', name: 'Kas Kecil', type: 'CASH' }
export const BANK: AccountOption = { id: 'a-bank', name: 'Bank Utama', type: 'BANK' }

export const MATERIAL: Category = { id: 'c-material', name: 'Material', type: 'OUT', isSystem: false, isActive: true, isInstallment: false }
export const UPAH: Category = { id: 'c-upah', name: 'Upah Tukang', type: 'OUT', isSystem: false, isActive: true, isInstallment: false }
export const KREDIT: Category = { id: 'c-kredit', name: 'Kredit', type: 'OUT', isSystem: false, isActive: true, isInstallment: true }
export const TERMIN: Category = { id: 'c-termin', name: 'Termin Klien', type: 'IN', isSystem: false, isActive: true, isInstallment: false }
export const TRANSFER_KELUAR: Category = {
  id: 'c-transfer-out',
  name: 'Transfer Keluar',
  type: 'OUT',
  isSystem: true,
  isActive: true,
  isInstallment: false,
}

export const NO_PERMISSIONS: TransactionPermissions = {
  canEdit: false,
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

/** Pengeluaran staf yang masih menunggu; timpa bagian yang sedang diuji. */
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
    status: 'APPROVED',
    account: { id: KAS.id, name: KAS.name },
    category: { id: MATERIAL.id, name: MATERIAL.name },
    installment: null,
    isTransfer: false,
    transferGroupId: null,
    createdBy: { id: 'u-staf', name: 'Sari' },
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

/** Jawaban daftar cicilan untuk dropdown form transaksi. */
export function installmentList(items: Installment[] = []): InstallmentList {
  return { items, summary: { month: '2026-10', activeMonthlyTotal: '0', unpaid: [], unpaidTotal: '0', remainingTotal: '0' } }
}

export function makeInstallment(overrides: Partial<Installment> = {}): Installment {
  return {
    id: 'i-motor',
    name: 'Motor',
    monthlyAmount: '1500000',
    startMonth: '2026-08',
    endMonth: '2026-10',
    months: 3,
    paid: 1,
    due: 3,
    behindMonths: 2,
    status: 'BEHIND',
    totalAmount: '4500000',
    paidAmount: '1500000',
    remainingAmount: '3000000',
    notes: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}
