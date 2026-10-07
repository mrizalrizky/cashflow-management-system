import { PasswordService } from '../auth/password.service.js';
import { normalizeEmail } from '../common/email.js';
import { PASSWORD_MIN_LENGTH } from '../common/password-policy.js';
import type { PrismaClient } from '../generated/prisma/client.js';

export interface SeedOptions {
  adminName?: string;
  adminEmail?: string;
  adminPassword?: string;
}

/** Nilai contoh di .env.example; tidak boleh dipakai sebagai password sungguhan. */
const PLACEHOLDER_PASSWORD = 'ganti-password-ini';

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

/**
 * Membuat admin pertama. Bila sudah ada SUPER_ADMIN, tidak melakukan apa pun.
 * Mengembalikan true bila admin baru dibuat, yaitu pada pemasangan pertama.
 */
async function ensureAdmin(prisma: PrismaClient, options: SeedOptions): Promise<boolean> {
  const existing = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (existing) return false;

  const email = options.adminEmail ? normalizeEmail(options.adminEmail) : '';
  if (!email) {
    throw new Error('SEED_ADMIN_EMAIL wajib diisi');
  }
  const password = options.adminPassword ?? '';
  if (password.length < PASSWORD_MIN_LENGTH || password === PLACEHOLDER_PASSWORD) {
    throw new Error(
      `SEED_ADMIN_PASSWORD wajib diisi, minimal ${PASSWORD_MIN_LENGTH} karakter, dan bukan nilai contoh`,
    );
  }

  await prisma.user.create({
    data: {
      name: options.adminName?.trim() || 'Administrator',
      email,
      password_hash: await new PasswordService().hash(password),
      role: 'SUPER_ADMIN',
      must_change_password: true,
    },
  });
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
