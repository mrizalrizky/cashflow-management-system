import { Injectable } from '@nestjs/common';
import { parseCalendarDate } from '../common/calendar-date.js';
import type { Db } from '../database/db.js';
import { Prisma } from '../generated/prisma/client.js';
import { monthsInPeriod, Period } from './report-period.js';

/** Transaksi mana yang ikut sebuah laporan. Yang dihitung selalu hanya yang APPROVED. */
export interface ReportFilter {
  period?: Period;
  projectId?: string;
  /** Laporan perusahaan tidak menghitung transfer antar akun sebagai pemasukan atau pengeluaran. */
  excludeTransfers?: boolean;
}

export interface TypeTotals {
  income: bigint;
  expense: bigint;
}

export interface CategoryTotal {
  categoryId: string;
  name: string;
  amount: bigint;
}

export interface MonthTotals extends TypeTotals {
  /** `YYYY-MM`. */
  month: string;
}

function toWhere(filter: ReportFilter): Prisma.TransactionWhereInput {
  return {
    status: 'APPROVED',
    ...(filter.excludeTransfers ? { transfer_group_id: null } : {}),
    ...(filter.projectId ? { project_id: filter.projectId } : {}),
    ...(filter.period
      ? {
          transaction_date: {
            gte: parseCalendarDate(filter.period.from),
            lte: parseCalendarDate(filter.period.to),
          },
        }
      : {}),
  };
}

/**
 * Semua penjumlahan untuk dashboard dan ringkasan proyek. Tiap angka dihitung database
 * (`GROUP BY`); tidak ada baris transaksi yang dimuat untuk dijumlahkan di sini.
 */
@Injectable()
export class CashflowReportService {
  async totals(db: Db, filter: ReportFilter): Promise<TypeTotals> {
    const groups = await db.transaction.groupBy({
      by: ['type'],
      where: toWhere(filter),
      _sum: { amount: true },
    });
    const sumOf = (type: 'IN' | 'OUT') =>
      groups.find((group) => group.type === type)?._sum.amount ?? 0n;
    return { income: sumOf('IN'), expense: sumOf('OUT') };
  }

  /** Pengeluaran per kategori, terbesar dulu; yang sama besar diurutkan menurut nama. */
  async expenseByCategory(db: Db, filter: ReportFilter): Promise<CategoryTotal[]> {
    const groups = await db.transaction.groupBy({
      by: ['category_id'],
      where: { ...toWhere(filter), type: 'OUT' },
      _sum: { amount: true },
    });
    if (groups.length === 0) return [];

    // Nama diambil terpisah supaya kategori yang sudah nonaktif tetap muncul.
    const categories = await db.category.findMany({
      where: { id: { in: groups.map((group) => group.category_id) } },
      select: { id: true, name: true },
    });
    const names = new Map(categories.map((category) => [category.id, category.name]));

    return groups
      .map((group) => ({
        categoryId: group.category_id,
        name: names.get(group.category_id) ?? '',
        amount: group._sum.amount ?? 0n,
      }))
      .sort((a, b) =>
        a.amount === b.amount ? a.name.localeCompare(b.name) : a.amount > b.amount ? -1 : 1,
      );
  }

  /** Arus kas tiap bulan dalam periode, tanpa transfer. Bulan tanpa transaksi berisi nol. */
  async monthly(db: Db, period: Period): Promise<MonthTotals[]> {
    // Dikelompokkan langsung pada kolom tanggal kalender. Cast ke `timestamp` (tanpa zona)
    // memastikan zona waktu sesi database tidak ikut campur.
    const rows = await db.$queryRaw<{ month: string; type: 'IN' | 'OUT'; total: string }[]>(Prisma.sql`
      SELECT to_char(transaction_date::timestamp, 'YYYY-MM') AS month, type::text AS type, SUM(amount)::text AS total
      FROM transactions
      WHERE status = 'APPROVED'
        AND transfer_group_id IS NULL
        AND transaction_date BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY 1, 2`);

    const byMonth = new Map<string, MonthTotals>(
      monthsInPeriod(period).map((month) => [month, { month, income: 0n, expense: 0n }]),
    );
    for (const row of rows) {
      const totals = byMonth.get(row.month);
      if (!totals) continue;
      if (row.type === 'IN') totals.income = BigInt(row.total);
      else totals.expense = BigInt(row.total);
    }
    return [...byMonth.values()];
  }

  /** Pengeluaran perusahaan dipisah antara overhead (tanpa proyek) dan milik proyek. */
  async expenseByScope(db: Db, period: Period): Promise<{ overhead: bigint; project: bigint }> {
    const expense = { ...toWhere({ period, excludeTransfers: true }), type: 'OUT' } as const;
    const sum = async (project_id: null | { not: null }): Promise<bigint> => {
      const result = await db.transaction.aggregate({
        where: { ...expense, project_id },
        _sum: { amount: true },
      });
      return result._sum.amount ?? 0n;
    };
    const [overhead, project] = await Promise.all([sum(null), sum({ not: null })]);
    return { overhead, project };
  }
}
