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

  it('creates exactly the expected tables', async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
      ORDER BY table_name`;
    expect(rows.map((r) => r.table_name)).toEqual([
      'accounts',
      'attachments',
      'audit_logs',
      'categories',
      'project_members',
      'projects',
      'refresh_tokens',
      'transactions',
      'users',
    ]);
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
    expect(rows.map((r) => r.typname)).toEqual([
      'account_type',
      'project_status',
      'role',
      'tx_status',
      'tx_type',
    ]);
  });

  async function createTransactionWithAmount(amount: bigint) {
    const user = await prisma.user.create({
      data: { name: 'A', email: 'a@example.com', password_hash: 'x', role: 'SUPER_ADMIN' },
    });
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

  it('stores an amount larger than 2^53 exactly', async () => {
    const tx = await createTransactionWithAmount(9007199254740993n);
    expect(tx.amount).toBe(9007199254740993n);
    expect(tx.status).toBe('PENDING');
    expect(tx.project_id).toBeNull();
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

  it('refuses to delete a project that has transactions', async () => {
    const tx = await createTransactionWithAmount(1000n);
    const project = await prisma.project.create({
      data: { code: 'PRJ-2026-001', name: 'Rumah A', client_name: 'Klien A' },
    });
    await prisma.transaction.update({ where: { id: tx.id }, data: { project_id: project.id } });

    await expect(prisma.project.delete({ where: { id: project.id } })).rejects.toThrow();
    const after = await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(after.project_id).toBe(project.id);
  });

  it('refuses to delete a user who reviewed or voided a transaction', async () => {
    const tx = await createTransactionWithAmount(1000n);
    const reviewer = await prisma.user.create({
      data: { name: 'B', email: 'b@example.com', password_hash: 'x', role: 'SUPER_ADMIN' },
    });
    const voider = await prisma.user.create({
      data: { name: 'C', email: 'c@example.com', password_hash: 'x', role: 'SUPER_ADMIN' },
    });
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { reviewed_by_id: reviewer.id, voided_by_id: voider.id },
    });

    await expect(prisma.user.delete({ where: { id: reviewer.id } })).rejects.toThrow();
    await expect(prisma.user.delete({ where: { id: voider.id } })).rejects.toThrow();
  });
});
