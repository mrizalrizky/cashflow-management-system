import type { Prisma, TxType } from '../generated/prisma/client.js';

/** Kategori yang dipakai transfer antar akun. Namanya selalu dicadangkan, ada atau belum. */
export const SYSTEM_CATEGORIES: Record<TxType, string> = {
  OUT: 'Transfer Keluar',
  IN: 'Transfer Masuk',
};

export const SYSTEM_CATEGORY_NAMES = Object.values(SYSTEM_CATEGORIES);

/** Benar bila nama ini milik kategori transfer, tanpa membedakan huruf besar/kecil dan spasi di tepi. */
export function isSystemCategoryName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return SYSTEM_CATEGORY_NAMES.some((reserved) => reserved.toLowerCase() === normalized);
}

/**
 * Id kategori transfer untuk satu tipe. Dibuat saat pertama dibutuhkan (seed hanya membuat
 * pemilik); upsert menjaga dua transfer pertama yang bersamaan tidak membuatnya dua kali.
 */
export async function systemCategoryId(tx: Prisma.TransactionClient, type: TxType): Promise<string> {
  const name = SYSTEM_CATEGORIES[type];
  const category = await tx.category.upsert({
    where: { name_type: { name, type } },
    update: {},
    create: { name, type, is_system: true },
  });
  return category.id;
}
