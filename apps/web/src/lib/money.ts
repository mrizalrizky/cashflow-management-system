// Nominal selalu berupa string digit (sama seperti di API) dan dihitung dengan BigInt,
// tidak pernah dengan number, supaya nilai besar tidak kehilangan ketepatan.

/** Batas yang sama dengan API. */
export const MONEY_MAX_DIGITS = 18

const SIGNED_DIGITS = /^-?\d+$/

/** `1250000` menjadi `1.250.000`. */
export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function isMoneyString(value: unknown, allowNegative = false): value is string {
  if (typeof value !== 'string' || !SIGNED_DIGITS.test(value)) return false
  if (value.startsWith('-') && !allowNegative) return false
  return value.replace('-', '').length <= MONEY_MAX_DIGITS
}

/** Nominal tanpa `Rp`, untuk ditampilkan di dalam kotak isian: `-500.000`. */
export function formatAmount(value: string): string {
  const negative = value.startsWith('-')
  return (negative ? '-' : '') + groupDigits(negative ? value.slice(1) : value)
}

/** `Rp 1.250.000`, `-Rp 500.000`, atau `-` bila kosong atau bukan nominal. */
export function formatRupiah(value: string | null | undefined): string {
  if (!isMoneyString(value, true)) return '-'
  const amount = BigInt(value)
  const negative = amount < 0n
  return `${negative ? '-' : ''}Rp ${groupDigits((negative ? -amount : amount).toString())}`
}

/**
 * Membaca nominal yang diketik atau ditempel orang: `1250000`, `1.250.000`, `Rp 1.250.000`.
 * Mengembalikan string digit, atau null bila bukan nominal rupiah bulat.
 */
export function parseMoneyInput(
  text: string,
  options: { allowNegative?: boolean } = {},
): string | null {
  const cleaned = text.replace(/rp|\s|\./gi, '')
  const negative = cleaned.startsWith('-')
  const digits = negative ? cleaned.slice(1) : cleaned
  if (!/^\d+$/.test(digits)) return null
  if (negative && !options.allowNegative) return null

  const normalized = digits.replace(/^0+(?=\d)/, '')
  if (normalized.length > MONEY_MAX_DIGITS) return null
  return negative && normalized !== '0' ? `-${normalized}` : normalized
}

const PASTED = /^(-?)\s*(?:rp\s*)?(\d+|\d{1,3}(?:\.\d{3})+)$/i

/**
 * Membaca nominal yang ditempel. Lebih ketat daripada `parseMoneyInput`: titik hanya diterima
 * sebagai pemisah ribuan yang lengkap, sehingga `1250000.00` dari spreadsheet ditolak dan tidak
 * terbaca sebagai 125.000.000.
 */
export function parsePastedMoney(
  text: string,
  options: { allowNegative?: boolean } = {},
): string | null {
  const match = PASTED.exec(text.trim())
  return match ? parseMoneyInput(`${match[1]}${match[2]}`, options) : null
}
