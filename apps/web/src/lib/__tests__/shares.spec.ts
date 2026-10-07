import { describe, expect, it } from 'vitest'
import { formatMonth } from '../format'
import { largest, shareOf } from '../shares'

describe('shareOf', () => {
  it.each([
    ['50', '200', 25],
    ['200', '200', 100],
    ['1', '3', 33.33],
  ])('%s of %s is %d percent', (part, whole, expected) => {
    expect(shareOf(part, whole)).toBe(expected)
  })

  it('never exceeds a full bar', () => {
    expect(shareOf('300', '200')).toBe(100)
  })

  it.each([
    ['0', '200'],
    ['-5', '200'],
    ['5', '0'],
    ['5', '-10'],
    ['abc', '200'],
    ['5', ''],
    ['1.5', '200'],
  ])('is zero for %j of %j', (part, whole) => {
    expect(shareOf(part, whole)).toBe(0)
  })

  it('gives a tiny positive part a visible sliver, unless told not to', () => {
    expect(shareOf('1', '1000000')).toBe(1)
    expect(shareOf('1', '1000000', 4)).toBe(4)
    expect(shareOf('1', '1000000', 0)).toBe(0)
  })

  it('stays exact beyond what a JavaScript number can hold', () => {
    expect(shareOf('9007199254740993', '18014398509481986')).toBe(50)
    expect(shareOf('9007199254740993', '9007199254740993')).toBe(100)
  })
})

describe('largest', () => {
  it('picks the largest amount', () => {
    expect(largest(['5', '40', '7'])).toBe('40')
    expect(largest(['9007199254740993', '9007199254740992'])).toBe('9007199254740993')
  })

  it('is zero when there is nothing positive', () => {
    expect(largest([])).toBe('0')
    expect(largest(['-5', '-1'])).toBe('0')
    expect(largest(['abc'])).toBe('0')
  })

  it('ignores negative amounts next to a positive one', () => {
    expect(largest(['-900', '3'])).toBe('3')
  })
})

describe('formatMonth', () => {
  it.each([
    ['2026-10', 'Okt 2026'],
    ['2026-01', 'Jan 2026'],
    ['2025-12', 'Des 2025'],
  ])('shows %s as %s', (month, text) => {
    expect(formatMonth(month)).toBe(text)
  })

  it.each(['2026-13', '2026-00', '2026-1', '2026-10-01', '', null, undefined])('returns a dash for %j', (month) => {
    expect(formatMonth(month)).toBe('-')
  })
})
