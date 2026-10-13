import { validationFailed } from '../common/validation.js';
import type { Category, Prisma, TxType } from '../generated/prisma/client.js';
import { lockInstallment, paidCount } from '../installments/installment-lock.js';

function linkError(message: string) {
  return validationFailed([{ field: 'installmentId', messages: [message] }]);
}

export interface InstallmentLinkInput {
  type: TxType;
  /** Kategori akhir transaksi, setelah perubahan. */
  category: Category;
  /** Dari permintaan: undefined berarti tidak diubah. */
  requested: string | null | undefined;
  /** Tautan yang tersimpan sekarang; null untuk transaksi baru. */
  current: string | null;
  /** Transaksi yang diubah, supaya tidak ikut dihitung sebagai pembayaran lain. */
  transactionId?: string;
}

/**
 * Menentukan cicilan yang dibayar transaksi ini setelah perubahan (spec P2, aturan 1, 3, 9):
 * kategori cicilan wajib bertaut; kategori lain tidak boleh, dan tautan lamanya dilepas.
 * Cicilan yang dipilih dikunci lebih dulu, supaya hitungan "sudah lunas" tidak berbalapan.
 */
export async function resolveInstallmentLink(
  tx: Prisma.TransactionClient,
  input: InstallmentLinkInput,
): Promise<string | null> {
  const needsLink = input.type === 'OUT' && input.category.is_installment;
  if (!needsLink) {
    if (input.requested) throw linkError('Hanya transaksi berkategori cicilan yang bisa ditautkan ke cicilan');
    return null;
  }

  const chosen = input.requested === undefined ? input.current : input.requested;
  if (!chosen) throw linkError('Pilih cicilan yang dibayar');

  const installment = await lockInstallment(tx, chosen);
  if (!installment) throw linkError('Cicilan tidak ditemukan');
  // Transaksi yang sudah tertaut ke cicilan ini tetap boleh diubah walau cicilannya lunas.
  if (chosen !== input.current) {
    const paid = await paidCount(tx, chosen, input.transactionId);
    if (paid >= installment.months) throw linkError('Cicilan ini sudah lunas');
  }
  return chosen;
}
