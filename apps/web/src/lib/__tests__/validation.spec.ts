import { describe, expect, it } from 'vitest'
import { collectErrors, email, matches, minLength, required } from '../validation'

describe('validation rules', () => {
  it('required rejects empty and blank text', () => {
    const rule = required('Nama')
    expect(rule('')).toBe('Nama wajib diisi')
    expect(rule('   ')).toBe('Nama wajib diisi')
    expect(rule(null)).toBe('Nama wajib diisi')
    expect(rule('Budi')).toBeNull()
  })

  it('minLength counts characters', () => {
    const rule = minLength('Password', 8)
    expect(rule('1234567')).toBe('Password minimal 8 karakter')
    expect(rule('12345678')).toBeNull()
  })

  it('email accepts ordinary addresses, ignoring surrounding spaces', () => {
    const rule = email()
    expect(rule(' budi@example.com ')).toBeNull()
    expect(rule('budi@example')).toBe('Format email tidak valid')
    expect(rule('bukan email')).toBe('Format email tidak valid')
  })

  it('matches compares with another value', () => {
    const rule = matches(() => 'rahasia-1', 'Konfirmasi tidak sama')
    expect(rule('rahasia-1')).toBeNull()
    expect(rule('rahasia-2')).toBe('Konfirmasi tidak sama')
  })
})

describe('collectErrors', () => {
  it('returns the first failing message per field and omits valid fields', () => {
    const errors = collectErrors(
      { name: 'Budi', email: '', password: 'abc' },
      {
        name: [required('Nama')],
        email: [required('Email'), email()],
        password: [required('Password'), minLength('Password', 8)],
      },
    )
    expect(errors).toEqual({
      email: 'Email wajib diisi',
      password: 'Password minimal 8 karakter',
    })
  })

  it('returns an empty object when everything is valid', () => {
    expect(collectErrors({ name: 'Budi' }, { name: [required('Nama')] })).toEqual({})
  })
})
