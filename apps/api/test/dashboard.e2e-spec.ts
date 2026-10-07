import { todayInJakarta } from '../src/common/calendar-date.js';
import type { CompanyDashboardResponse } from '../src/reports/report.mapper.js';
import { E2eContext, setupE2e } from './e2e-context.js';
import {
  adminOnly,
  asAdmin,
  call,
  createAccount,
  createCategory,
  createTransaction,
  errorFields,
  expectAccess,
  TestSession,
} from './fixtures.js';
import { EXPECTED, REPORT_PERIOD, seedReportLedger } from './report-fixtures.js';
import { DASHBOARD } from './routes.js';

const WHOLE = `${DASHBOARD}?from=${REPORT_PERIOD.from}&to=${REPORT_PERIOD.to}`;

async function dashboard(ctx: E2eContext, admin: TestSession, path = WHOLE): Promise<CompanyDashboardResponse> {
  const res = await call(ctx, admin, 'get', path).expect(200);
  return res.body as CompanyDashboardResponse;
}

function named(items: { name: string; amount: string }[]) {
  return items.map(({ name, amount }) => ({ name, amount }));
}

/** Bagian dashboard yang hanya boleh dipengaruhi transaksi yang disetujui dan bukan transfer. */
function figures(body: CompanyDashboardResponse) {
  const { totals, monthly, expenseByCategory, expenseByScope } = body;
  return { totals, monthly, expenseByCategory, expenseByScope };
}

