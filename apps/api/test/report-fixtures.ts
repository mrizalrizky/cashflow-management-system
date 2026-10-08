import { randomUUID } from 'node:crypto';
import type { Account, Category, Project, TxStatus, TxType, User } from '../src/generated/prisma/client.js';
import type { E2eContext } from './e2e-context.js';
import { createAccount, createCategory, createProject, createTransaction, createUser } from './fixtures.js';

/**
 * Buku kecil untuk menguji laporan. Angka yang diharapkan di `EXPECTED` dihitung dengan
 * tangan dari daftar di bawah, bukan oleh kode yang diuji.
 *
 * Saldo awal: Bank 10.000.000, Kas 500.000.
 *
 * Disetujui (yang dihitung):
 *   trx-1  01 Agu  IN   Termin       30.000.000  Bank  Proyek A
 *   trx-2  15 Agu  OUT  Material     12.000.000  Bank  Proyek A
 *   trx-3  31 Agu  OUT  Upah          5.000.000  Bank  Proyek A
 *   trx-4  01 Sep  OUT  Sewa Kantor   3.000.000  Bank  overhead
 *   trx-5  10 Sep  OUT  Material      8.000.000  Bank  Proyek B
 *   trx-6  30 Sep  OUT  Material     20.000.000  Bank  Proyek A
 *   trx-7  01 Okt  IN   Termin       25.000.000  Bank  Proyek B
 *   trx-8  05 Okt  OUT  Upah          2.000.000  Kas   Proyek B
 *   trx-9  06 Okt  OUT  Sewa Kantor   1.500.000  Bank  overhead
 * Tidak dihitung:
 *   trx-10 15 Sep  OUT  Material      7.000.000  PENDING   Proyek A
 *   trx-11 16 Sep  OUT  Upah          4.000.000  REJECTED  Proyek A
 *   trx-12 02 Okt  IN   Termin        9.000.000  VOID      Proyek A
 * Transfer (hanya memengaruhi saldo akun):
 *   trx-13/14 20 Sep  Bank -> Kas 1.000.000
 *
 * Per bulan:
 *   Agu  masuk 30.000.000  keluar 12 + 5 = 17.000.000        net  13.000.000
 *   Sep  masuk 0           keluar 3 + 8 + 20 = 31.000.000    net -31.000.000
 *   Okt  masuk 25.000.000  keluar 2 + 1,5 = 3.500.000        net  21.500.000
 * Total: masuk 55.000.000, keluar 51.500.000, net 3.500.000.
 * Per kategori: Material 12 + 8 + 20 = 40.000.000; Upah 5 + 2 = 7.000.000; Sewa Kantor 4.500.000.
 * Overhead 4.500.000; proyek 51.500.000 - 4.500.000 = 47.000.000.
 * Saldo: Bank 10.000.000 + 55.000.000 - 49.500.000 - 1.000.000 = 14.500.000;
 *        Kas 500.000 - 2.000.000 + 1.000.000 = -500.000; total 14.000.000.
 *
 * Proyek A (kontrak 100.000.000): diterima 30.000.000 (30%), sisa 70.000.000,
 *   biaya 12 + 5 + 20 = 37.000.000 (Material 32.000.000, Upah 5.000.000), selisih kas -7.000.000.
 * Proyek B (kontrak 20.000.000): diterima 25.000.000 (125%), sisa -5.000.000,
 *   biaya 8 + 2 = 10.000.000 (Material 8.000.000, Upah 2.000.000), selisih kas 15.000.000.
 */
export const REPORT_PERIOD = { from: '2026-08-01', to: '2026-10-31' };

export const EXPECTED = {
  balances: { 'Bank Laporan': '14500000', 'Kas Laporan': '-500000' },
  totalBalance: '14000000',
  totals: { income: '55000000', expense: '51500000', net: '3500000' },
  monthly: [
    { month: '2026-08', income: '30000000', expense: '17000000', net: '13000000' },
    { month: '2026-09', income: '0', expense: '31000000', net: '-31000000' },
    { month: '2026-10', income: '25000000', expense: '3500000', net: '21500000' },
  ],
  expenseByCategory: [
    { name: 'Material', amount: '40000000' },
    { name: 'Upah', amount: '7000000' },
    { name: 'Sewa Kantor', amount: '4500000' },
  ],
  expenseByScope: { overhead: '4500000', project: '47000000' },
  pendingCount: 1,
  /** Sepuluh yang terakhir dicatat, terbaru dulu (kedua sisi transfer adalah trx-13 dan trx-14). */
  recent: ['trx-14', 'trx-13', 'trx-12', 'trx-11', 'trx-10', 'trx-9', 'trx-8', 'trx-7', 'trx-6', 'trx-5'],
  projectA: {
    contractValue: '100000000',
    contractValueWithPpn: '100000000',
    received: '30000000',
    outstanding: '70000000',
    receivedPercent: 30,
    cost: '37000000',
    cashDifference: '-7000000',
    costByCategory: [
      { name: 'Material', amount: '32000000' },
      { name: 'Upah', amount: '5000000' },
    ],
    pendingCount: 1,
  },
  projectB: {
    contractValue: '20000000',
    contractValueWithPpn: '20000000',
    received: '25000000',
    outstanding: '-5000000',
    receivedPercent: 125,
    cost: '10000000',
    cashDifference: '15000000',
    costByCategory: [
      { name: 'Material', amount: '8000000' },
      { name: 'Upah', amount: '2000000' },
    ],
    pendingCount: 0,
  },
};

