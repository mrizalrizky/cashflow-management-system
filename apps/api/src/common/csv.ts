/** Pemisah kolom yang dipakai Excel pada komputer berbahasa Indonesia. */
export const CSV_SEPARATOR = ';';
/** Penanda di awal berkas supaya program spreadsheet membacanya sebagai UTF-8. */
export const CSV_BOM = '﻿';

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[;"\r\n]/;

/**
 * Teks dari pengguna tidak boleh dijalankan sebagai rumus saat berkas dibuka di spreadsheet
 * ("CSV injection"). Sel yang diawali `=`, `+`, `-`, `@`, tab atau CR diberi tanda petik
 * tunggal di depannya, sehingga dibaca sebagai teks biasa.
 */
export function neutraliseCell(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/** Satu baris CSV. Sel `null` ditulis kosong; sel berisi pemisah, kutip atau ganti baris dikutip. */
export function toCsvRow(cells: (string | null)[]): string {
  const written = cells.map((cell) => {
    const safe = neutraliseCell(cell ?? '');
    return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  });
  return `${written.join(CSV_SEPARATOR)}\r\n`;
}
