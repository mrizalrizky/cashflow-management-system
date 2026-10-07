import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, TxStatus } from '../generated/prisma/client.js';
import { TransactionAccessService } from './transaction-access.service.js';
import {
  toAuditSnapshot,
  toPolicySubject,
  toTransactionResponse,
  TransactionResponse,
  TransactionWithRelations,
} from './transaction.mapper.js';
import { permissionsFor, PolicyActor, TransactionPermissions } from './transaction-policy.js';

export const TRANSACTION_ENTITY = 'transaction';

export function alreadyProcessed(): ConflictException {
  return new ConflictException('Transaksi sudah diproses pengguna lain');
}

export function wrongStatus(action: string): ConflictException {
  return new ConflictException(`Transaksi tidak bisa ${action} pada status ini`);
}

export function notAllowed(action: string): ForbiddenException {
  return new ForbiddenException(`Anda tidak boleh ${action} transaksi ini`);
}

/** Satu langkah perubahan status. */
interface Transition {
  /** Kata kerja untuk pesan, mis. "dibatalkan". */
  verb: string;
  /** Kata kerja aktif untuk pesan larangan, mis. "membatalkan". */
  activeVerb: string;
  from: TxStatus;
  permission: keyof TransactionPermissions;
  audit: AuditAction;
  data: (now: Date) => Prisma.TransactionUncheckedUpdateManyInput;
  /** Syarat tambahan sebelum status diubah, mis. bukti untuk pengeluaran. */
  precondition?: (transaction: TransactionWithRelations) => void;
}

/**
 * Perubahan status transaksi. Tiap langkah punya bentuk yang sama: muat lewat scope (404),
 * tanya policy (403), cek status (409), lalu ubah dengan syarat status belum berubah supaya
 * dari dua orang yang bertindak bersamaan hanya satu yang berhasil.
 */
@Injectable()
export class TransactionWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TransactionAccessService,
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
      data: (now) => ({
        status: 'VOID',
        voided_by_id: user.id,
        voided_at: now,
        void_reason: reason,
      }),
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
      const before = await this.access.loadForUser(tx, actor, id);
      this.assertAllowed(actor, before, step);
      step.precondition?.(before);

      await this.transition(tx, { id }, step.from, step.data(new Date()));

      const after = await this.access.loadForUser(tx, actor, id);
      await this.audit.log(tx, {
        userId: user.id,
        action: step.audit,
        entityType: TRANSACTION_ENTITY,
        entityId: id,
        before: toAuditSnapshot(before),
        after: toAuditSnapshot(after),
        ip,
      });
      return toTransactionResponse(after, actor);
    });
  }

  private assertAllowed(
    actor: PolicyActor,
    transaction: TransactionWithRelations,
    step: Transition,
  ): void {
    const permissions = permissionsFor(actor, toPolicySubject(transaction));
    if (permissions[step.permission]) return;
    // Status yang salah (atau sisi transfer) adalah soal keadaan transaksi, bukan hak pelaku.
    const sameStatusOrdinary = transaction.status === step.from && !transaction.transfer_group_id;
    throw sameStatusOrdinary ? notAllowed(step.activeVerb) : wrongStatus(step.verb);
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
