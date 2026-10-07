import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountBalanceService } from '../accounts/account-balance.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { fromMoney } from '../common/money.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, TxStatus } from '../generated/prisma/client.js';
import { TransactionAccessService } from './transaction-access.service.js';
import {
  alreadyProcessed,
  assertPermitted,
  assertSeenVersion,
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

/** Hasil menyetujui: admin juga diberi saldo akun sesudahnya, supaya saldo minus bisa diperingatkan. */
export type ApprovalResponse = TransactionResponse & { accountBalance?: string };

/** Satu langkah perubahan status. */
interface Transition extends Omit<GuardedAction, 'statuses'> {
  from: TxStatus;
  audit: AuditAction;
  /** Versi yang dilihat peninjau; lihat `assertSeenVersion`. */
  expectedUpdatedAt?: string;
  data: (now: Date) => Prisma.TransactionUncheckedUpdateManyInput;
  /** Syarat tambahan sebelum status diubah, mis. bukti untuk pengeluaran. */
  precondition?: (transaction: TransactionWithRelations) => void;
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
    private readonly balances: AccountBalanceService,
    private readonly audit: AuditService,
  ) {}

  /** Membatalkan transaksi yang belum diproses. Tidak ada yang dihapus: statusnya menjadi VOID. */
  cancel(user: AuthUser, id: string, reason: string, ip: string | null): Promise<TransactionResponse> {
    return this.run(user, id, ip, {
      verb: 'dibatalkan',
      activeVerb: 'membatalkan',
      from: 'PENDING',
      permission: 'canCancel',
      audit: 'CANCEL',
      data: (now) => voided(user, now, reason),
    });
  }

  async approve(
    user: AuthUser,
    id: string,
    ip: string | null,
    expectedUpdatedAt?: string,
  ): Promise<ApprovalResponse> {
    const approved = await this.run(user, id, ip, {
      verb: 'disetujui',
      activeVerb: 'menyetujui',
      from: 'PENDING',
      permission: 'canReview',
      audit: 'APPROVE',
      expectedUpdatedAt,
      data: (now) => ({ status: 'APPROVED', reviewed_by_id: user.id, reviewed_at: now }),
      precondition: (transaction) => {
        if (transaction.type === 'OUT' && transaction.attachments.length === 0) {
          throw new BadRequestException('Pengeluaran wajib punya bukti sebelum disetujui');
        }
      },
    });
    // Saldo hanya untuk SUPER_ADMIN; peran lain tidak pernah melihat saldo akun.
    if (user.role !== 'SUPER_ADMIN') return approved;
    return { ...approved, accountBalance: await this.balanceOf(approved.account.id) };
  }

  reject(
    user: AuthUser,
    id: string,
    reason: string,
    ip: string | null,
    expectedUpdatedAt?: string,
  ): Promise<TransactionResponse> {
    return this.run(user, id, ip, {
      verb: 'ditolak',
      activeVerb: 'menolak',
      from: 'PENDING',
      permission: 'canReview',
      audit: 'REJECT',
      expectedUpdatedAt,
      data: (now) => ({
        status: 'REJECTED',
        reviewed_by_id: user.id,
        reviewed_at: now,
        reject_reason: reason,
      }),
    });
  }

  /**
   * Membatalkan transaksi yang sudah disetujui; saldo kembali karena hanya APPROVED yang
   * dihitung. Sisi transfer dibatalkan bersama pasangannya.
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
      assertSeenVersion(target, step.expectedUpdatedAt);
      step.precondition?.(target);

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

  private async balanceOf(accountId: string): Promise<string> {
    const account = await this.prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    return fromMoney(await this.balances.balanceOf(this.prisma, account));
  }
}

function voided(
  user: AuthUser,
  now: Date,
  reason: string,
): Prisma.TransactionUncheckedUpdateManyInput {
  return { status: 'VOID', voided_by_id: user.id, voided_at: now, void_reason: reason };
}