export interface ReportLedger {
  bank: Account;
  cash: Account;
  material: Category;
  wages: Category;
  rent: Category;
  income: Category;
  projectA: Project;
  projectB: Project;
  recorder: User;
  /** Id grup transfer Bank -> Kas. */
  transferGroupId: string;
}

type Row = [
  date: string,
  type: TxType,
  category: 'material' | 'wages' | 'rent' | 'income',
  amount: bigint,
  account: 'bank' | 'cash',
  project: 'projectA' | 'projectB' | null,
  status?: TxStatus,
];

const ROWS: Row[] = [
  ['2026-08-01', 'IN', 'income', 30_000_000n, 'bank', 'projectA'],
  ['2026-08-15', 'OUT', 'material', 12_000_000n, 'bank', 'projectA'],
  ['2026-08-31', 'OUT', 'wages', 5_000_000n, 'bank', 'projectA'],
  ['2026-09-01', 'OUT', 'rent', 3_000_000n, 'bank', null],
  ['2026-09-10', 'OUT', 'material', 8_000_000n, 'bank', 'projectB'],
  ['2026-09-30', 'OUT', 'material', 20_000_000n, 'bank', 'projectA'],
  ['2026-10-01', 'IN', 'income', 25_000_000n, 'bank', 'projectB'],
  ['2026-10-05', 'OUT', 'wages', 2_000_000n, 'cash', 'projectB'],
  ['2026-10-06', 'OUT', 'rent', 1_500_000n, 'bank', null],
  ['2026-09-15', 'OUT', 'material', 7_000_000n, 'bank', 'projectA', 'PENDING'],
  ['2026-09-16', 'OUT', 'wages', 4_000_000n, 'bank', 'projectA', 'REJECTED'],
  ['2026-10-02', 'IN', 'income', 9_000_000n, 'bank', 'projectA', 'VOID'],
];

/** Waktu pencatatan dibuat berurutan, supaya "terbaru" tidak bergantung pada kecepatan mesin. */
function recordedAt(index: number): Date {
  return new Date(Date.UTC(2026, 9, 6, 3, 0, index));
}

export async function seedReportLedger(ctx: E2eContext): Promise<ReportLedger> {
  const { prisma } = ctx;
  const ledger = {
    bank: await createAccount(prisma, { name: 'Bank Laporan', type: 'BANK', openingBalance: 10_000_000n }),
    cash: await createAccount(prisma, { name: 'Kas Laporan', type: 'CASH', openingBalance: 500_000n }),
    material: await createCategory(prisma, { name: 'Material', type: 'OUT' }),
    wages: await createCategory(prisma, { name: 'Upah', type: 'OUT' }),
    rent: await createCategory(prisma, { name: 'Sewa Kantor', type: 'OUT' }),
    income: await createCategory(prisma, { name: 'Termin', type: 'IN' }),
    projectA: await createProject(prisma, { code: 'PRJ-A', name: 'Proyek A', contractValue: 100_000_000n }),
    projectB: await createProject(prisma, { code: 'PRJ-B', name: 'Proyek B', contractValue: 20_000_000n }),
    recorder: await createUser(prisma, { role: 'STAFF', name: 'Pencatat Laporan' }),
    transferGroupId: randomUUID(),
  };

  for (const [index, [date, type, category, amount, account, project, status]] of ROWS.entries()) {
    await createTransaction(prisma, {
      type,
      amount,
      status,
      date,
      description: `trx-${index + 1}`,
      accountId: ledger[account].id,
      categoryId: ledger[category].id,
      projectId: project ? ledger[project].id : undefined,
      createdById: ledger.recorder.id,
      createdAt: recordedAt(index),
    });
  }

  const transferOut = await createCategory(prisma, { name: 'Transfer Keluar', type: 'OUT', isSystem: true });
  const transferIn = await createCategory(prisma, { name: 'Transfer Masuk', type: 'IN', isSystem: true });
  const legs = [
    { type: 'OUT', accountId: ledger.bank.id, categoryId: transferOut.id },
    { type: 'IN', accountId: ledger.cash.id, categoryId: transferIn.id },
  ] as const;
  for (const [offset, leg] of legs.entries()) {
    await createTransaction(prisma, {
      ...leg,
      amount: 1_000_000n,
      date: '2026-09-20',
      description: `trx-${ROWS.length + offset + 1}`,
      createdById: ledger.recorder.id,
      createdAt: recordedAt(ROWS.length + offset),
      transferGroupId: ledger.transferGroupId,
    });
  }
  return ledger;
}
