// Prisma tidak meng-escape wildcard LIKE, jadi `%` dan `_` dari user di-escape di sini
// supaya diperlakukan sebagai karakter biasa.
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

/** Filter Prisma untuk pencarian teks bebas, tidak peka huruf besar/kecil. */
export function containsText(text: string): { contains: string; mode: 'insensitive' } {
  return { contains: escapeLike(text), mode: 'insensitive' };
}

/** Filter Prisma untuk teks yang sama persis kecuali huruf besar/kecilnya, mis. cek nama kembar. */
export function equalsText(text: string): { equals: string; mode: 'insensitive' } {
  return { equals: escapeLike(text), mode: 'insensitive' };
}
