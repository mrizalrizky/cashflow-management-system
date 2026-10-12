import { randomUUID } from 'node:crypto';
import { todayInJakarta } from '../src/common/calendar-date.js';
import { api, setupE2e } from './e2e-context.js';
import { call, createAccount, createCategory, errorFields } from './fixtures.js';
import { TRANSACTIONS } from './routes.js';
import { expenseBody, incomeBody, record, setupWorld } from './transaction-fixtures.js';

function tomorrowInJakarta(): string {
  const tomorrow = new Date(`${todayInJakarta()}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

describe('POST /transactions', () => {
  const ctx = setupE2e();

  it('refuses a projectId as an unknown field', async () => {
    const world = await setupWorld(ctx);
    const res = await call(ctx, world.admin, 'post', TRANSACTIONS)
      .send({ ...expenseBody(world), projectId: randomUUID() })
      .expect(400);
    expect(errorFields(res.body)).toContain('projectId');
  });

  it('records a pending transaction and returns it with its relations and permissions', async () => {
    const world = await setupWorld(ctx);

    const res = await call(ctx, world.staff, 'post', TRANSACTIONS)
      .send(expenseBody(world, { description: '  Beli semen  ' }))
      .expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      type: 'OUT',
      amount: '150000',
      transactionDate: '2026-10-01',
      description: 'Beli semen',
      status: 'PENDING',
      account: { id: world.account.id, name: 'Kas Uji' },
      category: { id: world.expense.id, name: 'Material Uji' },
      isTransfer: false,
      transferGroupId: null,
      createdBy: { id: world.staff.user.id, name: 'Staf Satu' },
      reviewedBy: null,
      reviewedAt: null,
      rejectReason: null,
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
      attachments: [],
      permissions: { canEdit: true, canCancel: true, canReview: false, canVoid: false, canAttach: true },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entity_type: 'transaction' } });
    expect(row).toMatchObject({ action: 'CREATE', user_id: world.staff.user.id, entity_id: res.body.id });
    expect(row.after).toMatchObject({ amount: '150000', status: 'PENDING' });
  });

  it('keeps even an admin transaction pending', async () => {
    const world = await setupWorld(ctx);

    const own = await record(ctx, world.admin, incomeBody(world));

    expect(own.status).toBe('PENDING');
    expect(own.permissions.canReview).toBe(true);
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

    const res = await call(ctx, world.staff, 'post', TRANSACTIONS)
      .send({ ...expenseBody(world), ...override })
      .expect(400);

    expect(errorFields(res.body)).toContain(field);
    expect(await ctx.prisma.transaction.count()).toBe(0);
  });

  it('accepts today as the transaction date', async () => {
    const world = await setupWorld(ctx);
    const today = todayInJakarta();
    expect((await record(ctx, world.staff, expenseBody(world, { transactionDate: today }))).transactionDate).toBe(
      today,
    );
  });

  it('checks that the category fits: right type, active, not a transfer category, existing', async () => {
    const world = await setupWorld(ctx);
    const inactive = await createCategory(ctx.prisma, { type: 'OUT', isActive: false });
    const system = await createCategory(ctx.prisma, { name: 'Transfer Keluar', type: 'OUT', isSystem: true });

    for (const categoryId of [world.income.id, inactive.id, system.id, randomUUID()]) {
      const res = await call(ctx, world.staff, 'post', TRANSACTIONS)
        .send(expenseBody(world, { categoryId }))
        .expect(400);
      expect(errorFields(res.body)).toEqual(['categoryId']);
    }
  });

  it('checks that the account exists and is active', async () => {
    const world = await setupWorld(ctx);
    const inactive = await createAccount(ctx.prisma, { isActive: false });

    for (const accountId of [inactive.id, randomUUID()]) {
      const res = await call(ctx, world.staff, 'post', TRANSACTIONS)
        .send(expenseBody(world, { accountId }))
        .expect(400);
      expect(errorFields(res.body)).toEqual(['accountId']);
    }
  });

  it('reports every problem at once', async () => {
    const world = await setupWorld(ctx);

    const res = await call(ctx, world.staff, 'post', TRANSACTIONS)
      .send(expenseBody(world, { accountId: randomUUID(), categoryId: world.income.id }))
      .expect(400);

    expect(errorFields(res.body).sort()).toEqual(['accountId', 'categoryId']);
  });

  it('requires a token', async () => {
    const world = await setupWorld(ctx);
    await api(ctx).post(TRANSACTIONS).send(expenseBody(world)).expect(401);
  });
});
