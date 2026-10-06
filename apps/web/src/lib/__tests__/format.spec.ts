import { describe, expect, it } from 'vitest'
import { formatDate } from '../format'
import { roleLabel } from '../roles'

describe('formatDate', () => {
  it('formats as dd MMM yyyy in Jakarta time', () => {
    expect(formatDate('2026-10-06T03:00:00.000Z')).toBe('06 Okt 2026')
  })

  it('uses the Jakarta calendar day, which can be the day after UTC', () => {
    expect(formatDate('2026-10-06T17:30:00.000Z')).toBe('07 Okt 2026')
  })

  it.each([undefined, null, '', 'bukan tanggal'])('returns a dash for %j', (value) => {
    expect(formatDate(value)).toBe('-')
  })
})

describe('roleLabel', () => {
  it('names each role in Indonesian', () => {
    expect(roleLabel('SUPER_ADMIN')).toBe('Super Admin')
    expect(roleLabel('PROJECT_MANAGER')).toBe('Koordinator Proyek')
    expect(roleLabel('STAFF')).toBe('Staf')
  })
})
