/**
 * Menyiapkan database untuk test browser: mengosongkan semua tabel lalu membuat pemilik (tanpa PIN).
 * Menolak jalan kecuali pada database yang namanya diakhiri `_test`.
 */
import { seedDatabase } from '../src/database/seed.js';
import { createTestPrisma, resetDb } from '../test/test-db.js';

const prisma = createTestPrisma();

try {
  await resetDb(prisma);
  await seedDatabase(prisma);
} finally {
  await prisma.$disconnect();
}
