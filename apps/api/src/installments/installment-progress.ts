import { addMonths, monthsBetween } from '../common/calendar-date.js';

export type InstallmentStatus = 'NOT_STARTED' | 'ON_TRACK' | 'BEHIND' | 'PAID_OFF';

export interface InstallmentProgress {
  /** Bulan terakhir, `YYYY-MM`; dihitung, tidak disimpan. */
  endMonth: string;
  /** Transaksi tertaut yang tidak VOID. */
  paid: number;
  /** Bulan dari bulan mulai sampai bulan berjalan, keduanya ikut, dibatasi 0 sampai `months`. */
  due: number;
  /** `due - paid` bila tertinggal, selain itu 0. */
  behindMonths: number;
  status: InstallmentStatus;
  /** Bulan berjalan berada di antara bulan mulai dan bulan selesai. */
  coversMonth: boolean;
}

function statusOf(notStarted: boolean, paid: number, months: number, due: number): InstallmentStatus {
  if (notStarted) return 'NOT_STARTED';
  if (paid >= months) return 'PAID_OFF';
  return paid < due ? 'BEHIND' : 'ON_TRACK';
}

/** Satu-satunya tempat kemajuan cicilan dihitung (spec P2, aturan 2 sampai 5). */
export function progressOf(
  input: { startMonth: string; months: number; paid: number },
  currentMonth: string,
): InstallmentProgress {
  const endMonth = addMonths(input.startMonth, input.months - 1);
  const sinceStart = monthsBetween(input.startMonth, currentMonth);
  const notStarted = sinceStart < 0;
  const due = Math.min(Math.max(sinceStart + 1, 0), input.months);
  const status = statusOf(notStarted, input.paid, input.months, due);
  return {
    endMonth,
    paid: input.paid,
    due,
    behindMonths: status === 'BEHIND' ? due - input.paid : 0,
    status,
    coversMonth: !notStarted && monthsBetween(currentMonth, endMonth) >= 0,
  };
}
