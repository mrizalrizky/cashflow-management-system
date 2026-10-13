import { todayInJakarta } from '../common/calendar-date.js';
import { FieldError, validationFailed } from '../common/validation.js';
import type { Prisma, TxType } from '../generated/prisma/client.js';

/** Isi transaksi yang merujuk data lain, setelah perubahan diterapkan. */
export interface TransactionReferences {
  type: TxType;
  transactionDate: string;
  accountId: string;
  categoryId: string;
}

/** Bagian mana yang baru dipilih (dan karenanya harus masih aktif). Saat membuat, semuanya. */
export interface ChangedReferences {
  account: boolean;
  category: boolean;
}

export const ALL_REFERENCES: ChangedReferences = { account: true, category: true };

function fieldError(field: string, message: string): FieldError {
  return { field, messages: [message] };
}

/**
 * Memeriksa bahwa akun dan kategori yang dipilih sah. Data yang sudah terpasang sebelumnya tidak ditolak hanya karena
 * kini nonaktif; yang selalu dicek adalah kecocokan tipe dengan kategori.
 */
export async function assertReferencesValid(
  tx: Prisma.TransactionClient,
  refs: TransactionReferences,
  changed: ChangedReferences,
): Promise<void> {
  const errors: FieldError[] = [];
  if (refs.transactionDate > todayInJakarta()) {
    errors.push(fieldError('transactionDate', 'Tanggal transaksi tidak boleh di masa depan'));
  }

  if (changed.account) {
    const account = await tx.account.findUnique({ where: { id: refs.accountId } });
    if (!account) errors.push(fieldError('accountId', 'Akun tidak ditemukan'));
    else if (!account.is_active) errors.push(fieldError('accountId', 'Akun sudah tidak aktif'));
  }

  const category = await tx.category.findUnique({ where: { id: refs.categoryId } });
  if (!category) {
    errors.push(fieldError('categoryId', 'Kategori tidak ditemukan'));
  } else if (category.is_system) {
    errors.push(fieldError('categoryId', 'Kategori ini khusus untuk transfer antar akun'));
  } else if (category.type !== refs.type) {
    errors.push(fieldError('categoryId', 'Kategori tidak sesuai dengan tipe transaksi'));
  } else if (changed.category && !category.is_active) {
    errors.push(fieldError('categoryId', 'Kategori sudah tidak aktif'));
  }

  if (errors.length > 0) throw validationFailed(errors);
}

