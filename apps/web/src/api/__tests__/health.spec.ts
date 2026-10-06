import { describe, expect, it, vi } from 'vitest'
import { fetchHealth } from '../health'

describe('fetchHealth', () => {
  it('returns up for a 200 response and calls the versioned endpoint', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue({ ok: true } as Response)
    expect(await fetchHealth(fetchFn)).toBe('up')
    expect(fetchFn).toHaveBeenCalledWith('/api/v1/health')
  })

  it('returns down for a 503 response', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue({ ok: false, status: 503 } as Response)
    expect(await fetchHealth(fetchFn)).toBe('down')
  })

  it('returns down when the request itself fails', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await fetchHealth(fetchFn)).toBe('down')
  })
})
