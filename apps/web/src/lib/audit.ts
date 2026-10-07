import { formatRupiah, isMoneyString } from './money'

/** Field snapshot audit yang berisi nominal rupiah (string digit). */
const MONEY_FIELDS = new Set(['amount', 'opening_balance', 'contract_value'])
const MAX_LENGTH = 300
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
  if (typeof value === 'string') {
    return MONEY_FIELDS.has(field) && isMoneyString(value, true) ? formatRupiah(value) : cut(value)
  }
  if (typeof value === 'object') return cut(JSON.stringify(value))
  return cut(String(value))
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
    .map((field) => ({
      field,
      before: describeValue(field, old[field]),
      after: describeValue(field, current[field]),
    }))
    .filter((change) => change.before !== change.after)
}
