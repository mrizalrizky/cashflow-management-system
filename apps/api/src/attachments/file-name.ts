const MAX_LENGTH = 120;
const FALLBACK = 'bukti';

/**
 * Nama berkas yang aman ditampilkan dan dikirim sebagai header unduhan: tanpa folder, tanpa
 * karakter kontrol atau tanda kutip, dengan ekstensi yang sesuai isi berkas sebenarnya.
 * Nama ini hanya untuk ditampilkan; berkas disimpan dengan kunci buatan aplikasi.
 */
export function sanitizeFileName(original: string, extension: string): string {
  const lastSegment = original.split(/[\\/]/).pop() ?? '';
  const withoutExtension = lastSegment.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const stem = withoutExtension
    .replace(/[^A-Za-z0-9 ._-]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[ .]+|[ .]+$/g, '');

  const suffix = `.${extension}`;
  return `${(stem || FALLBACK).slice(0, MAX_LENGTH - suffix.length)}${suffix}`;
}
