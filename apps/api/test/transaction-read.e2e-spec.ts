import { randomUUID } from 'node:crypto';
import type { TransactionResponse } from '../src/transactions/transaction.mapper.js';
import { E2eContext, setupE2e } from './e2e-context.js';
import { call, createAccount, createCategory, TestSession } from './fixtures.js';
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

/** Tiga transaksi pemilik. */
async function seedTransactions(ctx: E2eContext, world: World) {
  return {
    first: await record(ctx, world.owner, expenseBody(world, { description: 'beli satu' })),
    second: await record(ctx, world.owner, expenseBody(world, { description: 'beli dua' })),
    income: await record(ctx, world.owner, incomeBody(world, { description: 'gaji' })),
  };
}

describe('GET /transactions: reading', () => {
  const ctx = setupE2e();

  it('lists every transaction of the owner', async () => {
    const world = await setupWorld(ctx);
    await seedTransactions(ctx, world);

    expect(descriptions(await list(ctx, world.owner))).toEqual(['beli dua', 'beli satu', 'gaji']);
  });

  it('answers 404 for a transaction that does not exist and 400 for an id that is not one', async () => {
    const world = await setupWorld(ctx);
    const seeded = await seedTransactions(ctx, world);

    const missing = await call(ctx, world.owner, 'get', transactionUrl(randomUUID())).expect(404);
    expect(missing.body).toEqual({ statusCode: 404, message: 'Transaksi tidak ditemukan' });
    await call(ctx, world.owner, 'get', transactionUrl(seeded.first.id)).expect(200);
    await call(ctx, world.owner, 'get', transactionUrl('bukan-uuid')).expect(400);
  });

  it('tells what may be done with each row', async () => {
    const world = await setupWorld(ctx);
    await seedTransactions(ctx, world);

    const permissions = Object.fromEntries(
      (await list(ctx, world.owner)).map((row) => [row.description, row.permissions]),
    );
    expect(permissions['beli satu']).toEqual({ canEdit: true, canAttach: true, canVoid: true });
  });

  it('shows no balance or other account detail in a row', async () => {
    const world = await setupWorld(ctx);
    await seedTransactions(ctx, world);

    for (const row of await list(ctx, world.owner)) {
      expect(row.account).toEqual({ id: world.account.id, name: 'Kas Uji' });
    }
  });
});

describe('GET /transactions: filters, order and paging', () => {
  const ctx = setupE2e();

  it('filters by date range, type, status, account, category and text', async () => {
    const world = await setupWorld(ctx);
    const otherAccount = await createAccount(ctx.prisma, { name: 'Bank Lain' });
    const otherCategory = await createCategory(ctx.prisma, { name: 'Upah Uji', type: 'OUT' });

    await record(ctx, world.owner, expenseBody(world, { transactionDate: '2026-09-01', description: 'semen 100% asli' }));
    await record(ctx, world.owner, expenseBody(world, { transactionDate: '2026-09-15', description: 'upah tukang', categoryId: otherCategory.id }));
    await record(ctx, world.owner, incomeBody(world, { transactionDate: '2026-09-30', description: 'pendapatan lain', accountId: otherAccount.id }));
    await ctx.prisma.transaction.updateMany({ where: { description: 'upah tukang' }, data: { status: 'VOID' } });

    const found = async (query: string) => descriptions(await list(ctx, world.owner, query));

    expect(await found('dateFrom=2026-09-15')).toEqual(['pendapatan lain', 'upah tukang']);
    expect(await found('dateTo=2026-09-15')).toEqual(['semen 100% asli', 'upah tukang']);
    expect(await found('dateFrom=2026-09-01&dateTo=2026-09-01')).toEqual(['semen 100% asli']);
    expect(await found('type=IN')).toEqual(['pendapatan lain']);
    expect(await found('status=VOID')).toEqual(['upah tukang']);
    expect(await found('status=APPROVED')).toEqual(['pendapatan lain', 'semen 100% asli']);
    expect(await found(`accountId=${otherAccount.id}`)).toEqual(['pendapatan lain']);
    expect(await found(`categoryId=${otherCategory.id}`)).toEqual(['upah tukang']);
    expect(await found('search=TUKANG')).toEqual(['upah tukang']);
    expect(await found('search=100%25')).toEqual(['semen 100% asli']);
    expect(await found('search=%25%25')).toEqual([]);
  });

  it.each([
    'projectId=00000000-0000-4000-8000-000000000000',
    'dateFrom=2026-13-01',
    'status=DONE',
    'type=TRANSFER',
    'accountId=bukan-uuid',
    'overhead=true',
  ])('rejects the query %s', async (query) => {
    const world = await setupWorld(ctx);
    await call(ctx, world.owner, 'get', `${TRANSACTIONS}?${query}`).expect(400);
  });

  it('lists the newest transaction date first, then the newest entry, with paging', async () => {
    const world = await setupWorld(ctx);
    for (const [description, transactionDate] of [
      ['lama', '2026-08-01'],
      ['baru pertama', '2026-09-20'],
      ['tengah', '2026-09-01'],
      ['baru kedua', '2026-09-20'],
    ]) {
      await record(ctx, world.owner, expenseBody(world, { description, transactionDate }));
    }

    const all = await call(ctx, world.owner, 'get', TRANSACTIONS).expect(200);
    expect(all.body.data.map((row: TransactionResponse) => row.description)).toEqual([
      'baru kedua',
      'baru pertama',
      'tengah',
      'lama',
    ]);

    const page = await call(ctx, world.owner, 'get', `${TRANSACTIONS}?page=2&pageSize=3`).expect(200);
    expect(page.body.data.map((row: TransactionResponse) => row.description)).toEqual(['lama']);
    expect(page.body.meta).toEqual({ page: 2, pageSize: 3, total: 4 });
  });
});
