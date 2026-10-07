import argon2 from 'argon2';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { seedDatabase } from '../src/database/seed.js';
import { createTestPrisma, resetDb } from './test-db.js';

const options = {
  adminName: 'Administrator',
  adminEmail: 'Admin@Example.com',
  adminPassword: 'rahasia-awal-123',
};

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

  it('creates the admin, accounts and categories', async () => {
    await seedDatabase(prisma, options);

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } });
    expect(admin.role).toBe('SUPER_ADMIN');
    expect(admin.must_change_password).toBe(true);
    expect(admin.password_hash).not.toContain(options.adminPassword);
    expect(await argon2.verify(admin.password_hash, options.adminPassword)).toBe(true);

    const accounts = await prisma.account.findMany({ orderBy: { name: 'asc' } });
    expect(accounts.map((a) => [a.name, a.type])).toEqual([
      ['Kas Kecil', 'CASH'],
      ['Rekening Bank Utama', 'BANK'],
    ]);

    expect(await prisma.category.count({ where: { type: 'IN', is_system: false } })).toBe(4);
    expect(await prisma.category.count({ where: { type: 'OUT', is_system: false } })).toBe(11);
    const system = await prisma.category.findMany({
      where: { is_system: true },
      orderBy: { name: 'asc' },
    });
    expect(system.map((c) => [c.name, c.type])).toEqual([
      ['Transfer Keluar', 'OUT'],
      ['Transfer Masuk', 'IN'],
    ]);
  });

  it('is idempotent and never resets an existing admin password', async () => {
    await seedDatabase(prisma, options);
    const before = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } });

    await seedDatabase(prisma, { ...options, adminPassword: 'password-lain-456' });

    const after = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } });
    expect(after.password_hash).toBe(before.password_hash);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.account.count()).toBe(2);
    expect(await prisma.category.count()).toBe(17);
  });

  it('does not bring back default accounts and categories that were renamed', async () => {
    await seedDatabase(prisma, options);
    await prisma.account.updateMany({ where: { name: 'Rekening Bank Utama' }, data: { name: 'BCA 1234' } });
    await prisma.category.updateMany({ where: { name: 'Material' }, data: { name: 'Bahan Bangunan' } });

    // Dijalankan lagi tiap deploy.
    await seedDatabase(prisma, options);

    expect(await prisma.account.count()).toBe(2);
    expect(await prisma.account.count({ where: { name: 'Rekening Bank Utama' } })).toBe(0);
    expect(await prisma.category.count()).toBe(17);
    expect(await prisma.category.count({ where: { name: 'Material' } })).toBe(0);
  });

  it('still makes sure the transfer categories exist on every run', async () => {
    await seedDatabase(prisma, options);
    await prisma.category.deleteMany({ where: { is_system: true } });

    await seedDatabase(prisma, options);

    const system = await prisma.category.findMany({ where: { is_system: true }, orderBy: { name: 'asc' } });
    expect(system.map((category) => [category.name, category.type])).toEqual([
      ['Transfer Keluar', 'OUT'],
      ['Transfer Masuk', 'IN'],
    ]);
  });

  it('refuses to run without an admin email', async () => {
    await expect(seedDatabase(prisma, { ...options, adminEmail: undefined })).rejects.toThrow(
      /SEED_ADMIN_EMAIL/,
    );
    expect(await prisma.category.count()).toBe(0);
  });

  it('refuses a password shorter than 8 characters', async () => {
    await expect(seedDatabase(prisma, { ...options, adminPassword: 'pendek' })).rejects.toThrow(
      /SEED_ADMIN_PASSWORD/,
    );
    expect(await prisma.user.count()).toBe(0);
  });

  it('refuses the placeholder password from .env.example', async () => {
    await expect(
      seedDatabase(prisma, { ...options, adminPassword: 'ganti-password-ini' }),
    ).rejects.toThrow(/SEED_ADMIN_PASSWORD/);
    expect(await prisma.user.count()).toBe(0);
  });

  it('does not create a second admin when a SUPER_ADMIN exists under another email', async () => {
    await seedDatabase(prisma, options);
    await seedDatabase(prisma, { ...options, adminEmail: 'other@example.com' });
    expect(await prisma.user.count()).toBe(1);
  });

  it('does not need admin credentials when an admin already exists', async () => {
    await seedDatabase(prisma, options);
    await expect(seedDatabase(prisma, {})).resolves.toBeUndefined();
    expect(await prisma.category.count()).toBe(17);
  });
});
