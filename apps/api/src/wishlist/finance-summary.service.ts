import { Injectable } from '@nestjs/common';
import { AccountBalanceService } from '../accounts/account-balance.service.js';
import { addMonths, formatCalendarMonth, lastDayOf, todayInJakarta } from '../common/calendar-date.js';
import { fromMoney } from '../common/money.js';
import { PrismaService } from '../database/prisma.service.js';
import { CashflowReportService } from '../reports/cashflow-report.service.js';
import type { FinanceSummary } from './finance-summary.js';

const AVERAGE_MONTHS = 3;

/**
 * Ringkasan keuangan untuk penilaian wishlist. Sengaja hanya angka total: tidak ada transaksi,
 * keterangan, nama akun, kategori, cicilan, atau bukti yang ikut.
 */
@Injectable()
export class FinanceSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: AccountBalanceService,
    private readonly reports: CashflowReportService,
  ) {}

  async summarize(today: string = todayInJakarta()): Promise<FinanceSummary> {
    const accounts = await this.prisma.account.findMany({ where: { is_active: true } });
    const balances = await this.balances.balancesOf(this.prisma, accounts);
    const totalBalance = [...balances.values()].reduce((sum, value) => sum + value, 0n);

    // Tiga bulan kalender penuh sebelum bulan berjalan.
    const thisMonth = today.slice(0, 7);
    const months = Array.from({ length: AVERAGE_MONTHS }, (_unused, i) => addMonths(thisMonth, i - AVERAGE_MONTHS));
    const period = { from: `${months[0]}-01`, to: lastDayOf(months[AVERAGE_MONTHS - 1]!) };
    const totals = await this.reports.totals(this.prisma, { period, excludeTransfers: true });
    const divisor = BigInt(AVERAGE_MONTHS);

    return {
      totalBalance: fromMoney(totalBalance),
      months,
      averageMonthlyIncome: fromMoney(totals.income / divisor),
      averageMonthlyExpense: fromMoney(totals.expense / divisor),
      unpaidInstallments: await this.unpaidInstallments(),
    };
  }

  private async unpaidInstallments(): Promise<FinanceSummary['unpaidInstallments']> {
    const installments = await this.prisma.installment.findMany();
    const groups = await this.prisma.transaction.groupBy({
      by: ['installment_id'],
      where: { installment_id: { in: installments.map((i) => i.id) }, status: { not: 'VOID' } },
      _count: { _all: true },
    });
    const paid = new Map(groups.map((group) => [group.installment_id!, group._count._all]));
    const unpaid = installments.filter((installment) => (paid.get(installment.id) ?? 0) < installment.months);
    const endMonths = unpaid.map((installment) =>
      addMonths(formatCalendarMonth(installment.start_month), installment.months - 1),
    );
    return {
      count: unpaid.length,
      monthlyTotal: fromMoney(unpaid.reduce((sum, installment) => sum + installment.monthly_amount, 0n)),
      lastEndMonth: endMonths.length === 0 ? null : endMonths.sort().at(-1)!,
    };
  }
}
