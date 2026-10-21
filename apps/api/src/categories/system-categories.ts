import type { Prisma, TxType } from '../generated/prisma/client.js';

/** Untuk apa sebuah kategori sistem dipakai. */
export type SystemPurpose = 'transfer' | 'adjustment';

/**
 * Kategori milik aplikasi sendiri: transfer antar akun, dan penyesuaian saldo ("Cocokkan
 * saldo"). Keduanya tidak dihitung di dasbor. Namanya selalu dicadangkan, ada atau belum.
 */
export const SYSTEM_CATEGORIES: Record<SystemPurpose, Record<TxType, string>> = {
  transfer: { OUT: 'Transfer Keluar', IN: 'Transfer Masuk' },
  adjustment: { OUT: 'Selisih Keluar', IN: 'Selisih Masuk' },
};

export const SYSTEM_CATEGORY_NAMES = Object.values(SYSTEM_CATEGORIES).flatMap((names) => Object.values(names));

/** Benar bila nama ini milik kategori sistem, tanpa membedakan huruf besar/kecil dan spasi di tepi. */
export function isSystemCategoryName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return SYSTEM_CATEGORY_NAMES.some((reserved) => reserved.toLowerCase() === normalized);
}

/**
 * Id kategori sistem untuk satu keperluan dan tipe. Dibuat saat pertama dibutuhkan (seed hanya
 * membuat pemilik); upsert menjaga dua permintaan pertama yang bersamaan tidak membuatnya dua kali.
 */
export async function systemCategoryId(
  tx: Prisma.TransactionClient,
  type: TxType,
  purpose: SystemPurpose = 'transfer',
): Promise<string> {
  const name = SYSTEM_CATEGORIES[purpose][type];
  const category = await tx.category.upsert({
    where: { name_type: { name, type } },
    update: {},
    create: { name, type, is_system: true },
  });
  return category.id;
}
