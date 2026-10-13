import { randomUUID } from 'node:crypto';
import { todayInJakarta } from '../src/common/calendar-date.js';
import { api, setupE2e } from './e2e-context.js';
import { call, createAccount, createCategory, errorFields } from './fixtures.js';
import { TRANSACTIONS } from './routes.js';
import { expenseBody, record, setupWorld } from './transaction-fixtures.js';

function tomorrowInJakarta(): string {
  const tomorrow = new Date(`${todayInJakarta()}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

describe('POST /transactions', () => {
  const ctx = setupE2e();

  it('counts a new transaction at once', async () => {
    const world = await setupWorld(ctx);
    const res = await call(ctx, world.owner, 'post', TRANSACTIONS).send(expenseBody(world)).expect(201);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body).not.toHaveProperty('reviewedBy');
    expect(res.body.permissions).toEqual({ canEdit: true, canAttach: true, canVoid: true });
  });

  it('refuses a projectId as an unknown field', async () => {
    const world = await setupWorld(ctx);
    const res = await call(ctx, world.owner, 'post', TRANSACTIONS)
      .send({ ...expenseBody(world), projectId: randomUUID() })
      .expect(400);
    expect(errorFields(res.body)).toContain('projectId');
  });

  it('records a transaction and returns it with its relations and permissions', async () => {
    const world = await setupWorld(ctx);

    const res = await call(ctx, world.owner, 'post', TRANSACTIONS)
      .send(expenseBody(world, { description: '  Beli semen  ' }))
      .expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      type: 'OUT',
      amount: '150000',
      transactionDate: '2026-10-01',
      description: 'Beli semen',
      status: 'APPROVED',
      account: { id: world.account.id, name: 'Kas Uji' },
      category: { id: world.expense.id, name: 'Material Uji' },
      isTransfer: false,
      transferGroupId: null,
      createdBy: { id: world.owner.user.id, name: 'Pemilik' },
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
      attachments: [],
      permissions: { canEdit: true, canAttach: true, canVoid: true },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entity_type: 'transaction' } });
    expect(row).toMatchObject({ action: 'CREATE', user_id: world.owner.user.id, entity_id: res.body.id });
    expect(row.after).toMatchObject({ amount: '150000', status: 'APPROVED' });
  });

  it.each([
    ['a zero amount', { amount: '0' }, 'amount'],
    ['a negative amount', { amount: '-5000' }, 'amount'],
    ['a decimal amount', { amount: '1500.50' }, 'amount'],
    ['a 14-digit amount', { amount: '10000000000000' }, 'amount'],
    ['a numeric amount', { amount: 150000 }, 'amount'],
    ['a date that does not exist', { transactionDate: '2026-02-30' }, 'transactionDate'],
    ['a date in the future', { transactionDate: tomorrowInJakarta() }, 'transactionDate'],
    ['an empty description', { description: '   ' }, 'description'],
    ['a description that is too long', { description: 'x'.repeat(501) }, 'description'],
    ['an unknown type', { type: 'TRANSFER' }, 'type'],
    ['a status chosen by the client', { status: 'APPROVED' }, 'status'],
    ['a creator chosen by the client', { createdById: randomUUID() }, 'createdById'],
  ])('rejects %s', async (_label, override, field) => {
    const world = await setupWorld(ctx);

    const res = await call(ctx, world.owner, 'post', TRANSACTIONS)
      .send({ ...expenseBody(world), ...override })
      .expect(400);

    expect(errorFields(res.body)).toContain(field);
    expect(await ctx.prisma.transaction.count()).toBe(0);
  });

  it('accepts today as the transaction date', async () => {
    const world = await setupWorld(ctx);
    const today = todayInJakarta();
    expect((await record(ctx, world.owner, expenseBody(world, { transactionDate: today }))).transactionDate).toBe(
      today,
    );
  });

  it('checks that the category fits: right type, active, not a transfer category, existing', async () => {
    const world = await setupWorld(ctx);
    const inactive = await createCategory(ctx.prisma, { type: 'OUT', isActive: false });
    const system = await createCategory(ctx.prisma, { name: 'Transfer Keluar', type: 'OUT', isSystem: true });

    for (const categoryId of [world.income.id, inactive.id, system.id, randomUUID()]) {
      const res = await call(ctx, world.owner, 'post', TRANSACTIONS)
        .send(expenseBody(world, { categoryId }))
        .expect(400);
      expect(errorFields(res.body)).toEqual(['categoryId']);
    }
  });

  it('checks that the account exists and is active', async () => {
    const world = await setupWorld(ctx);
    const inactive = await createAccount(ctx.prisma, { isActive: false });

    for (const accountId of [inactive.id, randomUUID()]) {
      const res = await call(ctx, world.owner, 'post', TRANSACTIONS)
        .send(expenseBody(world, { accountId }))
        .expect(400);
      expect(errorFields(res.body)).toEqual(['accountId']);
    }
  });

  it('reports every problem at once', async () => {
    const world = await setupWorld(ctx);

    const res = await call(ctx, world.owner, 'post', TRANSACTIONS)
      .send(expenseBody(world, { accountId: randomUUID(), categoryId: world.income.id }))
      .expect(400);

    expect(errorFields(res.body).sort()).toEqual(['accountId', 'categoryId']);
  });

  it('requires a token', async () => {
    const world = await setupWorld(ctx);
    await api(ctx).post(TRANSACTIONS).send(expenseBody(world)).expect(401);
  });
});
