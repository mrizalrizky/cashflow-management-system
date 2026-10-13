import { SAMPLE_FILES } from '../src/attachments/testing/sample-files.js';
import type { TransactionResponse } from '../src/transactions/transaction.mapper.js';
import { E2eContext, setupE2e } from './e2e-context.js';
import { call, TestSession } from './fixtures.js';
import { ACCOUNTS, DASHBOARD } from './routes.js';
import { expenseBody, incomeBody, record, setupWorld, transactionUrl, World } from './transaction-fixtures.js';

async function seen(ctx: E2eContext, session: TestSession, id: string): Promise<TransactionResponse> {
  const res = await call(ctx, session, 'get', transactionUrl(id)).expect(200);
  return res.body as TransactionResponse;
}

async function balance(ctx: E2eContext, world: World): Promise<string> {
  const res = await call(ctx, world.owner, 'get', ACCOUNTS).expect(200);
  const accounts = res.body.data as { id: string; balance: string }[];
  return accounts.find((account) => account.id === world.account.id)!.balance;
}

async function expenseTotal(ctx: E2eContext, world: World): Promise<string> {
  const res = await call(ctx, world.owner, 'get', `${DASHBOARD}?from=2026-10-01&to=2026-10-31`).expect(200);
  return res.body.totals.expense as string;
}

describe('transaction flow in the personal edition', () => {
  const ctx = setupE2e();

  it('counts an expense at once, follows an edit, keeps the proof, and gives the money back on void', async () => {
    const world = await setupWorld(ctx);
    const owner = world.owner;
    expect(await balance(ctx, world)).toBe('1000000');

    // Dicatat: langsung tercatat dan mengurangi saldo, tanpa menunggu siapa pun.
    const expense = await record(ctx, owner, expenseBody(world, { amount: '150000' }));
    expect(expense).toMatchObject({ status: 'APPROVED', permissions: { canEdit: true, canAttach: true, canVoid: true } });
    expect(await balance(ctx, world)).toBe('850000');
    expect(await expenseTotal(ctx, world)).toBe('150000');

    // Bukti boleh ditambahkan sesudahnya.
    await call(ctx, owner, 'post', transactionUrl(expense.id, 'attachments'))
      .attach('file', SAMPLE_FILES.jpeg, { filename: 'nota.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect((await seen(ctx, owner, expense.id)).attachments).toHaveLength(1);

    // Diubah: saldo dan dasbor langsung mengikuti, status tetap tercatat.
    await call(ctx, owner, 'patch', transactionUrl(expense.id)).send({ amount: '200000' }).expect(200);
    expect(await balance(ctx, world)).toBe('800000');
    expect(await expenseTotal(ctx, world)).toBe('200000');

    // Pemasukan ikut dihitung dengan cara yang sama.
    await record(ctx, owner, incomeBody(world, { amount: '50000' }));
    expect(await balance(ctx, world)).toBe('850000');

    // Dibatalkan: tidak dihitung lagi, tetapi tetap ada beserta alasannya.
    const voided = await call(ctx, owner, 'post', transactionUrl(expense.id, 'void'))
      .send({ reason: 'Salah catat' })
      .expect(200);
    expect(voided.body).toMatchObject({
      status: 'VOID',
      voidReason: 'Salah catat',
      permissions: { canEdit: false, canAttach: false, canVoid: false },
    });
    expect(await balance(ctx, world)).toBe('1050000');
    expect(await expenseTotal(ctx, world)).toBe('0');
    expect(await ctx.prisma.transaction.count()).toBe(2);
  });
});
