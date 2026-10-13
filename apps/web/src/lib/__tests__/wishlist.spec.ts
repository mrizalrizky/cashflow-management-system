import { describe, expect, it } from 'vitest'
import type { AiVerdict, WishlistStatus } from '@/api/types'
import { VERDICT_SEVERITY, verdictLabel, WISHLIST_STATUS_OPTIONS, wishlistStatusLabel } from '../wishlist'

describe('wishlist labels', () => {
  it('names every status and verdict in Indonesian', () => {
    const statuses: WishlistStatus[] = ['WAITING', 'BOUGHT', 'CANCELLED']
    expect(statuses.map(wishlistStatusLabel)).toEqual(['Menunggu', 'Dibeli', 'Batal'])
    const verdicts: AiVerdict[] = ['IMPULSIVE', 'NEEDS_THOUGHT', 'PLANNED']
    expect(verdicts.map(verdictLabel)).toEqual(['Impulsif', 'Perlu dipikirkan', 'Terencana'])
  })

  it('colours the verdicts from warning to good', () => {
    expect(VERDICT_SEVERITY).toEqual({ IMPULSIVE: 'danger', NEEDS_THOUGHT: 'warn', PLANNED: 'success' })
  })

  it('offers the statuses as filter options', () => {
    expect(WISHLIST_STATUS_OPTIONS.map((option) => option.value)).toEqual(['WAITING', 'BOUGHT', 'CANCELLED'])
  })
})
