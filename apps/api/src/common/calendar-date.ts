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

/** Jakarta selalu UTC+7 (tanpa waktu musim panas), jadi batas harinya bisa ditulis langsung. */
const JAKARTA_OFFSET = '+07:00';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Saat sebuah hari kalender dimulai di Jakarta, untuk menyaring kolom waktu (timestamp). */
export function startOfJakartaDay(date: string): Date {
  return new Date(`${date}T00:00:00.000${JAKARTA_OFFSET}`);
}

/** Saat hari itu berakhir di Jakarta (awal hari berikutnya); dipakai sebagai batas eksklusif. */
export function endOfJakartaDay(date: string): Date {
  return new Date(startOfJakartaDay(date).getTime() + DAY_MS);
}

const JAKARTA_TIMESTAMP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Sebuah saat sebagai `YYYY-MM-DD HH:mm` waktu Jakarta, mis. untuk berkas ekspor. */
export function formatJakartaTimestamp(value: Date): string {
  const parts = Object.fromEntries(
    JAKARTA_TIMESTAMP.formatToParts(value).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Bulan kalender di JSON: `YYYY-MM`, tahun 1900 sampai 2999. */
export function isCalendarMonth(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = MONTH_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

export function IsCalendarMonth(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isCalendarMonth',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: '$property harus berupa bulan berformat YYYY-MM', ...options },
      validator: { validate: isCalendarMonth },
    });
  };
}

/** Bulan disimpan sebagai tanggal hari pertamanya (kolom DATE). */
export function parseCalendarMonth(month: string): Date {
  return parseCalendarDate(`${month}-01`);
}

export function formatCalendarMonth(value: Date): string {
  return formatCalendarDate(value).slice(0, 7);
}

/** Bulan berjalan menurut kalender Jakarta, sebagai `YYYY-MM`. */
export function currentMonthInJakarta(now: Date = new Date()): string {
  return todayInJakarta(now).slice(0, 7);
}

function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

function fromMonthIndex(index: number): string {
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function addMonths(month: string, count: number): string {
  return fromMonthIndex(monthIndex(month) + count);
}

/** Selisih bulan `to - from`, mis. Nov 2026 ke Feb 2027 = 3. */
export function monthsBetween(from: string, to: string): number {
  return monthIndex(to) - monthIndex(from);
}
