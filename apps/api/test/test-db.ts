import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { assertTestDatabaseUrl } from './test-env.js';

export function createTestPrisma(): PrismaClient {
  const connectionString = assertTestDatabaseUrl(process.env.DATABASE_URL);
  // Gagal cepat bila koneksi ke database macet, daripada menggantung berjam-jam.
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 }),
  });
}

export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "attachments", "audit_logs", "refresh_tokens", "transactions", ' +
      '"project_members", "projects", "categories", "accounts", "users" RESTART IDENTITY CASCADE',
  );
}
