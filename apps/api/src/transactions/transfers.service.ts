import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { parseCalendarDate, todayInJakarta } from '../common/calendar-date.js';
import { toMoney } from '../common/money.js';
import { FieldError, validationFailed } from '../common/validation.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, TxType } from '../generated/prisma/client.js';
import type { TransferDto } from './dto/transaction.dto.js';
import { TransactionAccessService } from './transaction-access.service.js';
import { toTransactionResponse, TransactionResponse } from './transaction.mapper.js';
import { TRANSACTION_ENTITY } from './transaction-workflow.service.js';

/**
 * Transfer antar akun dicatat sebagai dua transaksi APPROVED yang terhubung lewat
 * `transfer_group_id`: keluar di akun asal dan masuk di akun tujuan, masing-masing dengan
 * kategori sistemnya. Keduanya dibuat dalam satu transaksi database; pembatalannya
 * (void) ditangani TransactionWorkflowService untuk kedua sisi sekaligus.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TransactionAccessService,
    private readonly audit: AuditService,
  ) {}

  /** Mengembalikan kedua sisi: keluar dulu, lalu masuk. */
  async create(user: AuthUser, dto: TransferDto, ip: string | null): Promise<TransactionResponse[]> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertValid(tx, dto);
      const [outCategoryId, inCategoryId] = await Promise.all([
        this.systemCategoryId(tx, 'OUT'),
        this.systemCategoryId(tx, 'IN'),
      ]);

      const now = new Date();
      const shared = {
        amount: toMoney(dto.amount),
        transaction_date: parseCalendarDate(dto.transactionDate),
        description: dto.description,
        status: 'APPROVED',
        transfer_group_id: randomUUID(),
        created_by_id: user.id,
        reviewed_by_id: user.id,
        reviewed_at: now,
      } as const;
      const out = await tx.transaction.create({
        data: { ...shared, type: 'OUT', account_id: dto.fromAccountId, category_id: outCategoryId },
      });
      const incoming = await tx.transaction.create({
        data: { ...shared, type: 'IN', account_id: dto.toAccountId, category_id: inCategoryId },
      });

      await this.audit.log(tx, {
        userId: user.id,
        action: 'TRANSFER',
        entityType: TRANSACTION_ENTITY,
        entityId: out.id,
        after: {
          transfer_group_id: shared.transfer_group_id,
          out_transaction_id: out.id,
          in_transaction_id: incoming.id,
          from_account_id: dto.fromAccountId,
          to_account_id: dto.toAccountId,
          amount: shared.amount,
          transaction_date: dto.transactionDate,
          description: dto.description,
        },
        ip,
      });

      const actor = await this.access.actorFor(tx, user);
      return Promise.all(
        [out.id, incoming.id].map(async (id) =>
          toTransactionResponse(await this.access.loadForUser(tx, actor, id), actor),
        ),
      );
    });
  }

  private async assertValid(tx: Prisma.TransactionClient, dto: TransferDto): Promise<void> {
    const errors: FieldError[] = [];
    if (dto.transactionDate > todayInJakarta()) {
      errors.push({ field: 'transactionDate', messages: ['Tanggal transaksi tidak boleh di masa depan'] });
    }
    if (dto.fromAccountId === dto.toAccountId) {
      errors.push({ field: 'toAccountId', messages: ['Akun tujuan harus berbeda dari akun asal'] });
    }
    for (const field of ['fromAccountId', 'toAccountId'] as const) {
      const account = await tx.account.findUnique({ where: { id: dto[field] } });
      if (!account) errors.push({ field, messages: ['Akun tidak ditemukan'] });
      else if (!account.is_active) errors.push({ field, messages: ['Akun sudah tidak aktif'] });
    }
    if (errors.length > 0) throw validationFailed(errors);
  }

  /** Kategori sistem dibuat oleh seed; tanpa itu aplikasi salah pasang, bukan salah input. */
  private async systemCategoryId(tx: Prisma.TransactionClient, type: TxType): Promise<string> {
    const category = await tx.category.findFirst({ where: { is_system: true, type } });
    if (!category) {
      throw new Error(`Kategori sistem untuk transfer (${type}) tidak ada; jalankan seed.`);
    }
    return category.id;
  }
}
