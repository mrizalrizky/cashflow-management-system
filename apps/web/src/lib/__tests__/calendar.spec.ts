import { afterEach, describe, expect, it, vi } from 'vitest'
import { todayInJakarta } from '../calendar'

describe('todayInJakarta', () => {
  afterEach(() => vi.useRealTimers())

  it.each([
    ['2026-10-06T16:59:59Z', '2026-10-06'],
    ['2026-10-06T17:00:00Z', '2026-10-07'],
    ['2026-10-06T18:30:00Z', '2026-10-07'],
    ['2026-12-31T20:00:00Z', '2027-01-01'],
  ])('at %s it is %s in Jakarta', (now, expected) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(now))

    expect(todayInJakarta()).toBe(expected)
  })
})