describe('GET /dashboard/company', () => {
  const ctx = setupE2e();

  it('is for the admin only', async () => {
    await expectAccess(ctx, { method: 'get', path: DASHBOARD }, adminOnly());
  });

  it('matches the figures computed by hand', async () => {
    await seedReportLedger(ctx);
    const body = await dashboard(ctx, await asAdmin(ctx));

    expect(body.period).toEqual(REPORT_PERIOD);
    expect(body.accounts.map((a) => [a.name, a.balance])).toEqual(Object.entries(EXPECTED.balances));
    expect(body.accounts[0]).toMatchObject({ type: 'BANK', isActive: true, id: expect.any(String) });
    expect(body.totalBalance).toBe(EXPECTED.totalBalance);
    expect(body.totals).toEqual(EXPECTED.totals);
    expect(body.monthly).toEqual(EXPECTED.monthly);
    expect(named(body.expenseByCategory)).toEqual(EXPECTED.expenseByCategory);
    expect(body.expenseByCategory[0]!.categoryId).toEqual(expect.any(String));
    expect(body.expenseByScope).toEqual(EXPECTED.expenseByScope);
    expect(body.pendingCount).toBe(EXPECTED.pendingCount);
  });

  it('never counts pending, rejected or void transactions, nor transfers', async () => {
    const ledger = await seedReportLedger(ctx);
    const admin = await asAdmin(ctx);
    const before = await dashboard(ctx, admin);

    await ctx.prisma.transaction.updateMany({
      where: { status: { in: ['PENDING', 'REJECTED', 'VOID'] } },
      data: { amount: 999_999_999n },
    });
    await ctx.prisma.transaction.updateMany({
      where: { transfer_group_id: ledger.transferGroupId },
      data: { amount: 777_777n },
    });
    const changed = await dashboard(ctx, admin);
    expect(figures(changed)).toEqual(figures(before));
    // Transfer tetap memindahkan saldo antar akun, tanpa mengubah totalnya.
    expect(changed.accounts.map((a) => a.balance)).toEqual(['14722223', '-722223']);
    expect(changed.totalBalance).toBe(EXPECTED.totalBalance);

    await ctx.prisma.transaction.updateMany({
      where: { transfer_group_id: ledger.transferGroupId },
      data: { status: 'VOID' },
    });
    const voided = await dashboard(ctx, admin);
    expect(figures(voided)).toEqual(figures(before));
    expect(voided.accounts.map((a) => a.balance)).toEqual(['15500000', '-1500000']);
  });

  it('counts the first and the last day of the period, and nothing outside it', async () => {
    await seedReportLedger(ctx);
    const admin = await asAdmin(ctx);

    const oneDay = await dashboard(ctx, admin, `${DASHBOARD}?from=2026-08-31&to=2026-08-31`);
    expect(oneDay.totals).toEqual({ income: '0', expense: '5000000', net: '-5000000' });
    expect(oneDay.monthly).toEqual([{ month: '2026-08', income: '0', expense: '5000000', net: '-5000000' }]);

    const fromFirst = await dashboard(ctx, admin, `${DASHBOARD}?from=2026-08-01&to=2026-08-31`);
    expect(fromFirst.totals.income).toBe('30000000');
    const fromSecond = await dashboard(ctx, admin, `${DASHBOARD}?from=2026-08-02&to=2026-08-31`);
    expect(fromSecond.totals).toEqual({ income: '0', expense: '17000000', net: '-17000000' });

    // 30 Sep masuk September; 1 Okt masuk Oktober, apa pun zona waktu servernya.
    const turn = await dashboard(ctx, admin, `${DASHBOARD}?from=2026-09-30&to=2026-10-01`);
    expect(turn.monthly).toEqual([
      { month: '2026-09', income: '0', expense: '20000000', net: '-20000000' },
      { month: '2026-10', income: '25000000', expense: '0', net: '25000000' },
    ]);
  });

  it('lists every month of the period, with zeros where nothing happened', async () => {
    await seedReportLedger(ctx);
    const body = await dashboard(ctx, await asAdmin(ctx), `${DASHBOARD}?from=2026-06-15&to=2026-11-02`);

    expect(body.monthly.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(body.monthly[0]).toEqual({ month: '2026-06', income: '0', expense: '0', net: '0' });
    expect(body.monthly[5]).toEqual({ month: '2026-11', income: '0', expense: '0', net: '0' });
    expect(body.monthly.slice(2, 5)).toEqual(EXPECTED.monthly);
  });

  it('covers the last twelve months when no period is given', async () => {
    const body = await dashboard(ctx, await asAdmin(ctx), DASHBOARD);
    const today = todayInJakarta();

    expect(body.period.to).toBe(today);
    expect(body.period.from.endsWith('-01')).toBe(true);
    expect(body.monthly).toHaveLength(12);
    expect(body.monthly[11]!.month).toBe(today.slice(0, 7));
  });

  it('orders expense categories by amount then name, keeping deactivated ones', async () => {
    const ledger = await seedReportLedger(ctx);
    const tied = await createCategory(ctx.prisma, { name: 'Alat', type: 'OUT' });
    await createTransaction(ctx.prisma, {
      type: 'OUT',
      amount: 7_000_000n,
      date: '2026-10-03',
      accountId: ledger.bank.id,
      categoryId: tied.id,
      createdById: ledger.recorder.id,
    });
    await ctx.prisma.category.update({ where: { id: ledger.material.id }, data: { is_active: false } });

    const body = await dashboard(ctx, await asAdmin(ctx));

    expect(named(body.expenseByCategory)).toEqual([
      { name: 'Material', amount: '40000000' },
      { name: 'Alat', amount: '7000000' },
      { name: 'Upah', amount: '7000000' },
      { name: 'Sewa Kantor', amount: '4500000' },
    ]);
  });

  it('lists the ten most recently recorded transactions, whatever their status or date', async () => {
    await seedReportLedger(ctx);
    const admin = await asAdmin(ctx);

    const body = await dashboard(ctx, admin, `${DASHBOARD}?from=2026-08-01&to=2026-08-01`);

    expect(body.recentTransactions.map((t) => t.description)).toEqual(EXPECTED.recent);
    expect(body.recentTransactions[0]).toMatchObject({ isTransfer: true, status: 'APPROVED', amount: '1000000' });
    expect(body.recentTransactions[4]).toMatchObject({
      status: 'PENDING',
      permissions: { canReview: true, canEdit: true },
      createdBy: { name: 'Pencatat Laporan' },
    });
    // Jumlah yang menunggu tidak mengikuti periode.
    expect(body.pendingCount).toBe(1);
  });

  it('reports zeros on an empty database', async () => {
    const body = await dashboard(ctx, await asAdmin(ctx), DASHBOARD);

    expect(body.accounts).toEqual([]);
    expect(body.totalBalance).toBe('0');
    expect(body.totals).toEqual({ income: '0', expense: '0', net: '0' });
    expect(body.monthly.every((m) => m.income === '0' && m.expense === '0' && m.net === '0')).toBe(true);
    expect(body.expenseByCategory).toEqual([]);
    expect(body.expenseByScope).toEqual({ overhead: '0', project: '0' });
    expect(body.recentTransactions).toEqual([]);
    expect(body.pendingCount).toBe(0);
  });

  it('adds up sums beyond what a JavaScript number can hold', async () => {
    const admin = await asAdmin(ctx);
    const account = await createAccount(ctx.prisma);
    const category = await createCategory(ctx.prisma, { type: 'IN' });
    for (let i = 0; i < 2; i += 1) {
      await createTransaction(ctx.prisma, {
        type: 'IN',
        amount: 9_007_199_254_740_993n,
        date: '2026-10-01',
        accountId: account.id,
        categoryId: category.id,
        createdById: admin.user.id,
      });
    }

    const body = await dashboard(ctx, admin, `${DASHBOARD}?from=2026-10-01&to=2026-10-01`);

    expect(body.totals).toEqual({ income: '18014398509481986', expense: '0', net: '18014398509481986' });
    expect(body.monthly[0]!.income).toBe('18014398509481986');
    expect(body.totalBalance).toBe('18014398509481986');
  });

  it.each([
    ['a period that runs backwards', 'from=2026-10-02&to=2026-10-01', 'from'],
    ['a date that does not exist', 'from=2026-13-01', 'from'],
    ['a period longer than sixty months', 'from=2021-10-31&to=2026-10-01', 'to'],
    ['an unknown parameter', 'bulan=10', 'bulan'],
  ])('refuses %s', async (_label, query, field) => {
    const res = await call(ctx, await asAdmin(ctx), 'get', `${DASHBOARD}?${query}`).expect(400);

    expect(errorFields(res.body)).toEqual([field]);
  });
});
