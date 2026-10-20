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

  it('creates only the owner, without a PIN: no accounts and no categories', async () => {
    await seedDatabase(prisma);

    const owners = await prisma.user.findMany();
    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({ name: 'Pemilik', pin_hash: null });
    expect(await prisma.account.count()).toBe(0);
    // Kategori transfer dibuat sendiri oleh transfer pertama, bukan oleh seed.
    expect(await prisma.category.count()).toBe(0);
  });

  it('is safe to run on every deploy: still one owner, the PIN kept, nothing else touched', async () => {
    await seedDatabase(prisma);
    await prisma.user.updateMany({ data: { pin_hash: 'hash-tetap' } });
    await prisma.account.create({ data: { name: 'Dompet Saya', type: 'CASH' } });

    await seedDatabase(prisma);

    expect(await prisma.user.count()).toBe(1);
    expect((await prisma.user.findFirstOrThrow()).pin_hash).toBe('hash-tetap');
    expect((await prisma.account.findMany()).map((account) => account.name)).toEqual(['Dompet Saya']);
  });
});
