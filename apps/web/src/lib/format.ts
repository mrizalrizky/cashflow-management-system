const DATE_OPTIONS = { day: '2-digit', month: 'short', year: 'numeric' } as const
const JAKARTA = new Intl.DateTimeFormat('id-ID', { ...DATE_OPTIONS, timeZone: 'Asia/Jakarta' })
const UTC = new Intl.DateTimeFormat('id-ID', { ...DATE_OPTIONS, timeZone: 'UTC' })
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const CALENDAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const MONTH = new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric', timeZone: 'UTC' })

function toParts(formatter: Intl.DateTimeFormat, date: Date): string {
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]))
  return `${parts.day} ${parts.month} ${parts.year}`
}

/** Waktu kejadian (timestamp) sebagai `dd MMM yyyy` menurut waktu Jakarta. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : toParts(JAKARTA, date)
}

/** Tanggal kalender `YYYY-MM-DD` sebagai `dd MMM yyyy`, tanpa konversi zona waktu. */
export function formatCalendarDate(value: string | null | undefined): string {
  if (!value || !CALENDAR_DATE.test(value)) return '-'
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? '-' : toParts(UTC, date)
}

/** Tanggal kalender menjadi Date lokal untuk komponen pemilih tanggal. */
export function toLocalDate(value: string | null | undefined): Date | null {
  const match = value ? CALENDAR_DATE.exec(value) : null
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

/** Kebalikan `toLocalDate`: hari yang dipilih di layar, sebagai `YYYY-MM-DD`. */
export function fromLocalDate(date: Date | null | undefined): string | null {
  if (!date) return null
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Bulan kalender `YYYY-MM` sebagai `MMM yyyy`, mis. `Okt 2026`. */
export function formatMonth(value: string | null | undefined): string {
  if (!value || !CALENDAR_MONTH.test(value)) return '-'
  const parts = Object.fromEntries(
    MONTH.formatToParts(new Date(`${value}-01T00:00:00.000Z`)).map((p) => [p.type, p.value]),
  )
  return `${parts.month} ${parts.year}`
}
