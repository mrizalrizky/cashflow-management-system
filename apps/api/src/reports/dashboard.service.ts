import { Injectable } from '@nestjs/common';
import { AccountBalanceService } from '../accounts/account-balance.service.js';
import type { AccountWithBalance } from '../accounts/account.mapper.js';
import type { AuthUser } from '../auth/auth.types.js';
import { todayInJakarta } from '../common/calendar-date.js';
import { PrismaService } from '../database/prisma.service.js';
import { TransactionAccessService } from '../transactions/transaction-access.service.js';
import {
  toTransactionResponse,
  TRANSACTION_INCLUDE,
  TransactionResponse,
} from '../transactions/transaction.mapper.js';
import { CashflowReportService } from './cashflow-report.service.js';
import { CompanyDashboardResponse, toCompanyDashboard } from './report.mapper.js';
import { resolvePeriod } from './report-period.js';

const RECENT_COUNT = 10;

/** Dashboard perusahaan: saldo saat ini, arus kas pada periode, dan yang perlu diperhatikan. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly report: CashflowReportService,
    private readonly balances: AccountBalanceService,
    private readonly access: TransactionAccessService,
  ) {}

  async company(
    user: AuthUser,
    query: { from?: string; to?: string },
  ): Promise<CompanyDashboardResponse> {
    const period = resolvePeriod(query, todayInJakarta());
    const filter = { period, excludeTransfers: true };

    const [accounts, totals, monthly, expenseByCategory, expenseByScope, recent, pendingCount] =
      await Promise.all([
        this.accountsWithBalance(),
        this.report.totals(this.prisma, filter),
        this.report.monthly(this.prisma, period),
        this.report.expenseByCategory(this.prisma, filter),
        this.report.expenseByScope(this.prisma, period),
        this.recentTransactions(user),
        this.prisma.transaction.count({ where: { status: 'PENDING' } }),
      ]);

    return toCompanyDashboard({
      period,
      accounts,
      totals,
      monthly,
      expenseByCategory,
      expenseByScope,
      recentTransactions: recent,
      pendingCount,
    });
  }

  private async accountsWithBalance(): Promise<AccountWithBalance[]> {
    const accounts = await this.prisma.account.findMany({ orderBy: { name: 'asc' } });
    const balances = await this.balances.balancesOf(this.prisma, accounts);
    return accounts.map((account) => ({
      account,
      balance: balances.get(account.id) ?? account.opening_balance,
    }));
  }

  /** Yang terakhir dicatat, apa pun status dan tanggal transaksinya. */
  private async recentTransactions(user: AuthUser): Promise<TransactionResponse[]> {
    const actor = await this.access.actorFor(this.prisma, user);
    const transactions = await this.prisma.transaction.findMany({
      where: this.access.scope(actor),
      include: TRANSACTION_INCLUDE,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: RECENT_COUNT,
    });
    return transactions.map((transaction) => toTransactionResponse(transaction, actor));
  }
}
