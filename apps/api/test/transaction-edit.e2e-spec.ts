import { E2eContext, setupE2e } from './e2e-context.js';
import { assign, call, createAccount, createCategory, createProject, errorFields } from './fixtures.js';
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
    const tx = await record(ctx, world.staff, expenseBody(world, { projectId: world.projectA.id }));

    const res = await call(ctx, world.staff, 'patch', transactionUrl(tx.id))
      .send({
        type: 'IN',
        amount: '275000',
        transactionDate: '2026-09-15',
        description: 'Termin kedua',
        categoryId: world.income.id,
        projectId: world.projectB.id,
      })
      .expect(200);

    expect(res.body).toMatchObject({
      type: 'IN',
      amount: '275000',
      transactionDate: '2026-09-15',
      description: 'Termin kedua',
      status: 'PENDING',
      category: { id: world.income.id },
      project: { id: world.projectB.id },
    });
    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'UPDATE' } });
    expect(row).toMatchObject({ user_id: world.staff.user.id, entity_id: tx.id });
    expect(row.before).toMatchObject({ amount: '150000', type: 'OUT', project_id: world.projectA.id });
    expect(row.after).toMatchObject({ amount: '275000', type: 'IN', project_id: world.projectB.id });
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

  it('lets an admin edit anyone’s pending transaction, but not a project manager', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world, { projectId: world.projectA.id }));

    await call(ctx, world.admin, 'patch', transactionUrl(tx.id)).send({ amount: '1' }).expect(200);
    const res = await call(ctx, world.manager, 'patch', transactionUrl(tx.id)).send({ amount: '2' }).expect(403);
    expect(res.body.message).toBe('Anda tidak boleh mengubah transaksi ini');
    await call(ctx, world.otherStaff, 'patch', transactionUrl(tx.id)).send({ amount: '3' }).expect(404);
  });

  it('lets a transaction move only to a project the user may record for', async () => {
    const world = await setupWorld(ctx);
    const projectC = await createProject(ctx.prisma, { code: 'PRJ-C' });
    const closed = await createProject(ctx.prisma, { status: 'COMPLETED' });
    await assign(ctx.prisma, world.projectB.id, world.manager.user.id);
    const managers = await record(ctx, world.manager, expenseBody(world, { projectId: world.projectA.id }));
    const staffs = await record(ctx, world.staff, expenseBody(world, { projectId: world.projectA.id }));

    await call(ctx, world.manager, 'patch', transactionUrl(managers.id)).send({ projectId: world.projectB.id }).expect(200);
    await call(ctx, world.manager, 'patch', transactionUrl(managers.id)).send({ projectId: projectC.id }).expect(404);
    await call(ctx, world.manager, 'patch', transactionUrl(managers.id)).send({ projectId: null }).expect(403);

    const res = await call(ctx, world.staff, 'patch', transactionUrl(staffs.id)).send({ projectId: closed.id }).expect(400);
    expect(errorFields(res.body)).toEqual(['projectId']);
    await call(ctx, world.staff, 'patch', transactionUrl(staffs.id)).send({ projectId: null }).expect(200);
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

  it('is allowed for an admin, but not for a project manager on someone else’s transaction', async () => {
    const world = await setupWorld(ctx);
    const first = await record(ctx, world.staff, expenseBody(world, { projectId: world.projectA.id }));
    const second = await record(ctx, world.staff, expenseBody(world, { projectId: world.projectA.id }));

    await call(ctx, world.manager, 'post', transactionUrl(first.id, 'cancel')).send(reason).expect(403);
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
