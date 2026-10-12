import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import type { Db } from '../database/db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { TRANSACTION_INCLUDE, TransactionWithRelations } from './transaction.mapper.js';
import type { PolicyActor } from './transaction-policy.js';

export function transactionNotFound(): NotFoundException {
  return new NotFoundException('Transaksi tidak ditemukan');
}

const NOTHING: Prisma.TransactionWhereInput = { id: { in: [] } };

/**
 * Satu-satunya tempat aturan "transaksi mana yang boleh dilihat siapa". Setiap daftar dan
 * setiap pengambilan per id melewati `scope`, sehingga transaksi di luar jangkauan dijawab
 * sama seperti transaksi yang tidak ada.
 */
@Injectable()
export class TransactionAccessService {
  /** Pelaku sebuah request. */
  actorFor(_db: Db, user: AuthUser): Promise<PolicyActor> {
    return Promise.resolve({ id: user.id, role: user.role });
  }

  scope(actor: PolicyActor): Prisma.TransactionWhereInput {
    switch (actor.role) {
      case 'SUPER_ADMIN':
        return {};
      case 'PROJECT_MANAGER':
      case 'STAFF':
        return { created_by_id: actor.id };
      default:
        return NOTHING;
    }
  }

  async loadForUser(db: Db, actor: PolicyActor, id: string): Promise<TransactionWithRelations> {
    const transaction = await db.transaction.findFirst({
      where: { AND: [{ id }, this.scope(actor)] },
      include: TRANSACTION_INCLUDE,
    });
    if (!transaction) throw transactionNotFound();
    return transaction;
  }

  /**
   * Seperti `loadForUser`, tetapi mengunci baris transaksi sampai transaksi database selesai.
   * Dipakai sebelum mengubah status atau bukti, supaya keduanya tidak saling mendahului
   * (mis. bukti terakhir dihapus tepat saat pengeluaran disetujui). Untuk sisi transfer,
   * pasangannya ikut dikunci, selalu dalam urutan yang sama, supaya dua orang yang
   * membatalkan sisi berbeda saling menunggu dan tidak saling mengunci (deadlock).
   */
  async loadForUpdate(
    tx: Prisma.TransactionClient,
    actor: PolicyActor,
    id: string,
  ): Promise<TransactionWithRelations> {
    await tx.$queryRaw`
      SELECT id FROM transactions
      WHERE id = ${id}
         OR transfer_group_id = (SELECT transfer_group_id FROM transactions WHERE id = ${id})
      ORDER BY id
      FOR UPDATE`;
    return this.loadForUser(tx, actor, id);
  }
}
