import argon2 from 'argon2';
import type { PrismaClient } from '../generated/prisma/client.js';

export interface SeedOptions {
  adminName?: string;
  adminEmail?: string;
  adminPassword?: string;
}

const ACCOUNTS = [
  { name: 'Kas Kecil', type: 'CASH' },
  { name: 'Rekening Bank Utama', type: 'BANK' },
] as const;

const CATEGORIES_IN = ['DP Proyek', 'Termin Proyek', 'Pelunasan Proyek', 'Pendapatan Lain'];

const CATEGORIES_OUT = [
  'Material',
  'Upah Tukang',
  'Subkontraktor',
  'Peralatan',
  'Transportasi',
  'Perizinan',
  'Gaji Staf',
  'Sewa Kantor',
  'Utilitas',
  'Pajak',
  'Operasional Lain',
];

const CATEGORIES = [
  ...CATEGORIES_IN.map((name) => ({ name, type: 'IN', is_system: false }) as const),
  ...CATEGORIES_OUT.map((name) => ({ name, type: 'OUT', is_system: false }) as const),
  { name: 'Transfer Masuk', type: 'IN', is_system: true } as const,
  { name: 'Transfer Keluar', type: 'OUT', is_system: true } as const,
];

/** Aman dijalankan berulang: tidak menggandakan data dan tidak menimpa password admin. */
export async function seedDatabase(prisma: PrismaClient, options: SeedOptions): Promise<void> {
  const email = options.adminEmail?.trim().toLowerCase();
  if (!email) {
    throw new Error('SEED_ADMIN_EMAIL wajib diisi');
  }
  const password = options.adminPassword ?? '';
  if (password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD wajib diisi, minimal 8 karakter');
  }

  const existingAdmin = await prisma.user.findUnique({ where: { email } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name: options.adminName?.trim() || 'Administrator',
        email,
        password_hash: await argon2.hash(password),
        role: 'SUPER_ADMIN',
        must_change_password: true,
      },
    });
  }

  for (const account of ACCOUNTS) {
    const existing = await prisma.account.findFirst({ where: { name: account.name } });
    if (!existing) {
      await prisma.account.create({ data: account });
    }
  }

  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { name_type: { name: category.name, type: category.type } },
      update: {},
      create: category,
    });
  }
}
