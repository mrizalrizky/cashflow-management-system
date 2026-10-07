import { randomUUID } from 'node:crypto';
import type { TransactionResponse } from '../src/transactions/transaction.mapper.js';
import { E2eContext, setupE2e } from './e2e-context.js';
import { assign, call, createAccount, createCategory, TestSession } from './fixtures.js';
import { TRANSACTIONS } from './routes.js';
import {
  expenseBody,
  incomeBody,
  record,
  setupWorld,
  transactionUrl,
  World,
} from './transaction-fixtures.js';

async function list(ctx: E2eContext, session: TestSession, query = ''): Promise<TransactionResponse[]> {
  const res = await call(ctx, session, 'get', `${TRANSACTIONS}?${query}`).expect(200);
  return res.body.data as TransactionResponse[];
}

function descriptions(rows: TransactionResponse[]): string[] {
  return rows.map((row) => row.description).sort();
}

/** Satu transaksi per kombinasi pembuat dan tempat, dengan deskripsi yang menamai keduanya. */
async function seedTransactions(ctx: E2eContext, world: World) {
  const onA = { projectId: world.projectA.id };
  const onB = { projectId: world.projectB.id };
  return {
    staffOnA: await record(ctx, world.staff, expenseBody(world, { ...onA, description: 'staf di A' })),
    staffOnB: await record(ctx, world.staff, expenseBody(world, { ...onB, description: 'staf di B' })),
    staffOverhead: await record(ctx, world.staff, expenseBody(world, { description: 'staf overhead' })),
    otherOnA: await record(ctx, world.otherStaff, expenseBody(world, { ...onA, description: 'staf lain di A' })),
    managerOnA: await record(ctx, world.manager, expenseBody(world, { ...onA, description: 'koordinator di A' })),
    adminOnB: await record(ctx, world.admin, incomeBody(world, { ...onB, description: 'admin di B' })),
  };
}

describe('GET /transactions: who sees what', () => {
  const ctx = setupE2e();

  it('shows an admin everything, a project manager their projects, and staff their own', async () => {
    const world = await setupWorld(ctx);
    await seedTransactions(ctx, world);

    expect(descriptions(await list(ctx, world.admin))).toHaveLength(6);
    expect(descriptions(await list(ctx, world.manager))).toEqual([
      'koordinator di A',
      'staf di A',
      'staf lain di A',
    ]);
    expect(descriptions(await list(ctx, world.staff))).toEqual([
      'staf di A',
      'staf di B',
      'staf overhead',
    ]);
  });

  it('hides a project manager’s own transaction once they are removed from its project', async () => {
    const world = await setupWorld(ctx);
    await assign(ctx.prisma, world.projectB.id, world.manager.user.id);
    const own = await record(
      ctx,
      world.manager,
      expenseBody(world, { projectId: world.projectB.id, description: 'koordinator di B' }),
    );

    await ctx.prisma.projectMember.delete({
      where: { project_id_user_id: { project_id: world.projectB.id, user_id: world.manager.user.id } },
    });

    expect(descriptions(await list(ctx, world.manager))).toEqual([]);
    await call(ctx, world.manager, 'get', transactionUrl(own.id)).expect(404);
  });

  it('answers a transaction outside the caller’s scope exactly like one that does not exist', async () => {
    const world = await setupWorld(ctx);
    const seeded = await seedTransactions(ctx, world);

    const missing = await call(ctx, world.manager, 'get', transactionUrl(randomUUID())).expect(404);
    expect(missing.body).toEqual({ statusCode: 404, message: 'Transaksi tidak ditemukan' });

    for (const [session, hidden] of [
      [world.manager, seeded.staffOnB],
      [world.manager, seeded.staffOverhead],
      [world.staff, seeded.otherOnA],
      [world.otherStaff, seeded.staffOnA],
    ] as const) {
      const res = await call(ctx, session, 'get', transactionUrl(hidden.id)).expect(404);
      expect(res.body).toEqual(missing.body);
    }

    await call(ctx, world.manager, 'get', transactionUrl(seeded.staffOnA.id)).expect(200);
    await call(ctx, world.staff, 'get', transactionUrl(seeded.staffOnA.id)).expect(200);
    await call(ctx, world.admin, 'get', transactionUrl(seeded.staffOverhead.id)).expect(200);
    await call(ctx, world.staff, 'get', transactionUrl('bukan-uuid')).expect(400);
  });

  it('never lets a filter widen what the caller may see', async () => {
    const world = await setupWorld(ctx);
    await seedTransactions(ctx, world);

    expect(await list(ctx, world.manager, `projectId=${world.projectB.id}`)).toEqual([]);
    expect(await list(ctx, world.manager, 'overhead=true')).toEqual([]);
    expect(await list(ctx, world.manager, 'search=overhead')).toEqual([]);
    expect(descriptions(await list(ctx, world.staff, 'search=staf'))).toEqual([
      'staf di A',
      'staf di B',
      'staf overhead',
    ]);
    expect(await list(ctx, world.staff, 'search=lain')).toEqual([]);
    expect(await list(ctx, world.staff, `accountId=${world.account.id}`)).toHaveLength(3);
  });

  it('tells each caller what they may do with each row', async () => {
    const world = await setupWorld(ctx);
    await seedTransactions(ctx, world);

    const forManager = Object.fromEntries(
      (await list(ctx, world.manager)).map((row) => [row.description, row.permissions]),
    );

    expect(forManager['staf di A']).toMatchObject({ canReview: true, canEdit: false });
    expect(forManager['koordinator di A']).toMatchObject({ canReview: false, canEdit: true });
  });

  it('shows no balance or other account detail to anyone', async () => {
    const world = await setupWorld(ctx);
    await seedTransactions(ctx, world);

    for (const session of [world.admin, world.manager, world.staff]) {
      for (const row of await list(ctx, session)) {
        expect(row.account).toEqual({ id: world.account.id, name: 'Kas Uji' });
      }
    }
  });
});

