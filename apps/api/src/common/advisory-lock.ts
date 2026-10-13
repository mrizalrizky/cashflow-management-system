import type { Prisma } from '../generated/prisma/client.js';

/** Satu nomor kunci advisory PostgreSQL per bagian kritis. Jangan pakai ulang sebuah nomor. */
export const LOCKS = {
  // 7301 dulu dipakai perubahan peran user (edisi perusahaan); jangan dipakai ulang.
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
