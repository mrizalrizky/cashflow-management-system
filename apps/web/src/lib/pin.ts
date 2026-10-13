import { required, type Rule } from './validation'

export const PIN_PATTERN = /^\d{6,12}$/
export const PIN_MESSAGE = 'PIN harus 6 sampai 12 angka'

/** Aturan yang sama dengan API: 6 sampai 12 angka, tanpa spasi. */
export function pinRules(label: string): Rule[] {
  return [required(label), (value) => (PIN_PATTERN.test(String(value)) ? null : PIN_MESSAGE)]
}
