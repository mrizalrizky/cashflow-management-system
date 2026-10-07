import { randomUUID } from 'node:crypto';
import { SAMPLE_FILES } from '../src/attachments/testing/sample-files.js';
import { todayInJakarta } from '../src/common/calendar-date.js';
import type { Account } from '../src/generated/prisma/client.js';
import type { TransactionResponse } from '../src/transactions/transaction.mapper.js';
import { E2eContext, setupE2e } from './e2e-context.js';
import {
  adminOnly,
  call,
  createAccount,
  createCategory,
  errorFields,
  expectAccess,
  TestSession,
} from './fixtures.js';
import { ACCOUNTS, TRANSACTIONS, TRANSFERS } from './routes.js';
import { setupWorld, transactionUrl, World } from './transaction-fixtures.js';

interface TransferWorld extends World {
  from: Account;
  to: Account;
}

/** Dunia biasa ditambah dua akun dan kategori sistem yang dibuat seed. */
async function setupTransferWorld(ctx: E2eContext, withSystemCategories = true): Promise<TransferWorld> {
  const world = await setupWorld(ctx);
  if (withSystemCategories) {
    await createCategory(ctx.prisma, { name: 'Transfer Keluar', type: 'OUT', isSystem: true });
    await createCategory(ctx.prisma, { name: 'Transfer Masuk', type: 'IN', isSystem: true });
  }
  return {
    ...world,
    from: await createAccount(ctx.prisma, { name: 'Bank Utama', type: 'BANK', openingBalance: 2_000_000n }),
    to: await createAccount(ctx.prisma, { name: 'Kas Kecil', type: 'CASH', openingBalance: 100_000n }),
  };
}

function transferBody(world: TransferWorld, overrides: Record<string, unknown> = {}) {
  return {
    fromAccountId: world.from.id,
    toAccountId: world.to.id,
    amount: '500000',
    transactionDate: '2026-10-01',
    description: 'Isi kas kecil',
    ...overrides,
  };
}

async function balances(ctx: E2eContext, world: TransferWorld): Promise<Record<string, number>> {
  const res = await call(ctx, world.admin, 'get', ACCOUNTS).expect(200);
  return Object.fromEntries(
    res.body.data.map((a: { name: string; balance: string }) => [a.name, Number(a.balance)]),
  );
}

async function transfer(ctx: E2eContext, world: TransferWorld): Promise<TransactionResponse[]> {
  const res = await call(ctx, world.admin, 'post', TRANSFERS).send(transferBody(world)).expect(201);
  return res.body as TransactionResponse[];
}

function voidLeg(ctx: E2eContext, session: TestSession, id: string) {
  return call(ctx, session, 'post', transactionUrl(id, 'void')).send({ reason: 'Salah akun' });
}

