import { hasOwn } from './changes'
import { formatCalendarDate, formatDateTime } from './format'
import { formatRupiah, isMoneyString } from './money'

/** Field snapshot audit yang berisi nominal rupiah (string digit). */
const MONEY_FIELDS = new Set(['amount', 'opening_balance', 'contract_value', 'contract_value_with_ppn'])
/** Teks terpanjang yang diizinkan API adalah 500 karakter; batas ini hanya menahan nilai yang tidak wajar. */
const MAX_LENGTH = 2000
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}/
const ABSENT = '-'
/** Nama field untuk snapshot yang bukan objek. */
const WHOLE_VALUE = 'nilai'

export interface FieldChange {
  field: string
  before: string
  after: string
}

function cut(text: string): string {
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}…` : text
}

/**
 * Sebuah nilai dari snapshot audit sebagai teks untuk dibaca orang. Hasilnya selalu teks
 * biasa: isinya (yang berasal dari pengguna) tidak pernah diperlakukan sebagai HTML.
 */
export function describeValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return ABSENT
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak'
  if (typeof value === 'string') return describeText(field, value)
  if (typeof value === 'object') return cut(JSON.stringify(value))
  return cut(String(value))
}

/** Teks dengan arti khusus menurut nama field-nya: nominal, waktu kejadian, tanggal kalender. */
function describeText(field: string, value: string): string {
  if (MONEY_FIELDS.has(field) && isMoneyString(value, true)) return formatRupiah(value)
  // Snapshot menyimpan waktu sebagai ISO UTC; ditampilkan dalam waktu Jakarta seperti di tempat lain.
  if (field.endsWith('_at') && TIMESTAMP.test(value)) return formatDateTime(value)
  if (field.endsWith('_date') && CALENDAR_DAY.test(value)) return formatCalendarDate(value.slice(0, 10))
  return cut(value)
}

/** Kosong, null dan tidak ada sama-sama berarti "tidak diisi". */
function isAbsent(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

/** Dibandingkan pada nilai aslinya, bukan pada teks tampilannya yang mungkin sudah dipotong. */
function sameValue(a: unknown, b: unknown): boolean {
  if (isAbsent(a) || isAbsent(b)) return isAbsent(a) && isAbsent(b)
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Nilai sebuah field yang benar-benar dimiliki snapshot (bukan warisan objek). */
function own(fields: Record<string, unknown>, field: string): unknown {
  return hasOwn(fields, field) ? fields[field] : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Snapshot sebagai kumpulan field; yang bukan objek dianggap satu nilai utuh. */
function toFields(snapshot: unknown): Record<string, unknown> {
  if (snapshot === null || snapshot === undefined) return {}
  return isRecord(snapshot) ? snapshot : { [WHOLE_VALUE]: snapshot }
}

/**
 * Field yang nilainya berbeda antara keadaan sebelum dan sesudah, menurut abjad. Snapshot
 * yang kosong (data baru atau data yang dihapus) menghasilkan semua field yang terisi di sisi lain.
 */
export function changedFields(before: unknown, after: unknown): FieldChange[] {
  const old = toFields(before)
  const current = toFields(after)
  const fields = [...new Set([...Object.keys(old), ...Object.keys(current)])].sort()

  return fields
    .filter((field) => !sameValue(own(old, field), own(current, field)))
    .map((field) => ({
      field,
      before: describeValue(field, own(old, field)),
      after: describeValue(field, own(current, field)),
    }))
}
