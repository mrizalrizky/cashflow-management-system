import { describe, expect, it } from 'vitest'
import type { InstallmentStatus } from '@/api/types'
import { endMonthOf, installmentOptionLabel, installmentStatusLabel, progressText } from '../installments'

describe('installments', () => {
  it('computes the end month the same way as the API', () => {
    expect(endMonthOf('2026-11', 3)).toBe('2027-01')
    expect(endMonthOf('2026-10', 1)).toBe('2026-10')
    expect(endMonthOf('2026-12', 13)).toBe('2027-12')
    expect(endMonthOf(null, 3)).toBeNull()
    expect(endMonthOf('2026-10', 0)).toBeNull()
    expect(endMonthOf('2026-10', 2.5)).toBeNull()
  })

  it('shows progress and the dropdown label', () => {
    const motor = { name: 'Motor', monthlyAmount: '1500000', paid: 2, months: 3 }
    expect(progressText(motor)).toBe('2/3')
    expect(installmentOptionLabel(motor)).toBe('Motor · Rp 1.500.000 · 2/3')
  })

  it('labels every status', () => {
    const statuses: InstallmentStatus[] = ['NOT_STARTED', 'ON_TRACK', 'BEHIND', 'PAID_OFF']
    expect(statuses.map(installmentStatusLabel)).toEqual(['Belum mulai', 'Berjalan', 'Tertinggal', 'Lunas'])
  })
})
