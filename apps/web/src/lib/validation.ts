/** Mengembalikan pesan kesalahan, atau null bila nilainya sah. */
export type Rule = (value: unknown) => string | null

export const PASSWORD_MIN_LENGTH = 8

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function required(label: string): Rule {
  return (value) => (asText(value).trim() ? null : `${label} wajib diisi`)
}

export function minLength(label: string, length: number): Rule {
  return (value) => (asText(value).length >= length ? null : `${label} minimal ${length} karakter`)
}

export function email(): Rule {
  return (value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(asText(value).trim()) ? null : 'Format email tidak valid'
}

/** Nilai harus sama dengan nilai lain, mis. konfirmasi password. */
export function matches(other: () => string, message: string): Rule {
  return (value) => (value === other() ? null : message)
}

/** Aturan untuk password yang baru dibuat; sama dengan aturan di API. */
export function newPassword(label: string): Rule[] {
  return [required(label), minLength(label, PASSWORD_MIN_LENGTH)]
}

/** Pesan pertama yang gagal untuk tiap field; field yang sah tidak ikut. */
export function collectErrors<T extends object>(
  values: T,
  rules: Partial<Record<keyof T, Rule[]>>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const [field, fieldRules] of Object.entries(rules) as [keyof T & string, Rule[]][]) {
    for (const rule of fieldRules) {
      const message = rule(values[field])
      if (message) {
        errors[field] = message
        break
      }
    }
  }
  return errors
}
