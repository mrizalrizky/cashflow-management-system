import type { TxStatus } from '../generated/prisma/client.js';

/**
 * Aturan "apa yang boleh dilakukan pada sebuah transaksi", tanpa I/O. Di edisi pribadi
 * transaksi langsung dihitung saat disimpan; yang membedakan hanya tercatat atau dibatalkan.
 */

export interface PolicySubject {
  status: TxStatus;
  createdById: string;
  isTransfer: boolean;
  isAdjustment: boolean;
}

export interface TransactionPermissions {
  /** Mengubah isi. */
  canEdit: boolean;
  /** Menambah atau menghapus bukti. */
  canAttach: boolean;
  /** Membatalkan; saldo kembali karena transaksi VOID tidak dihitung. */
  canVoid: boolean;
}

/** Status tempat isi dan bukti transaksi masih boleh diubah. */
export const EDITABLE_STATUSES: readonly TxStatus[] = ['APPROVED'];

export function permissionsFor(tx: PolicySubject): TransactionPermissions {
  const recorded = tx.status === 'APPROVED';
  // Sisi transfer tidak diubah sendiri; hanya dibatalkan bersama pasangannya. Penyesuaian saldo
  // juga tidak diubah: salah ketik dibatalkan, lalu saldonya dicocokkan lagi.
  if (tx.isTransfer || tx.isAdjustment) return { canEdit: false, canAttach: false, canVoid: recorded };
  return { canEdit: recorded, canAttach: recorded, canVoid: recorded };
}
