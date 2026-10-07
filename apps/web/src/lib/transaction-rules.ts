import { todayInJakarta } from './calendar'
import { AMOUNT_MAX_DIGITS, DESCRIPTION_MAX_LENGTH } from './transactions'
import { money, required, type Rule } from './validation'

/** Aturan isian yang sama untuk form transaksi dan form transfer; mengikuti aturan API. */

export function chosen(label: string): Rule {
  return (value) => (value ? null : `${label} wajib dipilih`)
}

export function amountRules(label = 'Jumlah'): Rule[] {
  return [
    money(label),
    (amount) => (/^0+$/.test(String(amount)) ? `${label} harus lebih dari 0` : null),
    (amount) => (String(amount).length > AMOUNT_MAX_DIGITS ? `${label} terlalu besar` : null),
  ]
}

export function transactionDateRules(): Rule[] {
  return [
    (date) => (date ? null : 'Tanggal transaksi wajib diisi'),
    // Tanggal kalender `YYYY-MM-DD` bisa dibandingkan langsung sebagai teks.
    (date) =>
      String(date) > todayInJakarta() ? 'Tanggal transaksi tidak boleh di masa depan' : null,
  ]
}

export function descriptionRules(label = 'Keterangan'): Rule[] {
  return [
    required(label),
    (text) =>
      String(text).trim().length > DESCRIPTION_MAX_LENGTH
        ? `${label} maksimal ${DESCRIPTION_MAX_LENGTH} karakter`
        : null,
  ]
}
