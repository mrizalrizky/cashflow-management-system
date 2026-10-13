import type { PrismaClient } from '../src/generated/prisma/client.js';
import { seedDatabase } from '../src/database/seed.js';
import { createTestPrisma, resetDb } from './test-db.js';

describe('seedDatabase', () => {
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

  it('creates the owner without a PIN, personal accounts and categories, on first install', async () => {
    await seedDatabase(prisma);

    const owners = await prisma.user.findMany();
    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({ name: 'Pemilik', pin_hash: null });
    expect((await prisma.account.findMany({ orderBy: { name: 'asc' } })).map((a) => a.name)).toEqual([
      'Dompet',
      'Rekening Bank',
    ]);
    expect(await prisma.category.count({ where: { name: 'Makan & Minum', type: 'OUT' } })).toBe(1);
    expect(await prisma.category.count({ where: { name: 'Gaji', type: 'IN' } })).toBe(1);
    expect(await prisma.category.count({ where: { name: 'Material' } })).toBe(0);
  });

  it('is safe to run on every deploy: one owner, the PIN kept, renamed defaults not brought back', async () => {
    await seedDatabase(prisma);
    await prisma.user.updateMany({ data: { pin_hash: 'hash-tetap' } });
    await prisma.account.updateMany({ where: { name: 'Dompet' }, data: { name: 'Dompet Harian' } });

    await seedDatabase(prisma);

    expect(await prisma.user.count()).toBe(1);
    expect((await prisma.user.findFirstOrThrow()).pin_hash).toBe('hash-tetap');
    expect(await prisma.account.count({ where: { name: 'Dompet' } })).toBe(0);
  });

  it('still makes sure the transfer categories exist on every run', async () => {
    await seedDatabase(prisma);
    await prisma.category.deleteMany({ where: { is_system: true } });

    await seedDatabase(prisma);

    const system = await prisma.category.findMany({ where: { is_system: true }, orderBy: { name: 'asc' } });
    expect(system.map((category) => [category.name, category.type])).toEqual([
      ['Transfer Keluar', 'OUT'],
      ['Transfer Masuk', 'IN'],
    ]);
  });
});
