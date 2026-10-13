/**
 * Lupa PIN: mengosongkan PIN pemilik, hitungan salah, dan semua sesi. Kunjungan berikutnya
 * meminta PIN baru. Data lain tidak tersentuh.
 *
 *   npm run reset-pin                                   (setelah build, mis. di container)
 *   deploy/dc run --rm api npm run reset-pin            (produksi)
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from '../auth/password.service.js';
import { PinService } from '../auth/pin.service.js';
import { PrismaClient } from '../generated/prisma/client.js';

export function resetPin(prisma: PrismaClient): Promise<boolean> {
  return new PinService(new PasswordService(), new AuditService()).reset(prisma);
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL wajib diisi');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const done = await resetPin(prisma);
    console.log(done ? 'PIN direset. Buka aplikasi untuk membuat PIN baru.' : 'Pemilik belum ada; tidak ada yang direset.');
  } finally {
    await prisma.$disconnect();
  }
}

// Dijalankan sebagai perintah, bukan saat diimpor test.
const entry = (process.argv[1] ?? '').replace(/\\/g, '/');
if (entry.endsWith('/cli/reset-pin.js') || entry.endsWith('/cli/reset-pin.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
