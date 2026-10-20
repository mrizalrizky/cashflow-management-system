import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Aman dijalankan berulang (dan memang dijalankan tiap deploy): membuat pemilik bila belum ada,
 * tanpa PIN (PIN dibuat pada kunjungan pertama), dan tidak menyentuh apa pun lagi. Akun dan
 * kategori dibuat pemilik sendiri di Master data; kategori transfer dibuat oleh transfer pertama.
 */
export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  if (await prisma.user.findFirst()) return;
  await prisma.user.create({ data: { name: 'Pemilik' } });
}
