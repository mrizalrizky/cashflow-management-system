/**
 * Menyiapkan database untuk test browser: mengosongkan semua tabel lalu membuat admin awal.
 * Menolak jalan kecuali pada database yang namanya diakhiri `_test`.
 */
import { seedDatabase } from '../src/database/seed.js';
import { createTestPrisma, resetDb } from '../test/test-db.js';

const prisma = createTestPrisma();

try {
  await resetDb(prisma);
  await seedDatabase(prisma, {
    adminName: process.env.SEED_ADMIN_NAME,
    adminEmail: process.env.SEED_ADMIN_EMAIL,
    adminPassword: process.env.SEED_ADMIN_PASSWORD,
  });
} finally {
  await prisma.$disconnect();
}
