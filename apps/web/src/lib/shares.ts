import { isMoneyString } from './money'

// Proporsi untuk menggambar batang. Dihitung dengan BigInt; nominal tidak pernah menjadi number.

function toAmount(value: string): bigint | null {
  return isMoneyString(value, true) ? BigInt(value) : null
}

/**
 * `part` terhadap `whole` sebagai persentase 0..100 (dua desimal) untuk lebar atau tinggi batang.
 * Nol bila tidak ada yang bisa digambar; bagian yang positif tetapi sangat kecil tetap diberi
 * `min` persen supaya terlihat; tidak pernah melebihi 100.
 */
export function shareOf(part: string, whole: string, min = 1): number {
  const partAmount = toAmount(part)
  const wholeAmount = toAmount(whole)
  if (partAmount === null || wholeAmount === null || partAmount <= 0n || wholeAmount <= 0n) return 0
  if (partAmount >= wholeAmount) return 100
  return Math.max(Number((partAmount * 10_000n) / wholeAmount) / 100, min)
}

/** Nominal terbesar dari sekumpulan nominal; `'0'` bila tidak ada yang positif. */
export function largest(amounts: string[]): string {
  let max = 0n
  for (const amount of amounts) {
    const value = toAmount(amount)
    if (value !== null && value > max) max = value
  }
  return max.toString()
}
