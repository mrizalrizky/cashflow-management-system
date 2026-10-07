import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { parseCalendarDate } from '../common/calendar-date.js';
import { toMoney } from '../common/money.js';
import { Paginated, paginated, toSkipTake } from '../common/pagination.js';
import { containsText } from '../common/search.js';
import { validationFailed } from '../common/validation.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CreateTransactionDto, ListTransactionsQueryDto } from './dto/transaction.dto.js';
import { TransactionAccessService } from './transaction-access.service.js';
import {
  toTransactionResponse,
  TRANSACTION_INCLUDE,
  TransactionResponse,
} from './transaction.mapper.js';
import { ALL_REFERENCES, assertReferencesValid } from './transaction-references.js';

export const TRANSACTION_ENTITY = 'transaction';

function toWhere(query: ListTransactionsQueryDto): Prisma.TransactionWhereInput {
  if (query.projectId && query.overhead) {
    throw validationFailed([
      { field: 'overhead', messages: ['Tidak bisa digabung dengan filter proyek'] },
    ]);
  }

  const where: Prisma.TransactionWhereInput = {};
  if (query.dateFrom || query.dateTo) {
    where.transaction_date = {
      gte: query.dateFrom ? parseCalendarDate(query.dateFrom) : undefined,
      lte: query.dateTo ? parseCalendarDate(query.dateTo) : undefined,
    };
  }
  if (query.type) where.type = query.type;
  if (query.status) where.status = query.status;
  if (query.accountId) where.account_id = query.accountId;
  if (query.categoryId) where.category_id = query.categoryId;
  if (query.projectId) where.project_id = query.projectId;
  if (query.overhead) where.project_id = null;
  if (query.includeTransfers === false) where.transfer_group_id = null;
  if (query.search) where.description = containsText(query.search);
  return where;
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TransactionAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: AuthUser,
    query: ListTransactionsQueryDto,
  ): Promise<Paginated<TransactionResponse>> {
    const actor = await this.access.actorFor(this.prisma, user);
    // Filter dari klien hanya bisa mempersempit: scope selalu ikut di-AND-kan.
    const where: Prisma.TransactionWhereInput = { AND: [this.access.scope(actor), toWhere(query)] };

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: TRANSACTION_INCLUDE,
        orderBy: [{ transaction_date: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
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
      await this.audit.log(tx, {
        userId: user.id,
        action: 'CREATE',
        entityType: TRANSACTION_ENTITY,
        entityId: created.id,
        after: created,
        ip,
      });
      return toTransactionResponse(await this.access.loadForUser(tx, actor, created.id), actor);
    });
  }
}
