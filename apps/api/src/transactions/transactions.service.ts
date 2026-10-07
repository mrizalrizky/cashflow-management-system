import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { formatCalendarDate, parseCalendarDate } from '../common/calendar-date.js';
import { toMoney } from '../common/money.js';
import { Paginated, paginated, toSkipTake } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  CreateTransactionDto,
  ListTransactionsQueryDto,
  UpdateTransactionDto,
} from './dto/transaction.dto.js';
import { TransactionAccessService } from './transaction-access.service.js';
import { TRANSACTION_LIST_ORDER, toTransactionWhere } from './transaction-filters.js';
import { assertPermitted, TRANSACTION_ENTITY } from './transaction-guards.js';
import {
  toAuditSnapshot,
  toTransactionResponse,
  TRANSACTION_INCLUDE,
  TransactionResponse,
} from './transaction.mapper.js';
import { EDITABLE_STATUSES } from './transaction-policy.js';
import { ALL_REFERENCES, assertReferencesValid } from './transaction-references.js';
import { TransactionWorkflowService } from './transaction-workflow.service.js';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TransactionAccessService,
    private readonly workflow: TransactionWorkflowService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: AuthUser,
    query: ListTransactionsQueryDto,
  ): Promise<Paginated<TransactionResponse>> {
    const actor = await this.access.actorFor(this.prisma, user);
    // Filter dari klien hanya bisa mempersempit: scope selalu ikut di-AND-kan.
    const where: Prisma.TransactionWhereInput = {
      AND: [this.access.scope(actor), toTransactionWhere(query)],
    };

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: TRANSACTION_INCLUDE,
        orderBy: TRANSACTION_LIST_ORDER,
        ...toSkipTake(query),
      }),
      this.prisma.transaction.count({ where }),
    ]);
    const items = transactions.map((transaction) => toTransactionResponse(transaction, actor));
    return paginated(items, total, query);
  }

  async get(user: AuthUser, id: string): Promise<TransactionResponse> {
    const actor = await this.access.actorFor(this.prisma, user);
    return toTransactionResponse(await this.access.loadForUser(this.prisma, actor, id), actor);
  }

  /** Transaksi baru selalu PENDING, siapa pun pembuatnya. */
  async create(
    user: AuthUser,
    dto: CreateTransactionDto,
    ip: string | null,
  ): Promise<TransactionResponse> {
    return this.prisma.$transaction(async (tx) => {
      const actor = await this.access.actorFor(tx, user);
      const projectId = dto.projectId ?? null;
      await assertReferencesValid(
        tx,
        actor,
        {
          type: dto.type,
          transactionDate: dto.transactionDate,
          accountId: dto.accountId,
          categoryId: dto.categoryId,
          projectId,
        },
        ALL_REFERENCES,
      );

      const created = await tx.transaction.create({
        data: {
          type: dto.type,
          amount: toMoney(dto.amount),
          transaction_date: parseCalendarDate(dto.transactionDate),
          description: dto.description,
          account_id: dto.accountId,
          category_id: dto.categoryId,
          project_id: projectId,
          created_by_id: user.id,
        },
      });
      const transaction = await this.access.loadForUser(tx, actor, created.id);
      await this.audit.log(tx, {
        userId: user.id,
        action: 'CREATE',
        entityType: TRANSACTION_ENTITY,
        entityId: created.id,
        after: toAuditSnapshot(transaction),
        ip,
      });
      return toTransactionResponse(transaction, actor);
    });
  }

  /**
   * Mengubah transaksi yang belum disetujui. Transaksi REJECTED yang diubah kembali menjadi
   * PENDING (diajukan ulang), walau isinya tidak diubah.
   */
  async update(
    user: AuthUser,
    id: string,
    dto: UpdateTransactionDto,
    ip: string | null,
  ): Promise<TransactionResponse> {
    return this.prisma.$transaction(async (tx) => {
      const actor = await this.access.actorFor(tx, user);
      const before = await this.access.loadForUpdate(tx, actor, id);

      assertPermitted(actor, before, {
        permission: 'canEdit',
        statuses: EDITABLE_STATUSES,
        verb: 'diubah',
        activeVerb: 'mengubah',
      });

      // Aturan yang sama dengan saat membuat, diterapkan pada hasil akhirnya.
      const projectId = dto.projectId === undefined ? before.project_id : dto.projectId;
      await assertReferencesValid(
        tx,
        actor,
        {
          type: dto.type ?? before.type,
          transactionDate: dto.transactionDate ?? formatCalendarDate(before.transaction_date),
          accountId: dto.accountId ?? before.account_id,
          categoryId: dto.categoryId ?? before.category_id,
          projectId,
        },
        {
          account: dto.accountId !== undefined && dto.accountId !== before.account_id,
          category: dto.categoryId !== undefined && dto.categoryId !== before.category_id,
          project: projectId !== before.project_id,
        },
      );

      await this.workflow.transition(tx, { id }, before.status, {
        type: dto.type,
        amount: dto.amount === undefined ? undefined : toMoney(dto.amount),
        transaction_date:
          dto.transactionDate === undefined ? undefined : parseCalendarDate(dto.transactionDate),
        description: dto.description,
        account_id: dto.accountId,
        category_id: dto.categoryId,
        project_id: projectId,
        status: 'PENDING',
        reviewed_by_id: null,
        reviewed_at: null,
        reject_reason: null,
      });

      const after = await this.access.loadForUser(tx, actor, id);
      await this.audit.log(tx, {
        userId: user.id,
        action: before.status === 'REJECTED' ? 'RESUBMIT' : 'UPDATE',
        entityType: TRANSACTION_ENTITY,
        entityId: id,
        before: toAuditSnapshot(before),
        after: toAuditSnapshot(after),
        ip,
      });
      return toTransactionResponse(after, actor);
    });
  }
}
