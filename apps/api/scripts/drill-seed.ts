/**
 * Mengisi database dan folder berkas untuk uji pulih (`scripts/restore-drill.sh`): beberapa
 * transaksi dengan berkas buktinya. Menolak jalan kecuali pada database yang namanya diakhiri
 * `_drill`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL ?? '';
const storageDir = process.env.STORAGE_DIR ?? '';
if (!new URL(connectionString).pathname.endsWith('_drill')) {
  throw new Error('drill-seed menolak jalan: nama database harus diakhiri _drill');
}
if (!storageDir) throw new Error('STORAGE_DIR wajib diisi');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  const user = await prisma.user.create({
    data: { name: 'Uji Pulih', email: 'uji-pulih@example.com', password_hash: 'x', role: 'SUPER_ADMIN' },
  });
  const account = await prisma.account.create({
    data: { name: 'Kas Uji Pulih', type: 'CASH', opening_balance: 1_000_000n },
  });
  const category = await prisma.category.create({ data: { name: 'Material Uji Pulih', type: 'OUT' } });

  for (let i = 1; i <= 5; i += 1) {
    const transaction = await prisma.transaction.create({
      data: {
        type: 'OUT',
        // Termasuk nominal di atas 2^53, supaya terbukti tidak berubah saat dipulihkan.
        amount: i === 5 ? 9_007_199_254_740_993n : BigInt(i * 125_000),
        status: i % 2 === 0 ? 'APPROVED' : 'PENDING',
        transaction_date: new Date(`2026-10-0${i}T00:00:00.000Z`),
        description: `uji pulih ${i}`,
        account_id: account.id,
        category_id: category.id,
        created_by_id: user.id,
      },
    });
    // Dua transaksi pertama punya bukti; isinya acak supaya sidiknya berarti.
    if (i > 2) continue;
    const content = randomBytes(2048 * i);
    const storageKey = `${randomUUID()}.pdf`;
    await writeFile(join(storageDir, storageKey), content);
    await prisma.attachment.create({
      data: {
        transaction_id: transaction.id,
        storage_key: storageKey,
        file_name: `nota-${i}.pdf`,
        mime_type: 'application/pdf',
        size_bytes: content.length,
        uploaded_by_id: user.id,
      },
    });
  }
  await prisma.auditLog.create({
    data: { user_id: user.id, action: 'CREATE', entity_type: 'transaction', entity_id: 'uji-pulih' },
  });
} finally {
  await prisma.$disconnect();
}
