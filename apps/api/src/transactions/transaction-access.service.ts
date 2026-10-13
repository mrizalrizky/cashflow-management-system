import { Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from '../database/db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { TRANSACTION_INCLUDE, TransactionWithRelations } from './transaction.mapper.js';

export function transactionNotFound(): NotFoundException {
  return new NotFoundException('Transaksi tidak ditemukan');
}

/** Memuat transaksi beserta relasinya, dengan atau tanpa kunci baris. */
@Injectable()
export class TransactionAccessService {
  async load(db: Db, id: string): Promise<TransactionWithRelations> {
    const transaction = await db.transaction.findUnique({ where: { id }, include: TRANSACTION_INCLUDE });
    if (!transaction) throw transactionNotFound();
    return transaction;
  }

  /**
   * Seperti `load`, tetapi mengunci baris transaksi (dan pasangan transfernya, selalu dalam
   * urutan yang sama) sampai transaksi database selesai, supaya perubahan isi, bukti, dan
   * pembatalan tidak saling mendahului.
   */
  async loadForUpdate(tx: Prisma.TransactionClient, id: string): Promise<TransactionWithRelations> {
    await tx.$queryRaw`
      SELECT id FROM transactions
      WHERE id = ${id}
         OR transfer_group_id = (SELECT transfer_group_id FROM transactions WHERE id = ${id})
      ORDER BY id
      FOR UPDATE`;
    return this.load(tx, id);
  }
}
