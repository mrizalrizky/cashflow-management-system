import type { Prisma } from '../generated/prisma/client.js';

/** Satu nomor kunci advisory PostgreSQL per bagian kritis. Jangan pakai ulang sebuah nomor. */
export const LOCKS = {
  /** Perubahan peran dan status aktif user (menjaga SUPER_ADMIN aktif terakhir). */
  userAccess: 7301,
  /** Pembuatan kode proyek berurutan. */
  projectCode: 7302,
  /** Pengecekan nama akun kembar sebelum simpan. */
  accountName: 7303,
  /** Pengecekan nama kategori kembar sebelum simpan. */
  categoryName: 7304,
} as const;

export type LockId = (typeof LOCKS)[keyof typeof LOCKS];

/**
 * Mengambil kunci untuk sisa transaksi ini. Transaksi lain yang meminta kunci yang sama
 * menunggu sampai transaksi ini selesai; kunci dilepas sendiri saat itu.
 */
export async function lockForTransaction(tx: Prisma.TransactionClient, lock: LockId): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lock})`;
}
