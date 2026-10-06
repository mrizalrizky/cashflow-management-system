/** Bagian dari `next` yang nilainya berbeda dari `original`, untuk dikirim sebagai PATCH. */
export function pickChanged<T extends object>(next: T, original: T): Partial<T> {
  const changes: Partial<T> = {}
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (next[key] !== original[key]) changes[key] = next[key]
  }
  return changes
}

/** Salinan `value` tanpa satu kunci. */
export function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value }
  delete copy[key]
  return copy
}
