import { registerDecorator, ValidationOptions } from 'class-validator';

const PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Tanggal kalender (kolom DATE) sebagai objek Date pada tengah malam UTC. */
export function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Kebalikan `toDate`: `YYYY-MM-DD` tanpa konversi zona waktu. */
export function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Benar hanya untuk tanggal yang sungguh ada, mis. menolak 30 Februari. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !PATTERN.test(value)) return false;
  const date = toDate(value);
  return !Number.isNaN(date.getTime()) && toDateString(date) === value;
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
