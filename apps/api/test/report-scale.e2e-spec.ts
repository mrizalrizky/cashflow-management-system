import type { Prisma, TxStatus } from '../src/generated/prisma/client.js';
import type { CompanyDashboardResponse, ProjectSummaryResponse } from '../src/reports/report.mapper.js';
import { E2eContext, setupE2e } from './e2e-context.js';
import { asAdmin, call, createAccount, createCategory, createProject, TestSession } from './fixtures.js';
import { DASHBOARD, PROJECTS } from './routes.js';

const ROWS = 10_000;
const MAX_RESPONSE_MS = 1_500;
const FIRST_DAY = Date.UTC(2024, 10, 1);
const DAYS = 730;
const PERIOD = 'from=2024-11-01&to=2026-10-31';
// Tujuh dari sepuluh disetujui; sisanya tidak boleh ikut dihitung.
const STATUSES: TxStatus[] = [
  'APPROVED',
  'APPROVED',
  'APPROVED',
  'PENDING',
  'APPROVED',
  'APPROVED',
  'REJECTED',
  'APPROVED',
  'APPROVED',
  'VOID',
];

interface Sums {
  income: bigint;
  expense: bigint;
}

function add(sums: Sums, type: 'IN' | 'OUT', amount: bigint): void {
  if (type === 'IN') sums.income += amount;
  else sums.expense += amount;
}

/** Mengisi 10.000 transaksi dan sekaligus menjumlahkan, dengan cara lain, apa yang harus dilaporkan. */
async function seedMany(ctx: E2eContext, admin: TestSession & { user: { id: string } }) {
  const accounts = [await createAccount(ctx.prisma), await createAccount(ctx.prisma)];
  const income = await createCategory(ctx.prisma, { type: 'IN' });
  const expenses = [
    await createCategory(ctx.prisma, { type: 'OUT' }),
    await createCategory(ctx.prisma, { type: 'OUT' }),
    await createCategory(ctx.prisma, { type: 'OUT' }),
  ];
  const projectA = await createProject(ctx.prisma, { contractValue: 10_000_000_000n });
  const projects = [projectA.id, (await createProject(ctx.prisma)).id, null];

  const total: Sums = { income: 0n, expense: 0n };
  const ofProjectA: Sums = { income: 0n, expense: 0n };
  const byMonth = new Map<string, Sums>();
  const rows: Prisma.TransactionCreateManyInput[] = [];

  for (let i = 0; i < ROWS; i += 1) {
    const type = i % 4 === 0 ? 'IN' : 'OUT';
    const amount = BigInt(1_000 + ((i * 37) % 500_000));
    const status = STATUSES[i % STATUSES.length]!;
    const date = new Date(FIRST_DAY + (i % DAYS) * 86_400_000);
    const projectId = projects[i % projects.length]!;
    rows.push({
      type,
      amount,
      status,
      transaction_date: date,
      description: `dummy ${i}`,
      account_id: accounts[i % accounts.length]!.id,
      category_id: type === 'IN' ? income.id : expenses[i % expenses.length]!.id,
      project_id: projectId,
      created_by_id: admin.user.id,
    });
    if (status !== 'APPROVED') continue;

    add(total, type, amount);
    if (projectId === projectA.id) add(ofProjectA, type, amount);
    const month = date.toISOString().slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, { income: 0n, expense: 0n });
    add(byMonth.get(month)!, type, amount);
  }

  for (let start = 0; start < rows.length; start += 2_000) {
    await ctx.prisma.transaction.createMany({ data: rows.slice(start, start + 2_000) });
  }
  return { projectA, total, ofProjectA, byMonth };
}

async function timed<T>(run: () => Promise<{ body: T }>): Promise<{ body: T; ms: number }> {
  const started = performance.now();
  const { body } = await run();
  return { body, ms: performance.now() - started };
}

describe('reports on 10,000 transactions', () => {
  const ctx = setupE2e();

  it('stay correct and answer quickly', async () => {
    const admin = await asAdmin(ctx);
    const expected = await seedMany(ctx, admin);

    const dashboard = await timed<CompanyDashboardResponse>(() =>
      call(ctx, admin, 'get', `${DASHBOARD}?${PERIOD}`).expect(200),
    );
    const summary = await timed<ProjectSummaryResponse>(() =>
      call(ctx, admin, 'get', `${PROJECTS}/${expected.projectA.id}/summary`).expect(200),
    );

    expect(dashboard.body.totals).toEqual({
      income: expected.total.income.toString(),
      expense: expected.total.expense.toString(),
      net: (expected.total.income - expected.total.expense).toString(),
    });
    expect(dashboard.body.monthly).toHaveLength(24);
    for (const month of dashboard.body.monthly) {
      const sums = expected.byMonth.get(month.month)!;
      expect([month.month, month.income, month.expense]).toEqual([
        month.month,
        sums.income.toString(),
        sums.expense.toString(),
      ]);
    }
    expect(dashboard.body.recentTransactions).toHaveLength(10);
    expect(dashboard.body.pendingCount).toBe(ROWS / 10);

    expect(summary.body.received).toBe(expected.ofProjectA.income.toString());
    expect(summary.body.cost).toBe(expected.ofProjectA.expense.toString());

    expect(dashboard.ms).toBeLessThan(MAX_RESPONSE_MS);
    expect(summary.ms).toBeLessThan(MAX_RESPONSE_MS);
  }, 60_000);
});
