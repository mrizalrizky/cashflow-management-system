import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createTestPrisma, resetDb } from './test-db.js';

describe('database schema', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('keeps only the personal-edition tables', async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
      ORDER BY table_name`;
    expect(rows.map((row) => row.table_name)).toEqual([
      'accounts',
      'attachments',
      'audit_logs',
      'categories',
      'refresh_tokens',
      'transactions',
      'users',
    ]);
  });

  it('stores the owner with a PIN and a lockout counter, and no email, password or role', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' ORDER BY column_name`;
    expect(columns.map((column) => column.column_name)).toEqual([
      'created_at',
      'id',
      'name',
      'pin_failed_attempts',
      'pin_hash',
      'pin_locked_until',
      'updated_at',
    ]);
  });

  it('knows only recorded and voided transactions, without reviewer or project columns', async () => {
    const values = await prisma.$queryRaw<{ value: string }[]>`
      SELECT unnest(enum_range(NULL::tx_status))::text AS value`;
    expect(values.map((row) => row.value)).toEqual(['APPROVED', 'VOID']);

    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'transactions'`;
    const names = columns.map((column) => column.column_name);
    for (const removed of ['project_id', 'reviewed_by_id', 'reviewed_at', 'reject_reason']) {
      expect(names).not.toContain(removed);
    }
  });

  it('names every column in snake_case', async () => {
    const rows = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
        AND column_name !~ '^[a-z][a-z0-9_]*$'`;
    expect(rows).toEqual([]);
  });

  it('names every enum type in snake_case', async () => {
    const rows = await prisma.$queryRaw<{ typname: string }[]>`
      SELECT t.typname FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e'
      ORDER BY t.typname`;
    expect(rows.map((r) => r.typname)).toEqual(['account_type', 'tx_status', 'tx_type']);
  });

  it('indexes transactions for the reports', async () => {
    const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'idx_transactions_status_transaction_date'`;

    expect(rows).toHaveLength(1);
    expect(rows[0]!.indexdef).toContain('(status, transaction_date)');
  });

  async function createTransactionWithAmount(amount: bigint) {
    const user = await prisma.user.create({ data: { name: 'Pemilik' } });
    const account = await prisma.account.create({ data: { name: 'Kas', type: 'CASH' } });
    const category = await prisma.category.create({ data: { name: 'Material', type: 'OUT' } });
    return prisma.transaction.create({
      data: {
        type: 'OUT',
        amount,
        transaction_date: new Date('2026-10-06'),
        description: 'uji',
        account_id: account.id,
        category_id: category.id,
        created_by_id: user.id,
      },
    });
  }

  it('stores an amount larger than 2^53 exactly, recorded by default', async () => {
    const tx = await createTransactionWithAmount(9007199254740993n);
    expect(tx.amount).toBe(9007199254740993n);
    expect(tx.status).toBe('APPROVED');
  });

  it('rejects a zero amount', async () => {
    await expect(createTransactionWithAmount(0n)).rejects.toThrow();
  });

  it('rejects a negative amount', async () => {
    await expect(createTransactionWithAmount(-1n)).rejects.toThrow();
  });

  it('rejects two categories with the same name and type', async () => {
    await prisma.category.create({ data: { name: 'Material', type: 'OUT' } });
    await expect(
      prisma.category.create({ data: { name: 'Material', type: 'OUT' } }),
    ).rejects.toThrow();
  });

  it('refuses to delete a user who voided a transaction', async () => {
    const tx = await createTransactionWithAmount(1000n);
    const voider = await prisma.user.create({ data: { name: 'Lain' } });
    await prisma.transaction.update({ where: { id: tx.id }, data: { voided_by_id: voider.id } });

    await expect(prisma.user.delete({ where: { id: voider.id } })).rejects.toThrow();
  });
});
