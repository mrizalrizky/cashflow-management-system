import { E2eContext, setupE2e } from './e2e-context.js';
import { call, createAccount, createCategory, errorFields } from './fixtures.js';
import { expenseBody, record, setupWorld, transactionUrl, World } from './transaction-fixtures.js';

/** Menandai transaksi sebagai ditolak langsung di database, seperti hasil peninjauan. */
async function markRejected(ctx: E2eContext, world: World, id: string): Promise<void> {
  await ctx.prisma.transaction.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewed_by_id: world.admin.user.id,
      reviewed_at: new Date(),
      reject_reason: 'Nota tidak terbaca',
    },
  });
}

async function setStatus(ctx: E2eContext, id: string, status: 'APPROVED' | 'VOID'): Promise<void> {
  await ctx.prisma.transaction.update({ where: { id }, data: { status } });
}

describe('PATCH /transactions/:id', () => {
  const ctx = setupE2e();

  it('lets the creator change every field of a pending transaction, recording before and after', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));

    const res = await call(ctx, world.staff, 'patch', transactionUrl(tx.id))
      .send({
        type: 'IN',
        amount: '275000',
        transactionDate: '2026-09-15',
        description: 'Termin kedua',
        categoryId: world.income.id,
      })
      .expect(200);

    expect(res.body).toMatchObject({
      type: 'IN',
      amount: '275000',
      transactionDate: '2026-09-15',
      description: 'Termin kedua',
      status: 'PENDING',
      category: { id: world.income.id },
    });
    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'UPDATE' } });
    expect(row).toMatchObject({ user_id: world.staff.user.id, entity_id: tx.id });
    expect(row.before).toMatchObject({ amount: '150000', type: 'OUT' });
    expect(row.after).toMatchObject({ amount: '275000', type: 'IN' });
  });

  it('applies the same rules as creation to the result', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));

    const mismatch = await call(ctx, world.staff, 'patch', transactionUrl(tx.id)).send({ type: 'IN' }).expect(400);
    expect(errorFields(mismatch.body)).toEqual(['categoryId']);

    for (const body of [{ amount: '0' }, { description: null }, { status: 'APPROVED' }, { amount: null }]) {
      await call(ctx, world.staff, 'patch', transactionUrl(tx.id)).send(body).expect(400);
    }
  });

  it('does not refuse an edit because the account or category was deactivated afterwards', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));
    await ctx.prisma.account.update({ where: { id: world.account.id }, data: { is_active: false } });
    await ctx.prisma.category.update({ where: { id: world.expense.id }, data: { is_active: false } });

    await call(ctx, world.staff, 'patch', transactionUrl(tx.id)).send({ amount: '99000' }).expect(200);
  });

  it.each([
    [
      'an inactive account',
      async (c: E2eContext) => ({ accountId: (await createAccount(c.prisma, { isActive: false })).id }),
      'accountId',
    ],
    [
      'an inactive category',
      async (c: E2eContext) => ({ categoryId: (await createCategory(c.prisma, { isActive: false })).id }),
      'categoryId',
    ],
    [
      'a category reserved for transfers',
      async (c: E2eContext) => ({ categoryId: (await createCategory(c.prisma, { isSystem: true })).id }),
      'categoryId',
    ],
  ])('refuses to move a transaction to %s', async (_label, change, field) => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));

    const res = await call(ctx, world.staff, 'patch', transactionUrl(tx.id)).send(await change(ctx)).expect(400);

    expect(errorFields(res.body)).toEqual([field]);
    const row = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect([row.account_id, row.category_id]).toEqual([world.account.id, world.expense.id]);
  });

  it('lets an admin edit anyone’s pending transaction, but nobody else', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));

    await call(ctx, world.admin, 'patch', transactionUrl(tx.id)).send({ amount: '1' }).expect(200);
    await call(ctx, world.otherStaff, 'patch', transactionUrl(tx.id)).send({ amount: '3' }).expect(404);
  });

  it.each(['APPROVED', 'VOID'] as const)('refuses to edit a %s transaction, even for an admin', async (status) => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));
    await setStatus(ctx, tx.id, status);

    for (const session of [world.admin, world.staff]) {
      const res = await call(ctx, session, 'patch', transactionUrl(tx.id)).send({ amount: '5' }).expect(409);
      expect(res.body.message).toBe('Transaksi tidak bisa diubah pada status ini');
    }
  });

  it('resubmits a rejected transaction when its creator edits it', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));
    await markRejected(ctx, world, tx.id);

    const res = await call(ctx, world.staff, 'patch', transactionUrl(tx.id))
      .send({ description: 'Beli semen (nota baru)' })
      .expect(200);

    expect(res.body).toMatchObject({
      status: 'PENDING',
      description: 'Beli semen (nota baru)',
      reviewedBy: null,
      reviewedAt: null,
      rejectReason: null,
    });
    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'RESUBMIT' } });
    expect(row.before).toMatchObject({ status: 'REJECTED', reject_reason: 'Nota tidak terbaca' });
    expect(row.after).toMatchObject({ status: 'PENDING', reject_reason: null });
  });

  it('resubmits even when nothing is changed', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));
    await markRejected(ctx, world, tx.id);

    const res = await call(ctx, world.staff, 'patch', transactionUrl(tx.id)).send({}).expect(200);

    expect(res.body.status).toBe('PENDING');
  });
});

