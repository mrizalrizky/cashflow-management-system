import { describe, expect, it } from 'vitest'
import { pinRules } from '../pin'
import { collectErrors } from '../validation'

function check(pin: string): string | undefined {
  return collectErrors({ pin }, { pin: pinRules('PIN') }).pin
}

describe('pinRules', () => {
  it.each(['123456', '000123', '123456789012'])('accepts %s', (pin) => {
    expect(check(pin)).toBeUndefined()
  })

  it('asks for a PIN when empty', () => {
    expect(check('')).toBe('PIN wajib diisi')
  })

  it.each(['12345', '1234567890123', '12345a', ' 123456'])('refuses %j', (pin) => {
    expect(check(pin)).toBe('PIN harus 6 sampai 12 angka')
  })
})
