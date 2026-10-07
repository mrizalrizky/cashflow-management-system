import { SAMPLE_FILES } from '../src/attachments/testing/sample-files.js';
import { E2eContext, setupE2e } from './e2e-context.js';
import { assign, call, errorFields, loginAs, TestSession } from './fixtures.js';
import { ACCOUNTS, ATTACHMENTS } from './routes.js';
import {
  expenseBody,
  incomeBody,
  record,
  setupWorld,
  transactionUrl,
  World,
} from './transaction-fixtures.js';

const OPENING = 1_000_000;

async function balance(ctx: E2eContext, world: World): Promise<number> {
  const res = await call(ctx, world.admin, 'get', ACCOUNTS).expect(200);
  const account = res.body.data.find((a: { id: string }) => a.id === world.account.id);
  return Number(account.balance);
}

function act(ctx: E2eContext, session: TestSession, id: string, action: string, reason?: string) {
  const req = call(ctx, session, 'post', transactionUrl(id, action));
  return reason === undefined ? req : req.send({ reason });
}

async function attachProof(ctx: E2eContext, session: TestSession, id: string): Promise<void> {
  await call(ctx, session, 'post', transactionUrl(id, 'attachments'))
    .attach('file', SAMPLE_FILES.pdf, 'nota.pdf')
    .expect(201);
}

/** Pengeluaran staf di proyek A, sudah berbukti dan siap ditinjau. */
async function expenseWithProof(ctx: E2eContext, world: World, overrides = {}) {
  const tx = await record(ctx, world.staff, expenseBody(world, { projectId: world.projectA.id, ...overrides }));
  await attachProof(ctx, world.staff, tx.id);
  return tx;
}

