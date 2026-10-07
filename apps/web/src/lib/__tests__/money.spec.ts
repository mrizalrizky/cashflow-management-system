import { describe, expect, it } from 'vitest'
import { formatCalendarDate, fromLocalDate, toLocalDate } from '../format'
import { formatRupiah, groupDigits, parseMoneyInput, parsePastedMoney } from '../money'
import { money } from '../validation'

describe('formatRupiah', () => {
  it.each([
    ['1250000', 'Rp 1.250.000'],
    ['0', 'Rp 0'],
    ['999', 'Rp 999'],
    ['-500000', '-Rp 500.000'],
    ['9007199254740993', 'Rp 9.007.199.254.740.993'],
  ])('formats %j as %j', (value, expected) => {
    expect(formatRupiah(value)).toBe(expected)
  })

  it.each(['', null, undefined, 'abc', '12.5', '1e6'])('shows a dash for %j', (value) => {
    expect(formatRupiah(value)).toBe('-')
  })
})

describe('groupDigits', () => {
  it('separates thousands with dots', () => {
    expect(groupDigits('1250000')).toBe('1.250.000')
    expect(groupDigits('100')).toBe('100')
  })
})

describe('parseMoneyInput', () => {
  it.each([
    ['1250000', '1250000'],
    ['1.250.000', '1250000'],
    ['Rp 1.250.000', '1250000'],
    ['rp1.250.000', '1250000'],
    [' 1 250 000 ', '1250000'],
    ['000123', '123'],
    ['0', '0'],
    ['000', '0'],
    ['999999999999999999', '999999999999999999'],
  ])('reads %j as %j', (text, expected) => {
    expect(parseMoneyInput(text)).toBe(expected)
  })

  it.each([
    ['nothing', ''],
    ['only spaces', '   '],
    ['letters', 'abc'],
    ['a decimal comma', '12,50'],
    ['digits mixed with letters', '12a'],
    ['a negative amount', '-500'],
    ['more than 18 digits', '1234567890123456789'],
  ])('refuses %s', (_label, text) => {
    expect(parseMoneyInput(text)).toBeNull()
  })

  it('accepts a negative amount only when allowed', () => {
    expect(parseMoneyInput('-500.000', { allowNegative: true })).toBe('-500000')
    expect(parseMoneyInput('-Rp 500.000', { allowNegative: true })).toBe('-500000')
    expect(parseMoneyInput('-0', { allowNegative: true })).toBe('0')
    expect(parseMoneyInput('5-00', { allowNegative: true })).toBeNull()
  })
})

describe('parsePastedMoney', () => {
  it.each([
    ['1250000', '1250000'],
    ['1.250.000', '1250000'],
    ['Rp 1.250.000', '1250000'],
    ['  rp1.250.000  ', '1250000'],
    ['0', '0'],
  ])('reads %j as %j', (text, expected) => {
    expect(parsePastedMoney(text)).toBe(expected)
  })

  it.each([
    ['a decimal point from a spreadsheet', '1250000.00'],
    ['a short decimal', '1.5'],
    ['two decimals', '12.50'],
    ['a decimal comma', '1.250.000,00'],
    ['misplaced separators', '12.50.000'],
    ['letters', 'seribu'],
    ['nothing', ''],
    ['a negative amount', '-500.000'],
  ])('refuses %s instead of guessing', (_label, text) => {
    expect(parsePastedMoney(text)).toBeNull()
  })

  it('accepts a negative amount only when allowed', () => {
    expect(parsePastedMoney('-500.000', { allowNegative: true })).toBe('-500000')
    expect(parsePastedMoney('-Rp 500.000', { allowNegative: true })).toBe('-500000')
  })
})

describe('money rule', () => {
  it('requires a value unless optional', () => {
    expect(money('Nilai kontrak')('')).toBe('Nilai kontrak wajib diisi')
    expect(money('Nilai kontrak', { required: false })('')).toBeNull()
  })

  it('accepts digit strings and refuses anything else', () => {
    expect(money('Saldo')('1250000')).toBeNull()
    expect(money('Saldo')('12.5')).toBe('Saldo tidak valid')
    expect(money('Saldo')('-5')).toBe('Saldo tidak valid')
    expect(money('Saldo', { allowNegative: true })('-5')).toBeNull()
  })
})

describe('calendar dates', () => {
  it('formats a calendar date without shifting the day', () => {
    expect(formatCalendarDate('2026-10-06')).toBe('06 Okt 2026')
    expect(formatCalendarDate('2026-01-01')).toBe('01 Jan 2026')
  })

  it.each([null, undefined, '', 'bukan tanggal'])('shows a dash for %j', (value) => {
    expect(formatCalendarDate(value)).toBe('-')
  })

  it('converts to and from the local date a date picker works with', () => {
    const local = toLocalDate('2026-10-06')!
    expect([local.getFullYear(), local.getMonth(), local.getDate()]).toEqual([2026, 9, 6])
    expect(fromLocalDate(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(fromLocalDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
    expect(toLocalDate(null)).toBeNull()
    expect(fromLocalDate(null)).toBeNull()
  })
})
