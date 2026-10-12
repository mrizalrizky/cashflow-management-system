import { Injectable } from '@nestjs/common';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, TxStatus } from '../generated/prisma/client.js';
import { TransactionAccessService } from './transaction-access.service.js';
import {
  alreadyProcessed,
  assertPermitted,
  GuardedAction,
  TRANSACTION_ENTITY,
} from './transaction-guards.js';
import {
  toAuditSnapshot,
  toTransactionResponse,
  TRANSACTION_INCLUDE,
  TransactionResponse,
  TransactionWithRelations,
} from './transaction.mapper.js';

/** Satu langkah perubahan status. */
interface Transition extends Omit<GuardedAction, 'statuses'> {
  from: TxStatus;
  audit: AuditAction;
  data: (now: Date) => Prisma.TransactionUncheckedUpdateManyInput;
}

/**
 * Perubahan status transaksi. Tiap langkah punya bentuk yang sama: kunci dan muat lewat
 * scope (404), tanya policy (403), cek status (409), lalu ubah dengan syarat status belum
 * berubah, supaya dari dua orang yang bertindak bersamaan hanya satu yang berhasil.
 */
@Injectable()
export class TransactionWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TransactionAccessService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Membatalkan transaksi yang tercatat; saldo kembali karena hanya APPROVED yang dihitung. Sisi transfer dibatalkan bersama pasangannya.
   */
  void(user: AuthUser, id: string, reason: string, ip: string | null): Promise<TransactionResponse> {
    return this.run(user, id, ip, {
      verb: 'dibatalkan (void)',
      activeVerb: 'membatalkan',
      from: 'APPROVED',
      permission: 'canVoid',
      audit: 'VOID',
      data: (now) => voided(user, now, reason),
    });
  }

  private run(
    user: AuthUser,
    id: string,
    ip: string | null,
    step: Transition,
  ): Promise<TransactionResponse> {
    return this.prisma.$transaction(async (tx) => {
      const actor = await this.access.actorFor(tx, user);
      const target = await this.access.loadForUpdate(tx, actor, id);
      assertPermitted(actor, target, { ...step, statuses: [step.from] });

      // Transfer diproses sebagai satu kesatuan: semua sisinya berubah, atau tidak sama sekali.
      const affected = await this.withTransferSiblings(tx, target);
      const where = target.transfer_group_id
        ? { transfer_group_id: target.transfer_group_id }
        : { id };
      await this.transition(tx, where, step.from, step.data(new Date()), affected.length);

      for (const before of affected) {
        const after = await tx.transaction.findUniqueOrThrow({
          where: { id: before.id },
          include: TRANSACTION_INCLUDE,
        });
        await this.audit.log(tx, {
          userId: user.id,
          action: step.audit,
          entityType: TRANSACTION_ENTITY,
          entityId: before.id,
          before: toAuditSnapshot(before),
          after: toAuditSnapshot(after),
          ip,
        });
      }
      return toTransactionResponse(await this.access.loadForUser(tx, actor, id), actor);
    });
  }

  private async withTransferSiblings(
    tx: Prisma.TransactionClient,
    transaction: TransactionWithRelations,
  ): Promise<TransactionWithRelations[]> {
    if (!transaction.transfer_group_id) return [transaction];
    return tx.transaction.findMany({
      where: { transfer_group_id: transaction.transfer_group_id },
      include: TRANSACTION_INCLUDE,
      orderBy: { id: 'asc' },
    });
  }

  /** Mengubah status hanya bila masih `from`; kalau tidak, orang lain sudah lebih dulu. */
  async transition(
    tx: Prisma.TransactionClient,
    where: Prisma.TransactionWhereInput,
    from: TxStatus,
    data: Prisma.TransactionUncheckedUpdateManyInput,
    expectedRows = 1,
  ): Promise<void> {
    const { count } = await tx.transaction.updateMany({ where: { ...where, status: from }, data });
    if (count !== expectedRows) throw alreadyProcessed();
  }
}

function voided(
  user: AuthUser,
  now: Date,
  reason: string,
): Prisma.TransactionUncheckedUpdateManyInput {
  return { status: 'VOID', voided_by_id: user.id, voided_at: now, void_reason: reason };
}