describe('POST /transactions/transfer', () => {
  const ctx = setupE2e();

  it('is for the admin only', async () => {
    const world = await setupTransferWorld(ctx);
    await expectAccess(ctx, { method: 'post', path: TRANSFERS, body: transferBody(world) }, adminOnly(201));
  });

  it('creates two approved, linked legs and moves the money without changing the total', async () => {
    const world = await setupTransferWorld(ctx);
    const before = await balances(ctx, world);

    const [out, incoming] = await transfer(ctx, world);

    expect(out).toMatchObject({
      type: 'OUT',
      amount: '500000',
      status: 'APPROVED',
      isTransfer: true,
      account: { id: world.from.id },
      category: { name: 'Transfer Keluar' },
      project: null,
      description: 'Isi kas kecil',
      transactionDate: '2026-10-01',
      createdBy: { id: world.admin.user.id },
      reviewedBy: { id: world.admin.user.id },
      permissions: { canEdit: false, canCancel: false, canReview: false, canVoid: true, canAttach: false },
    });
    expect(incoming).toMatchObject({
      type: 'IN',
      amount: '500000',
      status: 'APPROVED',
      isTransfer: true,
      account: { id: world.to.id },
      category: { name: 'Transfer Masuk' },
    });
    expect(out.transferGroupId).toEqual(expect.any(String));
    expect(incoming.transferGroupId).toBe(out.transferGroupId);

    const after = await balances(ctx, world);
    expect(after['Bank Utama']).toBe(before['Bank Utama']! - 500_000);
    expect(after['Kas Kecil']).toBe(before['Kas Kecil']! + 500_000);
    const total = (b: Record<string, number>) => Object.values(b).reduce((sum, value) => sum + value, 0);
    expect(total(after)).toBe(total(before));
  });

  it('records one audit entry naming both legs', async () => {
    const world = await setupTransferWorld(ctx);

    const [out, incoming] = await transfer(ctx, world);

    const rows = await ctx.prisma.auditLog.findMany({ where: { action: 'TRANSFER' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: world.admin.user.id, entity_type: 'transaction' });
    expect(rows[0]!.after).toMatchObject({
      transfer_group_id: out!.transferGroupId,
      out_transaction_id: out!.id,
      in_transaction_id: incoming!.id,
      amount: '500000',
    });
  });

  it.each([
    ['the same account on both sides', (w: TransferWorld) => ({ toAccountId: w.from.id }), 'toAccountId'],
    ['an unknown source account', () => ({ fromAccountId: randomUUID() }), 'fromAccountId'],
    ['an unknown destination account', () => ({ toAccountId: randomUUID() }), 'toAccountId'],
    ['a zero amount', () => ({ amount: '0' }), 'amount'],
    ['a malformed amount', () => ({ amount: '5.000' }), 'amount'],
    ['an empty description', () => ({ description: ' ' }), 'description'],
    ['a project', () => ({ projectId: randomUUID() }), 'projectId'],
  ])('rejects %s and writes nothing', async (_label, override, field) => {
    const world = await setupTransferWorld(ctx);

    const res = await call(ctx, world.admin, 'post', TRANSFERS)
      .send(transferBody(world, override(world)))
      .expect(400);

    expect(errorFields(res.body)).toContain(field);
    expect(await ctx.prisma.transaction.count()).toBe(0);
  });

  it('rejects an inactive account and a date in the future', async () => {
    const world = await setupTransferWorld(ctx);
    const inactive = await createAccount(ctx.prisma, { isActive: false });
    const tomorrow = new Date(`${todayInJakarta()}T00:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const closed = await call(ctx, world.admin, 'post', TRANSFERS)
      .send(transferBody(world, { toAccountId: inactive.id }))
      .expect(400);
    expect(errorFields(closed.body)).toEqual(['toAccountId']);

    const future = await call(ctx, world.admin, 'post', TRANSFERS)
      .send(transferBody(world, { transactionDate: tomorrow.toISOString().slice(0, 10) }))
      .expect(400);
    expect(errorFields(future.body)).toEqual(['transactionDate']);
  });

  it('fails cleanly, writing nothing, when the system categories are missing', async () => {
    const world = await setupTransferWorld(ctx, false);

    const res = await call(ctx, world.admin, 'post', TRANSFERS).send(transferBody(world)).expect(500);

    expect(res.body).toEqual({ statusCode: 500, message: 'Terjadi kesalahan pada server' });
    expect(await ctx.prisma.transaction.count()).toBe(0);
  });
});

describe('transfer legs afterwards', () => {
  const ctx = setupE2e();

  it('appear in the list as transfers and can be left out', async () => {
    const world = await setupTransferWorld(ctx);
    await transfer(ctx, world);

    const all = await call(ctx, world.admin, 'get', TRANSACTIONS).expect(200);
    expect(all.body.data.map((row: TransactionResponse) => row.isTransfer)).toEqual([true, true]);

    const without = await call(ctx, world.admin, 'get', `${TRANSACTIONS}?includeTransfers=false`).expect(200);
    expect(without.body.data).toEqual([]);
    const withThem = await call(ctx, world.admin, 'get', `${TRANSACTIONS}?includeTransfers=true`).expect(200);
    expect(withThem.body.data).toHaveLength(2);
  });

  it('cannot be edited, cancelled, reviewed or given proof on their own', async () => {
    const world = await setupTransferWorld(ctx);
    const [out] = await transfer(ctx, world);
    const url = (action?: string) => transactionUrl(out!.id, action);

    await call(ctx, world.admin, 'patch', url()).send({ amount: '1' }).expect(409);
    await call(ctx, world.admin, 'post', url('cancel')).send({ reason: 'x' }).expect(409);
    await call(ctx, world.admin, 'post', url('approve')).expect(409);
    await call(ctx, world.admin, 'post', url('reject')).send({ reason: 'x' }).expect(409);
    await call(ctx, world.admin, 'post', url('attachments')).attach('file', SAMPLE_FILES.pdf, 'nota.pdf').expect(409);

    expect(await ctx.prisma.transaction.count({ where: { status: 'APPROVED' } })).toBe(2);
  });

  it.each([0, 1])('are voided together when leg %i is voided, returning both balances', async (index) => {
    const world = await setupTransferWorld(ctx);
    const before = await balances(ctx, world);
    const legs = await transfer(ctx, world);

    const res = await voidLeg(ctx, world.admin, legs[index]!.id).expect(200);

    expect(res.body).toMatchObject({ id: legs[index]!.id, status: 'VOID', voidReason: 'Salah akun' });
    const rows = await ctx.prisma.transaction.findMany();
    expect(rows.map((row) => [row.status, row.void_reason, row.voided_by_id])).toEqual([
      ['VOID', 'Salah akun', world.admin.user.id],
      ['VOID', 'Salah akun', world.admin.user.id],
    ]);
    expect(await balances(ctx, world)).toEqual(before);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'VOID' } })).toBe(2);

    await voidLeg(ctx, world.admin, legs[1 - index]!.id).expect(409);
  });

  it('are voided exactly once when both legs are voided at the same moment', async () => {
    const world = await setupTransferWorld(ctx);
    const before = await balances(ctx, world);
    const [out, incoming] = await transfer(ctx, world);

    const results = await Promise.all([
      voidLeg(ctx, world.admin, out!.id),
      voidLeg(ctx, world.admin, incoming!.id),
    ]);

    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(await balances(ctx, world)).toEqual(before);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'VOID' } })).toBe(2);
  });

  it('never count as income or expense of a project, and are invisible to other roles', async () => {
    const world = await setupTransferWorld(ctx);
    await transfer(ctx, world);

    for (const session of [world.manager, world.staff]) {
      const res = await call(ctx, session, 'get', TRANSACTIONS).expect(200);
      expect(res.body.data).toEqual([]);
    }
    expect(await ctx.prisma.transaction.count({ where: { project_id: { not: null } } })).toBe(0);
  });
});
