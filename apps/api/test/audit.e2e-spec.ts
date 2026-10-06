import { AuditService } from '../src/audit/audit.service.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createTestPrisma, resetDb } from './test-db.js';

describe('AuditService', () => {
  let prisma: PrismaClient;
  const audit = new AuditService();

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('writes a row with every field', async () => {
    await audit.log(prisma, {
      userId: null,
      action: 'UPDATE',
      entityType: 'user',
      entityId: 'abc',
      before: { name: 'Lama' },
      after: { name: 'Baru' },
      ip: '10.0.0.1',
    });

    const row = await prisma.auditLog.findFirstOrThrow();
    expect(row).toMatchObject({
      user_id: null,
      action: 'UPDATE',
      entity_type: 'user',
      entity_id: 'abc',
      before: { name: 'Lama' },
      after: { name: 'Baru' },
      ip: '10.0.0.1',
    });
  });

  it('stores no secret fields', async () => {
    await audit.log(prisma, {
      userId: null,
      action: 'UPDATE',
      entityType: 'user',
      entityId: 'abc',
      before: { name: 'A', password_hash: 'secret' },
    });

    const row = await prisma.auditLog.findFirstOrThrow();
    expect(row.before).toEqual({ name: 'A' });
    expect(row.after).toBeNull();
  });

  it('is rolled back together with the surrounding transaction', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await audit.log(tx, { userId: null, action: 'CREATE', entityType: 'user', entityId: 'x' });
        throw new Error('batal');
      }),
    ).rejects.toThrow('batal');

    expect(await prisma.auditLog.count()).toBe(0);
  });
});
