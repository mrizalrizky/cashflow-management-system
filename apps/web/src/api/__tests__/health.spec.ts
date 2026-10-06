import { describe, expect, it, vi } from 'vitest'
import { fetchHealth } from '../health'

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response
}

describe('fetchHealth', () => {
  it('returns up when the API reports ok, calling the versioned endpoint with a timeout', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ status: 'ok' }))
    expect(await fetchHealth(fetchFn)).toBe('up')
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/v1/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('returns down for a 503 response', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ statusCode: 503 }, false))
    expect(await fetchHealth(fetchFn)).toBe('down')
  })

  it('returns down when the request itself fails', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await fetchHealth(fetchFn)).toBe('down')
  })

  it('returns down for a 200 that is not the API, such as an HTML fallback page', async () => {
    const html = {
      ok: true,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    } as Response
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(html)
    expect(await fetchHealth(fetchFn)).toBe('down')
  })

  it('returns down for a 200 JSON body without status ok', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ hello: 'world' }))
    expect(await fetchHealth(fetchFn)).toBe('down')
  })

  it('returns down when the request is aborted by the timeout', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'))
    expect(await fetchHealth(fetchFn)).toBe('down')
  })
})