describe('POST /transactions/:id/approve', () => {
  const ctx = setupE2e();

  it('approves income, moves the balance by exactly the amount, and records who reviewed', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, incomeBody(world));
    expect(await balance(ctx, world)).toBe(OPENING);

    const res = await act(ctx, world.admin, tx.id, 'approve').expect(200);

    expect(res.body).toMatchObject({
      status: 'APPROVED',
      reviewedBy: { id: world.admin.user.id, name: 'Admin' },
      accountBalance: String(OPENING + 500_000),
      permissions: { canEdit: false, canReview: false, canVoid: true },
    });
    expect(res.body.reviewedAt).toEqual(expect.any(String));
    expect(await balance(ctx, world)).toBe(OPENING + 500_000);
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'APPROVE' } });
    expect(audit).toMatchObject({ user_id: world.admin.user.id, entity_id: tx.id });
    expect(audit.before).toMatchObject({ status: 'PENDING' });
    expect(audit.after).toMatchObject({ status: 'APPROVED', reviewed_by_id: world.admin.user.id });
  });

  it('requires proof for an expense, but not for income', async () => {
    const world = await setupWorld(ctx);
    const expense = await record(ctx, world.staff, expenseBody(world));

    const refused = await act(ctx, world.admin, expense.id, 'approve').expect(400);
    expect(refused.body).toEqual({
      statusCode: 400,
      message: 'Pengeluaran wajib punya bukti sebelum disetujui',
    });
    expect(await balance(ctx, world)).toBe(OPENING);

    await attachProof(ctx, world.staff, expense.id);
    await act(ctx, world.admin, expense.id, 'approve').expect(200);
    expect(await balance(ctx, world)).toBe(OPENING - 150_000);
  });

  it('never refuses because the balance would go negative, and tells only the admin the balance', async () => {
    const world = await setupWorld(ctx);
    const big = await expenseWithProof(ctx, world, { amount: '2500000' });
    const small = await expenseWithProof(ctx, world);

    const byAdmin = await act(ctx, world.admin, big.id, 'approve').expect(200);
    expect(byAdmin.body.accountBalance).toBe(String(OPENING - 2_500_000));

    const byManager = await act(ctx, world.manager, small.id, 'approve').expect(200);
    expect(byManager.body.status).toBe('APPROVED');
    expect(byManager.body).not.toHaveProperty('accountBalance');
  });

  it('follows the review rules for each role', async () => {
    const world = await setupWorld(ctx);
    const otherManager = await loginAs(ctx, { role: 'PROJECT_MANAGER' });
    await assign(ctx.prisma, world.projectA.id, otherManager.user.id);

    const staffOnA = await expenseWithProof(ctx, world);
    const staffOnB = await expenseWithProof(ctx, world, { projectId: world.projectB.id });
    const staffOverhead = await expenseWithProof(ctx, world, { projectId: null });
    const managersOwn = await record(ctx, world.manager, incomeBody(world, { projectId: world.projectA.id }));
    const colleagues = await record(ctx, otherManager, incomeBody(world, { projectId: world.projectA.id }));
    const adminsOwn = await record(ctx, world.admin, incomeBody(world));

    // Koordinator: hanya transaksi orang lain (bukan sesama koordinator) di proyeknya.
    await act(ctx, world.manager, staffOnB.id, 'approve').expect(404);
    await act(ctx, world.manager, staffOverhead.id, 'approve').expect(404);
    await act(ctx, world.manager, managersOwn.id, 'approve').expect(403);
    await act(ctx, world.manager, colleagues.id, 'approve').expect(403);
    // Staf: tidak pernah.
    await act(ctx, world.staff, staffOnA.id, 'approve').expect(403);
    await act(ctx, world.otherStaff, staffOnA.id, 'approve').expect(404);

    expect(await ctx.prisma.transaction.count({ where: { status: 'APPROVED' } })).toBe(0);

    await act(ctx, world.manager, staffOnA.id, 'approve').expect(200);
    // Admin: semuanya, termasuk miliknya sendiri dan milik koordinator.
    for (const tx of [staffOnB, staffOverhead, managersOwn, colleagues, adminsOwn]) {
      await act(ctx, world.admin, tx.id, 'approve').expect(200);
    }
  });

  it('still works after the account or category was deactivated or the project completed', async () => {
    const world = await setupWorld(ctx);
    const tx = await expenseWithProof(ctx, world);
    await ctx.prisma.account.update({ where: { id: world.account.id }, data: { is_active: false } });
    await ctx.prisma.category.update({ where: { id: world.expense.id }, data: { is_active: false } });
    await ctx.prisma.project.update({ where: { id: world.projectA.id }, data: { status: 'COMPLETED' } });

    await act(ctx, world.manager, tx.id, 'approve').expect(200);
  });

  it('answers 409 for anything that is no longer pending', async () => {
    const world = await setupWorld(ctx);
    const tx = await expenseWithProof(ctx, world);
    await act(ctx, world.admin, tx.id, 'approve').expect(200);

    await act(ctx, world.admin, tx.id, 'approve').expect(409);
    await act(ctx, world.admin, tx.id, 'reject', 'Terlambat').expect(409);
    await act(ctx, world.manager, tx.id, 'approve').expect(409);
    expect(await balance(ctx, world)).toBe(OPENING - 150_000);
  });

  it('counts the transaction once when two people approve at the same moment', async () => {
    const world = await setupWorld(ctx);
    const tx = await expenseWithProof(ctx, world);

    const results = await Promise.all([
      act(ctx, world.admin, tx.id, 'approve'),
      act(ctx, world.manager, tx.id, 'approve'),
    ]);

    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(await balance(ctx, world)).toBe(OPENING - 150_000);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'APPROVE' } })).toBe(1);
  });

  it('lets only one of an approval and a rejection at the same moment win', async () => {
    const world = await setupWorld(ctx);
    const tx = await expenseWithProof(ctx, world);

    const results = await Promise.all([
      act(ctx, world.admin, tx.id, 'approve'),
      act(ctx, world.manager, tx.id, 'reject', 'Nota buram'),
    ]);

    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
    const row = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    const audits = await ctx.prisma.auditLog.count({ where: { action: { in: ['APPROVE', 'REJECT'] } } });
    expect(['APPROVED', 'REJECTED']).toContain(row.status);
    expect(audits).toBe(1);
  });

  it('cannot approve an expense whose last proof is being removed at the same moment', async () => {
    const world = await setupWorld(ctx);
    const tx = await expenseWithProof(ctx, world);
    const attachment = await ctx.prisma.attachment.findFirstOrThrow({ where: { transaction_id: tx.id } });

    await Promise.all([
      act(ctx, world.admin, tx.id, 'approve'),
      call(ctx, world.staff, 'delete', `/api/v1/attachments/${attachment.id}`),
    ]);

    const row = await ctx.prisma.transaction.findUniqueOrThrow({
      where: { id: tx.id },
      include: { attachments: true },
    });
    // Salah satu menang, tetapi tidak pernah "disetujui tanpa bukti".
    expect(row.status === 'APPROVED' && row.attachments.length === 0).toBe(false);
  });
});

