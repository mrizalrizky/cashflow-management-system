import { Injectable } from '@nestjs/common';
import { AccountBalanceService } from '../accounts/account-balance.service.js';
import type { AccountWithBalance } from '../accounts/account.mapper.js';
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

/** Dashboard: saldo saat ini dan arus kas pada periode. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly report: CashflowReportService,
    private readonly balances: AccountBalanceService,
    private readonly access: TransactionAccessService,
  ) {}

  async company(query: { from?: string; to?: string }): Promise<CompanyDashboardResponse> {
    const period = resolvePeriod(query, todayInJakarta());
    const filter = { period, excludeInternal: true };

    const [accounts, totals, monthly, expenseByCategory, recent] =
      await Promise.all([
        this.accountsWithBalance(),
        this.report.totals(this.prisma, filter),
        this.report.monthly(this.prisma, period),
        this.report.expenseByCategory(this.prisma, filter),
        this.recentTransactions(),
      ]);

    return toCompanyDashboard({
      period,
      accounts,
      totals,
      monthly,
      expenseByCategory,
      recentTransactions: recent,
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
  private async recentTransactions(): Promise<TransactionResponse[]> {
    const transactions = await this.prisma.transaction.findMany({
      include: TRANSACTION_INCLUDE,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: RECENT_COUNT,
    });
    return transactions.map((transaction) => toTransactionResponse(transaction));
  }
}