describe('GET /transactions: filters, order and paging', () => {
  const ctx = setupE2e();

  it('filters by date range, type, status, account, category, project, overhead and text', async () => {
    const world = await setupWorld(ctx);
    const otherAccount = await createAccount(ctx.prisma, { name: 'Bank Lain' });
    const otherCategory = await createCategory(ctx.prisma, { name: 'Upah Uji', type: 'OUT' });
    const on = (projectId: string) => ({ projectId });

    await record(ctx, world.admin, expenseBody(world, { ...on(world.projectA.id), transactionDate: '2026-09-01', description: 'semen 100% asli' }));
    await record(ctx, world.admin, expenseBody(world, { ...on(world.projectB.id), transactionDate: '2026-09-15', description: 'upah tukang', categoryId: otherCategory.id }));
    await record(ctx, world.admin, incomeBody(world, { transactionDate: '2026-09-30', description: 'pendapatan lain', accountId: otherAccount.id }));
    await ctx.prisma.transaction.updateMany({ where: { description: 'upah tukang' }, data: { status: 'APPROVED' } });

    const found = async (query: string) => descriptions(await list(ctx, world.admin, query));

    expect(await found('dateFrom=2026-09-15')).toEqual(['pendapatan lain', 'upah tukang']);
    expect(await found('dateTo=2026-09-15')).toEqual(['semen 100% asli', 'upah tukang']);
    expect(await found('dateFrom=2026-09-01&dateTo=2026-09-01')).toEqual(['semen 100% asli']);
    expect(await found('type=IN')).toEqual(['pendapatan lain']);
    expect(await found('status=APPROVED')).toEqual(['upah tukang']);
    expect(await found(`accountId=${otherAccount.id}`)).toEqual(['pendapatan lain']);
    expect(await found(`categoryId=${otherCategory.id}`)).toEqual(['upah tukang']);
    expect(await found(`projectId=${world.projectA.id}`)).toEqual(['semen 100% asli']);
    expect(await found('overhead=true')).toEqual(['pendapatan lain']);
    expect(await found('search=TUKANG')).toEqual(['upah tukang']);
    expect(await found('search=100%25')).toEqual(['semen 100% asli']);
    expect(await found('search=%25%25')).toEqual([]);
  });

  it.each([
    'overhead=true&projectId=00000000-0000-4000-8000-000000000000',
    'dateFrom=2026-13-01',
    'status=DONE',
    'type=TRANSFER',
    'accountId=bukan-uuid',
    'overhead=mungkin',
  ])('rejects the query %s', async (query) => {
    const world = await setupWorld(ctx);
    await call(ctx, world.admin, 'get', `${TRANSACTIONS}?${query}`).expect(400);
  });

  it('lists the newest transaction date first, then the newest entry, with paging', async () => {
    const world = await setupWorld(ctx);
    for (const [description, transactionDate] of [
      ['lama', '2026-08-01'],
      ['baru pertama', '2026-09-20'],
      ['tengah', '2026-09-01'],
      ['baru kedua', '2026-09-20'],
    ]) {
      await record(ctx, world.admin, expenseBody(world, { description, transactionDate }));
    }

    const all = await call(ctx, world.admin, 'get', TRANSACTIONS).expect(200);
    expect(all.body.data.map((row: TransactionResponse) => row.description)).toEqual([
      'baru kedua',
      'baru pertama',
      'tengah',
      'lama',
    ]);

    const page = await call(ctx, world.admin, 'get', `${TRANSACTIONS}?page=2&pageSize=3`).expect(200);
    expect(page.body.data.map((row: TransactionResponse) => row.description)).toEqual(['lama']);
    expect(page.body.meta).toEqual({ page: 2, pageSize: 3, total: 4 });
  });
});
