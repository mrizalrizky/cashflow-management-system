import type { Account, Category } from '../src/generated/prisma/client.js';
import type { TransactionResponse } from '../src/transactions/transaction.mapper.js';
import type { E2eContext } from './e2e-context.js';
import { asOwner, call, createAccount, createCategory, TestSession } from './fixtures.js';
import { TRANSACTIONS } from './routes.js';

type OwnerSession = Awaited<ReturnType<typeof asOwner>>;

export interface Ledger {
  account: Account;
  expense: Category;
  income: Category;
}

/** Satu akun dan satu kategori untuk tiap tipe: yang minimal dibutuhkan untuk mencatat transaksi. */
export async function setupLedger(ctx: E2eContext): Promise<Ledger> {
  return {
    account: await createAccount(ctx.prisma, { name: 'Kas Uji', openingBalance: 1_000_000n }),
    expense: await createCategory(ctx.prisma, { name: 'Material Uji', type: 'OUT' }),
    income: await createCategory(ctx.prisma, { name: 'Termin Uji', type: 'IN' }),
  };
}

export interface World extends Ledger {
  owner: OwnerSession;
}

/** Dunia kecil yang dipakai sebagian besar test transaksi: buku besar dan pemiliknya. */
export async function setupWorld(ctx: E2eContext): Promise<World> {
  const ledger = await setupLedger(ctx);
  return { ...ledger, owner: await asOwner(ctx) };
}

export interface TransactionBody {
  type: 'IN' | 'OUT';
  amount: string;
  transactionDate: string;
  description: string;
  accountId: string;
  categoryId: string;
  installmentId?: string | null;
}

/** Isi permintaan untuk sebuah pengeluaran yang sah; timpa bagian yang sedang diuji. */
export function expenseBody(ledger: Ledger, overrides: Partial<TransactionBody> = {}): TransactionBody {
  return {
    type: 'OUT',
    amount: '150000',
    transactionDate: '2026-10-01',
    description: 'Beli semen',
    accountId: ledger.account.id,
    categoryId: ledger.expense.id,
    ...overrides,
  };
}

export function incomeBody(ledger: Ledger, overrides: Partial<TransactionBody> = {}): TransactionBody {
  return expenseBody(ledger, {
    type: 'IN',
    amount: '500000',
    description: 'Termin pertama',
    categoryId: ledger.income.id,
    ...overrides,
  });
}

/** Mencatat transaksi lewat API atas nama sebuah sesi dan mengembalikan hasilnya. */
export async function record(
  ctx: E2eContext,
  session: TestSession,
  body: TransactionBody,
): Promise<TransactionResponse> {
  const res = await call(ctx, session, 'post', TRANSACTIONS).send(body).expect(201);
  return res.body as TransactionResponse;
}

export function transactionUrl(id: string, action?: string): string {
  return action ? `${TRANSACTIONS}/${id}/${action}` : `${TRANSACTIONS}/${id}`;
}
