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

/** Kategori awal yang boleh diubah admin; hanya dibuat pada pemasangan pertama. */
const DEFAULT_CATEGORIES = [
  ...CATEGORIES_IN.map((name) => ({ name, type: 'IN', is_system: false }) as const),
  ...CATEGORIES_OUT.map((name) => ({ name, type: 'OUT', is_system: false }) as const),
];

/** Kategori yang dibutuhkan aplikasi sendiri (transfer antar akun); selalu dipastikan ada. */
const SYSTEM_CATEGORIES = [
  { name: 'Transfer Masuk', type: 'IN', is_system: true } as const,
  { name: 'Transfer Keluar', type: 'OUT', is_system: true } as const,
];

/** Sementara (diganti pada tugas berikutnya): satu pemilik, hanya nama. */
async function ensureAdmin(prisma: PrismaClient, options: SeedOptions): Promise<boolean> {
  if (await prisma.user.findFirst()) return false;
  await prisma.user.create({ data: { name: options.adminName?.trim() || 'Pemilik' } });
  return true;
}

async function ensureAccounts(prisma: PrismaClient): Promise<void> {
  for (const account of ACCOUNTS) {
    const existing = await prisma.account.findFirst({ where: { name: account.name } });
    if (!existing) {
      await prisma.account.create({ data: account });
    }
  }
}

type SeedCategory = (typeof DEFAULT_CATEGORIES)[number] | (typeof SYSTEM_CATEGORIES)[number];

async function ensureCategories(
  prisma: PrismaClient,
  categories: readonly SeedCategory[],
): Promise<void> {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { name_type: { name: category.name, type: category.type } },
      update: {},
      create: category,
    });
  }
}

/**
 * Aman dijalankan berulang (dan memang dijalankan tiap deploy): tidak menggandakan data dan
 * tidak menimpa password admin. Akun dan kategori awal hanya dibuat pada pemasangan pertama,
 * supaya yang sudah diganti namanya atau dinonaktifkan admin tidak muncul lagi.
 */
export async function seedDatabase(prisma: PrismaClient, options: SeedOptions): Promise<void> {
  const firstInstall = await ensureAdmin(prisma, options);
  if (firstInstall) {
    await ensureAccounts(prisma);
    await ensureCategories(prisma, DEFAULT_CATEGORIES);
  }
  await ensureCategories(prisma, SYSTEM_CATEGORIES);
}
