import { registerDecorator, ValidationOptions } from 'class-validator';

const PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_YEAR = 1900;
const MAX_YEAR = 2999;

/** Tanggal kalender (kolom DATE) sebagai objek Date pada tengah malam UTC. */
export function parseCalendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Kebalikan `parseCalendarDate`: `YYYY-MM-DD` tanpa konversi zona waktu. */
export function formatCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Benar hanya untuk tanggal yang sungguh ada, mis. menolak 30 Februari. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !PATTERN.test(value)) return false;
  const date = parseCalendarDate(value);
  if (Number.isNaN(date.getTime()) || formatCalendarDate(date) !== value) return false;
  // Tahun di luar rentang ini hampir pasti salah ketik.
  const year = date.getUTCFullYear();
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

/** Tanggal kalender di JSON: `YYYY-MM-DD`. */
export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: '$property harus berupa tanggal berformat YYYY-MM-DD', ...options },
      validator: { validate: isCalendarDate },
    });
  };
}

const JAKARTA_YEAR = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric' });

export function currentYearInJakarta(now: Date = new Date()): number {
  return Number(JAKARTA_YEAR.format(now));
}

const JAKARTA_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Tanggal hari ini menurut kalender Jakarta, sebagai `YYYY-MM-DD`. */
export function todayInJakarta(now: Date = new Date()): string {
  return JAKARTA_DATE.format(now);
}
