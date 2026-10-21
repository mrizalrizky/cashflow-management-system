import { FinanceSummaryService } from '../src/wishlist/finance-summary.service.js';
import { setupE2e } from './e2e-context.js';
import {
  createAccount,
  createCategory,
  createInstallment,
  createOwner,
  createTransaction,
} from './fixtures.js';

/** Hari ini untuk test: bulan penuh terakhir adalah Juli, Agustus, September 2026. */
const TODAY = '2026-10-13';

describe('finance summary for the wishlist review', () => {
  const ctx = setupE2e();

  function summarize() {
    return ctx.app.get(FinanceSummaryService).summarize(TODAY);
  }

  async function setup() {
    const owner = await createOwner(ctx.prisma, { pinHash: 'x' });
    const account = await createAccount(ctx.prisma, { name: 'Rekening Rahasia', openingBalance: 1_000_000n });
    const expense = await createCategory(ctx.prisma, { name: 'Kategori Rahasia', type: 'OUT' });
    const income = await createCategory(ctx.prisma, { name: 'Gaji Rahasia', type: 'IN' });
    const record = (type: 'IN' | 'OUT', amount: bigint, date: string, extra: object = {}) =>
      createTransaction(ctx.prisma, {
        accountId: account.id,
        categoryId: type === 'IN' ? income.id : expense.id,
        createdById: owner.id,
        type,
        amount,
        date,
        description: 'Keterangan Rahasia',
        ...extra,
      });
    return { owner, account, expense, income, record };
  }

  it('adds up the balance of active accounts only', async () => {
    const { record } = await setup();
    await createAccount(ctx.prisma, { name: 'Dompet', openingBalance: 500_000n });
    await createAccount(ctx.prisma, { name: 'Tutup', openingBalance: 9_000_000n, isActive: false });
    await record('OUT', 200_000n, '2026-10-02');

    expect((await summarize()).totalBalance).toBe('1300000');
  });

  it('averages income and expense over the last three full calendar months, without voids or transfers', async () => {
    const { record } = await setup();
    await record('IN', 9_000_000n, '2026-07-25');
    await record('IN', 9_000_000n, '2026-09-25');
    await record('OUT', 3_000_000n, '2026-08-10');
    await record('OUT', 3_000_001n, '2026-09-30');
    // Di luar tiga bulan itu, atau tidak dihitung.
    await record('IN', 50_000_000n, '2026-06-30');
    await record('IN', 50_000_000n, '2026-10-01');
    await record('OUT', 7_000_000n, '2026-08-11', { status: 'VOID' });
    // Transfer dan penyesuaian saldo memakai kategori sistem; keduanya bukan pengeluaran.
    const transferOut = await createCategory(ctx.prisma, { name: 'Transfer Keluar', type: 'OUT', isSystem: true });
    const adjustmentOut = await createCategory(ctx.prisma, { name: 'Selisih Keluar', type: 'OUT', isSystem: true });
    await record('OUT', 7_000_000n, '2026-08-12', {
      categoryId: transferOut.id,
      transferGroupId: '00000000-0000-4000-8000-000000000001',
    });
    await record('OUT', 4_000_000n, '2026-08-13', { categoryId: adjustmentOut.id });

    const summary = await summarize();
    expect(summary.months).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(summary.averageMonthlyIncome).toBe('6000000');
    // 6.000.001 / 3, dibulatkan ke bawah ke rupiah utuh.
    expect(summary.averageMonthlyExpense).toBe('2000000');
  });

  it('counts the installments not yet paid off, their monthly total and the last end month', async () => {
    const { record } = await setup();
    await createInstallment(ctx.prisma, { name: 'Motor', startMonth: '2026-09', months: 3, monthlyAmount: 1_500_000n });
    await createInstallment(ctx.prisma, { name: 'Laptop', startMonth: '2026-10', months: 12, monthlyAmount: 800_000n });
    const paidOff = await createInstallment(ctx.prisma, { name: 'HP', startMonth: '2026-01', months: 1, monthlyAmount: 300_000n });
    await record('OUT', 300_000n, '2026-01-10', { installmentId: paidOff.id });

    expect((await summarize()).unpaidInstallments).toEqual({
      count: 2,
      monthlyTotal: '2300000',
      lastEndMonth: '2027-09',
    });
  });

  it('says so when there are no installments', async () => {
    await setup();
    expect((await summarize()).unpaidInstallments).toEqual({ count: 0, monthlyTotal: '0', lastEndMonth: null });
  });

  it('holds only totals: no account, category or installment names, and no descriptions', async () => {
    const { record } = await setup();
    await record('OUT', 100_000n, '2026-09-05');
    await createInstallment(ctx.prisma, { name: 'Cicilan Rahasia' });

    const json = JSON.stringify(await summarize());
    expect(json).not.toContain('Rahasia');
    expect(Object.keys(JSON.parse(json)).sort()).toEqual([
      'averageMonthlyExpense',
      'averageMonthlyIncome',
      'months',
      'totalBalance',
      'unpaidInstallments',
    ]);
  });
});
