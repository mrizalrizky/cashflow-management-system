import { randomUUID } from 'node:crypto';
import { todayInJakarta } from '../src/common/calendar-date.js';
import { setupE2e } from './e2e-context.js';
import { call, createAccount, errorFields, TestSession } from './fixtures.js';
import { ACCOUNTS, CATEGORIES, DASHBOARD, TRANSACTIONS } from './routes.js';
import { expenseBody, incomeBody, record, setupWorld, transactionUrl, World } from './transaction-fixtures.js';

/** Saldo akun saat ini, dari daftar akun. */
async function balanceOf(ctx: ReturnType<typeof setupE2e>, owner: TestSession, accountId: string): Promise<string> {
  const res = await call(ctx, owner, 'get', ACCOUNTS).expect(200);
  return (res.body.data as { id: string; balance: string }[]).find((a) => a.id === accountId)!.balance;
}

describe('POST /accounts/:id/reconcile', () => {
  const ctx = setupE2e();
  const url = (id: string) => `${ACCOUNTS}/${id}/reconcile`;

  // Kas Uji: saldo awal 1.000.000, lalu pengeluaran 150.000 tercatat → saldo 850.000.
  async function setup(): Promise<World> {
    const world = await setupWorld(ctx);
    await record(ctx, world.owner, expenseBody(world, { amount: '150000', transactionDate: todayInJakarta() }));
    return world;
  }

  it('records the shortfall as one "Selisih Keluar" adjustment, so the balance matches', async () => {
    const world = await setup();

    const res = await call(ctx, world.owner, 'post', url(world.account.id)).send({ actualBalance: '700000' }).expect(201);

    expect(res.body).toMatchObject({ previousBalance: '850000', actualBalance: '700000', difference: '-150000' });
    expect(res.body.transaction).toMatchObject({
      type: 'OUT',
      amount: '150000',
      transactionDate: todayInJakarta(),
      description: 'Penyesuaian saldo',
      category: { name: 'Selisih Keluar' },
      account: { id: world.account.id },
      isAdjustment: true,
      isTransfer: false,
      permissions: { canEdit: false, canAttach: false, canVoid: true },
    });
    expect(await balanceOf(ctx, world.owner, world.account.id)).toBe('700000');
    const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'ADJUST' } });
    expect(log).toMatchObject({ entity_type: 'transaction', entity_id: res.body.transaction.id });
  });

  it('records a surplus as "Selisih Masuk", with the description the owner typed', async () => {
    const world = await setup();

    const res = await call(ctx, world.owner, 'post', url(world.account.id))
      .send({ actualBalance: '900000', description: '  Lupa catat cashback  ' })
      .expect(201);

    expect(res.body.difference).toBe('50000');
    expect(res.body.transaction).toMatchObject({
      type: 'IN',
      amount: '50000',
      description: 'Lupa catat cashback',
      category: { name: 'Selisih Masuk' },
    });
    expect(await balanceOf(ctx, world.owner, world.account.id)).toBe('900000');
  });

  it('records nothing when the balance already matches', async () => {
    const world = await setup();
    const before = await ctx.prisma.transaction.count();

    const res = await call(ctx, world.owner, 'post', url(world.account.id)).send({ actualBalance: '850000' }).expect(201);

    expect(res.body).toEqual({ previousBalance: '850000', actualBalance: '850000', difference: '0', transaction: null });
    expect(await ctx.prisma.transaction.count()).toBe(before);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'ADJUST' } })).toBe(0);
  });

  it('works for an account that is overdrawn', async () => {
    const world = await setupWorld(ctx);
    const card = await createAccount(ctx.prisma, { name: 'Kartu', type: 'BANK', openingBalance: -200_000n });

    const res = await call(ctx, world.owner, 'post', url(card.id)).send({ actualBalance: '-350000' }).expect(201);

    expect(res.body).toMatchObject({ previousBalance: '-200000', difference: '-150000' });
    expect(await balanceOf(ctx, world.owner, card.id)).toBe('-350000');
  });

  it('is kept out of the dashboard totals and categories, but not out of the balances', async () => {
    const world = await setup();
    const period = `?from=${todayInJakarta()}&to=${todayInJakarta()}`;
    const before = (await call(ctx, world.owner, 'get', `${DASHBOARD}${period}`).expect(200)).body;

    await call(ctx, world.owner, 'post', url(world.account.id)).send({ actualBalance: '600000' }).expect(201);
    const after = (await call(ctx, world.owner, 'get', `${DASHBOARD}${period}`).expect(200)).body;

    expect(after.totals).toEqual(before.totals);
    expect(after.monthly).toEqual(before.monthly);
    expect(after.expenseByCategory).toEqual(before.expenseByCategory);
    expect(after.totalBalance).toBe('600000');
  });

  it('cannot be edited, only voided, which brings the balance back', async () => {
    const world = await setup();
    const { body } = await call(ctx, world.owner, 'post', url(world.account.id)).send({ actualBalance: '700000' }).expect(201);
    const id = body.transaction.id as string;

    await call(ctx, world.owner, 'patch', transactionUrl(id)).send({ amount: '1' }).expect(403);
    await call(ctx, world.owner, 'post', transactionUrl(id, 'void')).send({ reason: 'Salah ketik' }).expect(200);

    expect(await balanceOf(ctx, world.owner, world.account.id)).toBe('850000');
  });

  it('shows in the transaction list, marked as an adjustment', async () => {
    const world = await setup();
    await call(ctx, world.owner, 'post', url(world.account.id)).send({ actualBalance: '700000' }).expect(201);

    const res = await call(ctx, world.owner, 'get', TRANSACTIONS).expect(200);
    const adjustment = (res.body.data as { isAdjustment: boolean; description: string }[]).filter((t) => t.isAdjustment);
    expect(adjustment.map((t) => t.description)).toEqual(['Penyesuaian saldo']);
  });

  it.each([
    [{ actualBalance: 700000 }, 'actualBalance'],
    [{ actualBalance: '700.000' }, 'actualBalance'],
    [{}, 'actualBalance'],
    [{ actualBalance: '700000', description: 'x'.repeat(501) }, 'description'],
  ])('refuses %j', async (body, field) => {
    const world = await setup();
    const res = await call(ctx, world.owner, 'post', url(world.account.id)).send(body).expect(400);
    expect(errorFields(res.body)).toContain(field);
  });

  it('answers 404 for an unknown account and refuses an inactive one', async () => {
    const world = await setupWorld(ctx);
    const closed = await createAccount(ctx.prisma, { name: 'Tutup', isActive: false });

    await call(ctx, world.owner, 'post', url(randomUUID())).send({ actualBalance: '0' }).expect(404);
    const res = await call(ctx, world.owner, 'post', url(closed.id)).send({ actualBalance: '0' }).expect(400);
    expect(res.body.message).toBe('Akun sudah tidak aktif');
  });

  it('keeps the two adjustment names for itself', async () => {
    const world = await setupWorld(ctx);
    for (const [name, type] of [['Selisih Masuk', 'IN'], ['selisih keluar', 'OUT']]) {
      await call(ctx, world.owner, 'post', CATEGORIES).send({ name, type }).expect(409);
    }
  });

  it('leaves ordinary income alone in the totals', async () => {
    const world = await setup();
    await record(ctx, world.owner, incomeBody(world, { transactionDate: todayInJakarta() }));
    await call(ctx, world.owner, 'post', url(world.account.id)).send({ actualBalance: '1000000' }).expect(201);
    const period = `?from=${todayInJakarta()}&to=${todayInJakarta()}`;
    const res = await call(ctx, world.owner, 'get', `${DASHBOARD}${period}`).expect(200);
    expect(res.body.totals).toMatchObject({ income: '500000', expense: '150000' });
  });
});
