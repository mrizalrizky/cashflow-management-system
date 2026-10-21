import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountBalanceService } from '../accounts/account-balance.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { systemCategoryId } from '../categories/system-categories.js';
import { parseCalendarDate, todayInJakarta } from '../common/calendar-date.js';
import { fromMoney, toMoney } from '../common/money.js';
import { PrismaService } from '../database/prisma.service.js';
import type { ReconcileDto } from './dto/transaction.dto.js';
import { TransactionAccessService } from './transaction-access.service.js';
import { TRANSACTION_ENTITY } from './transaction-guards.js';
import { toAuditSnapshot, toTransactionResponse, TransactionResponse } from './transaction.mapper.js';

export interface ReconcileResponse {
  previousBalance: string;
  actualBalance: string;
  /** Saldo sebenarnya dikurangi saldo tercatat; negatif berarti ada pengeluaran yang terlewat. */
  difference: string;
  /** Penyesuaian yang dicatat; null bila saldonya sudah cocok. */
  transaction: TransactionResponse | null;
}

const DEFAULT_DESCRIPTION = 'Penyesuaian saldo';

/**
 * "Cocokkan saldo": pemilik mengetik saldo sebenarnya sebuah akun, dan selisihnya dicatat sebagai
 * satu transaksi berkategori sistem (Selisih Masuk atau Selisih Keluar) bertanggal hari ini.
 * Saldo akun ikut berubah, tetapi dasbor tidak menghitungnya sebagai pemasukan atau pengeluaran.
 */
@Injectable()
export class ReconcileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: AccountBalanceService,
    private readonly access: TransactionAccessService,
    private readonly audit: AuditService,
  ) {}

  reconcile(user: AuthUser, accountId: string, dto: ReconcileDto, ip: string | null): Promise<ReconcileResponse> {
    return this.prisma.$transaction(async (tx) => {
      // Dikunci supaya dua pencocokan bersamaan tidak sama-sama mencatat selisih yang sama.
      await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${accountId} FOR UPDATE`;
      const account = await tx.account.findUnique({ where: { id: accountId } });
      if (!account) throw new NotFoundException('Akun tidak ditemukan');
      if (!account.is_active) throw new BadRequestException('Akun sudah tidak aktif');

      const previous = await this.balances.balanceOf(tx, account);
      const actual = toMoney(dto.actualBalance);
      const difference = actual - previous;
      const result = {
        previousBalance: fromMoney(previous),
        actualBalance: fromMoney(actual),
        difference: fromMoney(difference),
      };
      if (difference === 0n) return { ...result, transaction: null };

      const type = difference < 0n ? 'OUT' : 'IN';
      const created = await tx.transaction.create({
        data: {
          type,
          amount: difference < 0n ? -difference : difference,
          transaction_date: parseCalendarDate(todayInJakarta()),
          description: dto.description ?? DEFAULT_DESCRIPTION,
          account_id: account.id,
          category_id: await systemCategoryId(tx, type, 'adjustment'),
          status: 'APPROVED',
          created_by_id: user.id,
        },
      });
      const transaction = await this.access.load(tx, created.id);
      await this.audit.log(tx, {
        userId: user.id,
        action: 'ADJUST',
        entityType: TRANSACTION_ENTITY,
        entityId: created.id,
        after: { ...toAuditSnapshot(transaction), previous_balance: previous, actual_balance: actual },
        ip,
      });
      return { ...result, transaction: toTransactionResponse(transaction) };
    });
  }
}
