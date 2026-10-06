/**
 * Filter Prisma untuk pencarian teks bebas, tidak peka huruf besar/kecil.
 * Prisma tidak meng-escape wildcard LIKE, jadi `%` dan `_` dari user di-escape di sini
 * supaya dicari sebagai karakter biasa.
 */
export function containsText(text: string): { contains: string; mode: 'insensitive' } {
  return { contains: text.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' };
}