describe('POST /transactions/:id/reject', () => {
  const ctx = setupE2e();

  it('rejects with a reason, leaving balances alone and letting the creator fix it', async () => {
    const world = await setupWorld(ctx);
    const tx = await expenseWithProof(ctx, world);

    const res = await act(ctx, world.manager, tx.id, 'reject', '  Nota tidak terbaca  ').expect(200);

    expect(res.body).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'Nota tidak terbaca',
      reviewedBy: { id: world.manager.user.id },
    });
    expect(await balance(ctx, world)).toBe(OPENING);
    const forCreator = await call(ctx, world.staff, 'get', transactionUrl(tx.id)).expect(200);
    expect(forCreator.body.permissions).toMatchObject({ canEdit: true, canAttach: true, canCancel: false });
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'REJECT' } });
    expect(audit.after).toMatchObject({ status: 'REJECTED', reject_reason: 'Nota tidak terbaca' });
  });

  it.each([undefined, '', '   ', 'x'.repeat(501)])('requires a usable reason, not %j', async (reason) => {
    const world = await setupWorld(ctx);
    const tx = await expenseWithProof(ctx, world);

    const res = await call(ctx, world.admin, 'post', transactionUrl(tx.id, 'reject'))
      .send(reason === undefined ? {} : { reason })
      .expect(400);

    expect(errorFields(res.body)).toEqual(['reason']);
  });

  it('needs no proof, and follows the same who-may-review rules', async () => {
    const world = await setupWorld(ctx);
    const noProof = await record(ctx, world.staff, expenseBody(world, { projectId: world.projectA.id }));
    const onB = await record(ctx, world.staff, expenseBody(world, { projectId: world.projectB.id }));

    await act(ctx, world.staff, noProof.id, 'reject', 'x').expect(403);
    await act(ctx, world.manager, onB.id, 'reject', 'x').expect(404);
    await act(ctx, world.manager, noProof.id, 'reject', 'Tanpa bukti').expect(200);
  });
});