describe('POST /transactions/:id/cancel', () => {
  const ctx = setupE2e();
  const reason = { reason: 'Salah input' };

  it('voids a pending transaction with a reason, for its creator', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));

    const res = await call(ctx, world.staff, 'post', transactionUrl(tx.id, 'cancel')).send(reason).expect(200);

    expect(res.body).toMatchObject({
      status: 'VOID',
      voidedBy: { id: world.staff.user.id },
      voidReason: 'Salah input',
      permissions: { canEdit: false, canCancel: false },
    });
    expect(res.body.voidedAt).toEqual(expect.any(String));
    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'CANCEL' } });
    expect(row.after).toMatchObject({ status: 'VOID', void_reason: 'Salah input' });
    expect(await ctx.prisma.transaction.count()).toBe(1);
  });

  it('is allowed for an admin, but not for someone else on another person’s transaction', async () => {
    const world = await setupWorld(ctx);
    const first = await record(ctx, world.staff, expenseBody(world));
    const second = await record(ctx, world.staff, expenseBody(world));

    await call(ctx, world.otherStaff, 'post', transactionUrl(first.id, 'cancel')).send(reason).expect(404);
    await call(ctx, world.admin, 'post', transactionUrl(second.id, 'cancel')).send(reason).expect(200);
  });

  it.each([{}, { reason: '   ' }, { reason: 'x'.repeat(501) }])('requires a usable reason: %j', async (body) => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));

    const res = await call(ctx, world.staff, 'post', transactionUrl(tx.id, 'cancel')).send(body).expect(400);

    expect(errorFields(res.body)).toEqual(['reason']);
  });

  it('answers 409 the second time, and for anything that is not pending', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));
    const approved = await record(ctx, world.staff, expenseBody(world));
    await setStatus(ctx, approved.id, 'APPROVED');

    await call(ctx, world.staff, 'post', transactionUrl(tx.id, 'cancel')).send(reason).expect(200);
    await call(ctx, world.staff, 'post', transactionUrl(tx.id, 'cancel')).send(reason).expect(409);
    await call(ctx, world.admin, 'post', transactionUrl(approved.id, 'cancel')).send(reason).expect(409);
  });

  it('lets only one of two simultaneous cancellations succeed', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));

    const results = await Promise.all([
      call(ctx, world.staff, 'post', transactionUrl(tx.id, 'cancel')).send(reason),
      call(ctx, world.admin, 'post', transactionUrl(tx.id, 'cancel')).send(reason),
    ]);

    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'CANCEL' } })).toBe(1);
  });
});
