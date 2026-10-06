import type { Prisma } from '../generated/prisma/client.js';

/** Satu nomor kunci advisory PostgreSQL per bagian kritis. Jangan pakai ulang sebuah nomor. */
export const LOCKS = {
  /** Perubahan peran dan status aktif user (menjaga SUPER_ADMIN aktif terakhir). */
  userAccess: 7301,
  /** Pembuatan kode proyek berurutan. */
  projectCode: 7302,
} as const;

export type LockId = (typeof LOCKS)[keyof typeof LOCKS];

/**
 * Menyerikan transaksi yang mengambil kunci yang sama: transaksi kedua menunggu sampai
 * yang pertama selesai. Kunci dilepas sendiri saat transaksi berakhir.
 */
export async function withLock(tx: Prisma.TransactionClient, lock: LockId): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lock})`;
}
