import { validationFailed } from '../common/validation.js';

export const MAX_PERIOD_MONTHS = 60;
/** Tanpa tanggal awal, laporan mencakup bulan tanggal akhir dan sebelas bulan sebelumnya. */
const DEFAULT_MONTHS = 12;

/** Rentang tanggal kalender `YYYY-MM-DD`, kedua ujungnya ikut dihitung. */
export interface Period {
  from: string;
  to: string;
}

/**
 * Bulan dihitung sebagai bilangan bulat (tahun * 12 + bulan), supaya tidak ada objek Date
 * dan tidak ada zona waktu yang bisa menggeser batas bulan.
 */
function monthIndex(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

function toMonth(index: number): string {
  const year = Math.floor(index / 12);
  return `${year}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * Melengkapi periode yang diminta: tanggal akhir bawaannya hari ini, tanggal awal bawaannya
 * hari pertama dari dua belas bulan terakhir. Menolak rentang yang terbalik atau terlalu panjang.
 */
export function resolvePeriod(query: { from?: string; to?: string }, today: string): Period {
  const to = query.to ?? today;
  const from = query.from ?? `${toMonth(monthIndex(to) - (DEFAULT_MONTHS - 1))}-01`;

  if (from > to) {
    throw validationFailed([
      { field: 'from', messages: ['Tanggal awal tidak boleh setelah tanggal akhir'] },
    ]);
  }
  if (monthIndex(to) - monthIndex(from) + 1 > MAX_PERIOD_MONTHS) {
    throw validationFailed([
      { field: 'to', messages: [`Rentang paling lama ${MAX_PERIOD_MONTHS} bulan`] },
    ]);
  }
  return { from, to };
}

/** Semua bulan (`YYYY-MM`) yang tersentuh periode, berurutan. */
export function monthsInPeriod(period: Period): string[] {
  const first = monthIndex(period.from);
  const count = monthIndex(period.to) - first + 1;
  return Array.from({ length: count }, (_unused, offset) => toMonth(first + offset));
}
