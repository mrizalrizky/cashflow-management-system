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

const CATEGORIES = [
  ...CATEGORIES_IN.map((name) => ({ name, type: 'IN', is_system: false }) as const),
  ...CATEGORIES_OUT.map((name) => ({ name, type: 'OUT', is_system: false }) as const),
  { name: 'Transfer Masuk', type: 'IN', is_system: true } as const,
  { name: 'Transfer Keluar', type: 'OUT', is_system: true } as const,
];

/** Membuat admin pertama. Bila sudah ada SUPER_ADMIN, tidak melakukan apa pun. */
async function ensureAdmin(prisma: PrismaClient, options: SeedOptions): Promise<void> {
  const existing = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (existing) return;

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
}

async function ensureAccounts(prisma: PrismaClient): Promise<void> {
  for (const account of ACCOUNTS) {
    const existing = await prisma.account.findFirst({ where: { name: account.name } });
    if (!existing) {
      await prisma.account.create({ data: account });
    }
  }
}

async function ensureCategories(prisma: PrismaClient): Promise<void> {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { name_type: { name: category.name, type: category.type } },
      update: {},
      create: category,
    });
  }
}

/** Aman dijalankan berulang: tidak menggandakan data dan tidak menimpa password admin. */
export async function seedDatabase(prisma: PrismaClient, options: SeedOptions): Promise<void> {
  await ensureAdmin(prisma, options);
  await ensureAccounts(prisma);
  await ensureCategories(prisma);
}
