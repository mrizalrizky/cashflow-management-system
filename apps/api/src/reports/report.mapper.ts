import type { AccountWithBalance } from '../accounts/account.mapper.js';
import { fromMoney } from '../common/money.js';
import type { AccountType } from '../generated/prisma/client.js';
import type { TransactionResponse } from '../transactions/transaction.mapper.js';
import type { CategoryTotal, MonthTotals, TypeTotals } from './cashflow-report.service.js';
import type { Period } from './report-period.js';

/** Semua nominal di laporan berupa string digit; hasil pengurangan bisa diawali `-`. */
export interface CashflowResponse {
  income: string;
  expense: string;
  /** Masuk dikurangi keluar. */
  net: string;
}

export interface CategoryAmountResponse {
  categoryId: string;
  name: string;
  amount: string;
}

export interface CompanyDashboardResponse {
  period: Period;
  /** Saldo saat ini, bukan saldo pada akhir periode. */
  accounts: { id: string; name: string; type: AccountType; isActive: boolean; balance: string }[];
  totalBalance: string;
  totals: CashflowResponse;
  monthly: (CashflowResponse & { month: string })[];
  expenseByCategory: CategoryAmountResponse[];
  expenseByScope: { overhead: string; project: string };
  recentTransactions: TransactionResponse[];
  /** Transaksi yang menunggu ditinjau, tanpa melihat periode. */
  pendingCount: number;
}

export interface ProjectSummaryResponse {
  projectId: string;
  contractValue: string;
  /** Pemasukan proyek yang sudah disetujui. */
  received: string;
  /** Nilai kontrak dikurangi yang diterima; negatif bila yang diterima melebihi kontrak. */
  outstanding: string;
  /** Persentase kontrak yang sudah diterima, dua desimal; null bila nilai kontrak 0. */
  receivedPercent: number | null;
  /** Pengeluaran proyek yang sudah disetujui. */
  cost: string;
  /** Yang diterima dikurangi biaya. */
  cashDifference: string;
  costByCategory: CategoryAmountResponse[];
  /** Transaksi proyek ini yang menunggu ditinjau. */
  pendingCount: number;
}

/** Persentase dihitung dengan bilangan bulat (per sepuluh ribu) dan dibulatkan ke bawah. */
function percentOf(part: bigint, whole: bigint): number | null {
  if (whole === 0n) return null;
  return Number((part * 10_000n) / whole) / 100;
}

export function toProjectSummary(data: {
  projectId: string;
  contractValue: bigint;
  totals: TypeTotals;
  costByCategory: CategoryTotal[];
  pendingCount: number;
}): ProjectSummaryResponse {
  const { income: received, expense: cost } = data.totals;
  return {
    projectId: data.projectId,
    contractValue: fromMoney(data.contractValue),
    received: fromMoney(received),
    outstanding: fromMoney(data.contractValue - received),
    receivedPercent: percentOf(received, data.contractValue),
    cost: fromMoney(cost),
    cashDifference: fromMoney(received - cost),
    costByCategory: toCategoryAmounts(data.costByCategory),
    pendingCount: data.pendingCount,
  };
}

export function toCashflow(totals: TypeTotals): CashflowResponse {
  return {
    income: fromMoney(totals.income),
    expense: fromMoney(totals.expense),
    net: fromMoney(totals.income - totals.expense),
  };
}

export function toCategoryAmounts(totals: CategoryTotal[]): CategoryAmountResponse[] {
  return totals.map(({ categoryId, name, amount }) => ({
    categoryId,
    name,
    amount: fromMoney(amount),
  }));
}

export function toCompanyDashboard(data: {
  period: Period;
  accounts: AccountWithBalance[];
  totals: TypeTotals;
  monthly: MonthTotals[];
  expenseByCategory: CategoryTotal[];
  expenseByScope: { overhead: bigint; project: bigint };
  recentTransactions: TransactionResponse[];
  pendingCount: number;
}): CompanyDashboardResponse {
  return {
    period: data.period,
    accounts: data.accounts.map(({ account, balance }) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      isActive: account.is_active,
      balance: fromMoney(balance),
    })),
    totalBalance: fromMoney(data.accounts.reduce((sum, { balance }) => sum + balance, 0n)),
    totals: toCashflow(data.totals),
    monthly: data.monthly.map((month) => ({ month: month.month, ...toCashflow(month) })),
    expenseByCategory: toCategoryAmounts(data.expenseByCategory),
    expenseByScope: {
      overhead: fromMoney(data.expenseByScope.overhead),
      project: fromMoney(data.expenseByScope.project),
    },
    recentTransactions: data.recentTransactions,
    pendingCount: data.pendingCount,
  };
}
