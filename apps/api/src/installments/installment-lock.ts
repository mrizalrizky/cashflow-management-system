import type { Db } from '../database/db.js';
import type { Installment, Prisma } from '../generated/prisma/client.js';

/**
 * Mengunci baris cicilan sampai transaksi database selesai. Semua yang menghitung pembayaran
 * lalu menulis (bayar, ubah jumlah bulan, hapus) mengambil kunci ini lebih dulu, supaya dua
 * pembayaran bulan terakhir tidak sama-sama lolos.
 */
export async function lockInstallment(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<Installment | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM installments WHERE id = ${id} FOR UPDATE`;
  return rows.length === 0 ? null : tx.installment.findUnique({ where: { id } });
}

/** Jumlah rupiah pembayaran yang dihitung (tidak VOID) untuk satu cicilan. */
export async function paidAmount(db: Db, id: string): Promise<bigint> {
  const sum = await db.transaction.aggregate({
    where: { installment_id: id, status: { not: 'VOID' } },
    _sum: { amount: true },
  });
  return sum._sum.amount ?? 0n;
}

/** Pembayaran yang dihitung: transaksi tertaut yang tidak VOID, selain transaksi yang dikecualikan. */
export function paidCount(db: Db, id: string, exceptTransactionId?: string): Promise<number> {
  return db.transaction.count({
    where: {
      installment_id: id,
      status: { not: 'VOID' },
      id: exceptTransactionId ? { not: exceptTransactionId } : undefined,
    },
  });
}
