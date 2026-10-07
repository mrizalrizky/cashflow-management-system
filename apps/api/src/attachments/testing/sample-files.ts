/** Berkas kecil dengan tanda pengenal yang benar, untuk menguji pengenalan jenis berkas. */

function bytes(...values: number[]): Buffer {
  return Buffer.from(values);
}

const PNG_SIGNATURE = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

export const SAMPLE_FILES = {
  pdf: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n'),
  png: Buffer.concat([PNG_SIGNATURE, Buffer.from('\u0000\u0000\u0000\rIHDR isi gambar')]),
  jpeg: Buffer.concat([bytes(0xff, 0xd8, 0xff, 0xe0), Buffer.from('\u0000\u0010JFIF isi foto')]),
  webp: Buffer.concat([Buffer.from('RIFF'), bytes(0x1a, 0, 0, 0), Buffer.from('WEBPVP8 isi gambar')]),
  /** Program Windows; harus ditolak apa pun nama dan tipe yang diakuinya. */
  exe: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64), Buffer.from('This program cannot be run')]),
} as const;