describe('POST /transactions/:id/void', () => {
  const ctx = setupE2e();

  it('voids an approved transaction with a reason and gives the balance back', async () => {
    const world = await setupWorld(ctx);
    const tx = await expenseWithProof(ctx, world);
    await act(ctx, world.admin, tx.id, 'approve').expect(200);
    expect(await balance(ctx, world)).toBe(OPENING - 150_000);

    const res = await act(ctx, world.admin, tx.id, 'void', 'Dobel input').expect(200);

    expect(res.body).toMatchObject({
      status: 'VOID',
      voidedBy: { id: world.admin.user.id },
      voidReason: 'Dobel input',
      permissions: { canEdit: false, canCancel: false, canReview: false, canVoid: false, canAttach: false },
    });
    expect(await balance(ctx, world)).toBe(OPENING);
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'VOID' } });
    expect(audit.before).toMatchObject({ status: 'APPROVED' });
    expect(audit.after).toMatchObject({ status: 'VOID', void_reason: 'Dobel input' });
    expect(await ctx.prisma.transaction.count()).toBe(1);
    expect(await ctx.prisma.attachment.count()).toBe(1);
  });

  it('is for the admin only', async () => {
    const world = await setupWorld(ctx);
    const tx = await expenseWithProof(ctx, world);
    await act(ctx, world.admin, tx.id, 'approve').expect(200);

    await act(ctx, world.manager, tx.id, 'void', 'x').expect(403);
    await act(ctx, world.staff, tx.id, 'void', 'x').expect(403);
    await act(ctx, world.otherStaff, tx.id, 'void', 'x').expect(404);
    expect(await balance(ctx, world)).toBe(OPENING - 150_000);
  });

  it('applies only to approved transactions and needs a reason', async () => {
    const world = await setupWorld(ctx);
    const pending = await expenseWithProof(ctx, world);
    const approved = await expenseWithProof(ctx, world);
    await act(ctx, world.admin, approved.id, 'approve').expect(200);

    const res = await act(ctx, world.admin, pending.id, 'void', 'x').expect(409);
    expect(res.body.message).toBe('Transaksi tidak bisa dibatalkan (void) pada status ini');
    await call(ctx, world.admin, 'post', transactionUrl(approved.id, 'void')).send({}).expect(400);

    await act(ctx, world.admin, approved.id, 'void', 'Salah akun').expect(200);
    await act(ctx, world.admin, approved.id, 'void', 'Lagi').expect(409);
  });
});

describe('reviewing only the version that was seen', () => {
  const ctx = setupE2e();
  const CHANGED = 'Transaksi berubah sejak Anda membukanya. Periksa lagi sebelum memproses.';

  function review(session: TestSession, id: string, action: 'approve' | 'reject', expectedUpdatedAt: string) {
    const reason = action === 'reject' ? { reason: 'Tidak sesuai' } : {};
    return call(ctx, session, 'post', transactionUrl(id, action)).send({ ...reason, expectedUpdatedAt });
  }

  async function seen(session: TestSession, id: string): Promise<string> {
    const res = await call(ctx, session, 'get', transactionUrl(id)).expect(200);
    return res.body.updatedAt as string;
  }

  it.each(['approve', 'reject'] as const)(
    'refuses to %s a transaction that was edited after the reviewer opened it',
    async (action) => {
      const world = await setupWorld(ctx);
      const tx = await expenseWithProof(ctx, world);
      const opened = await seen(world.manager, tx.id);
      await call(ctx, world.staff, 'patch', transactionUrl(tx.id)).send({ amount: '9000000' }).expect(200);

      const res = await review(world.manager, tx.id, action, opened).expect(409);

      expect(res.body.message).toBe(CHANGED);
      const row = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
      expect(row.status).toBe('PENDING');
      await review(world.manager, tx.id, action, await seen(world.manager, tx.id)).expect(200);
    },
  );

  it('treats added or removed proof as a change', async () => {
    const world = await setupWorld(ctx);
    const tx = await expenseWithProof(ctx, world);
    const beforeUpload = await seen(world.manager, tx.id);

    await attachProof(ctx, world.staff, tx.id);
    await review(world.manager, tx.id, 'approve', beforeUpload).expect(409);

    const beforeRemoval = await seen(world.manager, tx.id);
    const [proof] = await ctx.prisma.attachment.findMany({ where: { transaction_id: tx.id } });
    await call(ctx, world.staff, 'delete', `${ATTACHMENTS}/${proof!.id}`).expect(204);
    await review(world.manager, tx.id, 'approve', beforeRemoval).expect(409);

    await review(world.manager, tx.id, 'approve', await seen(world.manager, tx.id)).expect(200);
  });

  it('refuses a version that is not a timestamp', async () => {
    const world = await setupWorld(ctx);
    const tx = await expenseWithProof(ctx, world);

    const res = await review(world.manager, tx.id, 'approve', 'kemarin').expect(400);

    expect(errorFields(res.body)).toEqual(['expectedUpdatedAt']);
  });
});
