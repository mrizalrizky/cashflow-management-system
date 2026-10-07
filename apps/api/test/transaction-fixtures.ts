import type { Account, Category, Project } from '../src/generated/prisma/client.js';
import type { TransactionResponse } from '../src/transactions/transaction.mapper.js';
import type { E2eContext } from './e2e-context.js';
import {
  asAdmin,
  assign,
  call,
  createAccount,
  createCategory,
  createProject,
  loginAs,
  TestSession,
} from './fixtures.js';
import { TRANSACTIONS } from './routes.js';

type UserSession = Awaited<ReturnType<typeof loginAs>>;

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
  projectA: Project;
  projectB: Project;
  admin: UserSession;
  /** Koordinator yang ditugaskan ke proyek A saja. */
  manager: UserSession;
  staff: UserSession;
  otherStaff: UserSession;
}

/** Dunia kecil yang dipakai sebagian besar test transaksi: dua proyek dan satu orang per peran. */
export async function setupWorld(ctx: E2eContext): Promise<World> {
  const ledger = await setupLedger(ctx);
  const projectA = await createProject(ctx.prisma, { code: 'PRJ-A', name: 'Proyek A' });
  const projectB = await createProject(ctx.prisma, { code: 'PRJ-B', name: 'Proyek B' });
  const admin = await asAdmin(ctx);
  const manager = await loginAs(ctx, { role: 'PROJECT_MANAGER', name: 'Koordinator A' });
  const staff = await loginAs(ctx, { role: 'STAFF', name: 'Staf Satu' });
  const otherStaff = await loginAs(ctx, { role: 'STAFF', name: 'Staf Dua' });
  await assign(ctx.prisma, projectA.id, manager.user.id);
  return { ...ledger, projectA, projectB, admin, manager, staff, otherStaff };
}

export interface TransactionBody {
  type: 'IN' | 'OUT';
  amount: string;
  transactionDate: string;
  description: string;
  accountId: string;
  categoryId: string;
  projectId?: string | null;
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
