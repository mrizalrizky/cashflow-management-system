import { beforeEach, describe, expect, it, vi } from 'vitest'

type Http = typeof import('../http')
type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

const SESSION = { accessToken: 'token-baru', user: { id: 'u1' } }

const QUIET = {
  onExpired: () => undefined,
  onRefreshed: () => undefined,
  onForbidden: () => undefined,
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function unauthorized(): Response {
  return json(401, { statusCode: 401, message: 'Sesi tidak valid' })
}

/** Error yang dilempar sebuah request; test gagal bila request itu ternyata berhasil. */
async function failureOf(promise: Promise<unknown>): Promise<import('../http').ApiError> {
  try {
    await promise
  } catch (error) {
    return error as import('../http').ApiError
  }
  throw new Error('Request diharapkan gagal')
}

function urlOf(call: Parameters<typeof fetch>): string {
  return String(call[0])
}

function headersOf(call: Parameters<typeof fetch>): Record<string, string> {
  return (call[1]?.headers ?? {}) as Record<string, string>
}

describe('http client', () => {
  let http: Http
  let fetchMock: FetchMock

  /** Menjawab tiap request lewat fungsi `route`, supaya urutan panggilan tidak perlu ditebak. */
  function respond(route: (url: string, init: RequestInit) => Response | Promise<Response>): void {
    fetchMock.mockImplementation((input, init) => Promise.resolve(route(String(input), init ?? {})))
  }

  function refreshCalls(): number {
    return fetchMock.mock.calls.filter((call) => urlOf(call).endsWith('/auth/refresh')).length
  }

  beforeEach(async () => {
    // Klien menyimpan token di tingkat modul; tiap test memakai salinan modul yang baru.
    vi.resetModules()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    http = await import('../http')
  })

  describe('requests', () => {
    it('builds the URL under /api/v1 and skips undefined query values', async () => {
      respond(() => json(200, {}))

      await http.request('/users', { query: { page: 2, search: 'a b', role: undefined, isActive: false } })

      expect(urlOf(fetchMock.mock.calls[0]!)).toBe('/api/v1/users?page=2&search=a+b&isActive=false')
      expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'GET', credentials: 'same-origin' })
    })

    it('treats a null query value as absent, like undefined', async () => {
      respond(() => json(200, {}))

      await http.request('/users', { query: { page: 1, role: null, isActive: null } })

      expect(urlOf(fetchMock.mock.calls[0]!)).toBe('/api/v1/users?page=1')
    })

    it('treats an empty text query value as absent too', async () => {
      respond(() => json(200, {}))

      await http.request('/transactions', { query: { page: 1, search: '', dateFrom: '' } })

      expect(urlOf(fetchMock.mock.calls[0]!)).toBe('/api/v1/transactions?page=1')
    })

    it('sends a JSON body only when there is one', async () => {
      respond(() => json(200, {}))

      await http.request('/users', { method: 'POST', body: { name: 'A' } })
      await http.request('/users')

      const [post, get] = fetchMock.mock.calls
      expect(post![1]?.body).toBe('{"name":"A"}')
      expect(headersOf(post!)['Content-Type']).toBe('application/json')
      expect(get![1]?.body).toBeUndefined()
      expect(headersOf(get!)['Content-Type']).toBeUndefined()
    })

    it('attaches the access token unless the request is marked unauthenticated', async () => {
      respond(() => json(200, {}))
      http.setAccessToken('token-1')

      await http.request('/users')
      await http.request('/auth/login', { method: 'POST', body: {}, auth: false })

      expect(headersOf(fetchMock.mock.calls[0]!).Authorization).toBe('Bearer token-1')
      expect(headersOf(fetchMock.mock.calls[1]!).Authorization).toBeUndefined()
    })

    it('returns parsed JSON, and undefined for 204', async () => {
      respond((url) => (url.endsWith('/logout') ? new Response(null, { status: 204 }) : json(200, { id: 1 })))

      expect(await http.request('/users/1')).toEqual({ id: 1 })
      expect(await http.request('/auth/logout', { method: 'POST', auth: false })).toBeUndefined()
    })
  })

  describe('errors', () => {
    it('turns an API error into ApiError with its field errors', async () => {
      const errors = [{ field: 'email', messages: ['email must be an email'] }]
      respond(() => json(400, { statusCode: 400, message: 'Validasi gagal', errors }))

      const error = await failureOf(http.request('/users', { method: 'POST', body: {} }))

      expect(error).toBeInstanceOf(http.ApiError)
      expect(error).toMatchObject({ statusCode: 400, message: 'Validasi gagal', fieldErrors: errors })
    })

    it('reports a network failure as status 0 with a connection message', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

      const error = await failureOf(http.request('/users'))

      expect(error).toMatchObject({ statusCode: 0, message: 'Tidak dapat terhubung ke server', fieldErrors: [] })
    })

    it.each([
      ['an HTML error page from a proxy', 502, '<html>Bad Gateway</html>'],
      ['an HTML page with status 200', 200, '<html>fallback</html>'],
    ])('reports %s as a readable error, not a parse error', async (_label, status, body) => {
      respond(() => new Response(body, { status, headers: { 'Content-Type': 'text/html' } }))

      const error = await failureOf(http.request('/users'))

      expect(error).toBeInstanceOf(http.ApiError)
      expect(error.statusCode).toBe(status)
      expect(error.message).toMatch(/server/i)
    })
  })

  describe('silent refresh', () => {
    it('refreshes once on 401 and retries the request with the new token', async () => {
      http.setAccessToken('token-lama')
      respond((url, init) => {
        if (url.endsWith('/auth/refresh')) return json(200, SESSION)
        const auth = (init.headers as Record<string, string>).Authorization
        return auth === 'Bearer token-baru' ? json(200, { ok: true }) : unauthorized()
      })

      expect(await http.request('/users')).toEqual({ ok: true })

      expect(refreshCalls()).toBe(1)
      const refresh = fetchMock.mock.calls.find((call) => urlOf(call).endsWith('/auth/refresh'))!
      expect(refresh[1]).toMatchObject({ method: 'POST', credentials: 'same-origin' })
      expect(headersOf(refresh).Authorization).toBeUndefined()
    })

    it('tells the session listener who the refreshed session belongs to', async () => {
      const onRefreshed = vi.fn<(session: unknown) => void>()
      http.bindSessionEvents({ ...QUIET, onRefreshed })
      http.setAccessToken('token-lama')
      respond((url, init) => {
        if (url.endsWith('/auth/refresh')) return json(200, SESSION)
        const auth = (init.headers as Record<string, string>).Authorization
        return auth === 'Bearer token-baru' ? json(200, {}) : unauthorized()
      })

      await http.request('/users')

      expect(onRefreshed).toHaveBeenCalledExactlyOnceWith(SESSION)
    })

    it('holds a cross-tab lock while refreshing, when the browser offers one', async () => {
      const lock = vi.fn<(name: string, run: () => Promise<unknown>) => Promise<unknown>>(
        (_name, run) => run(),
      )
      vi.stubGlobal('navigator', { locks: { request: lock } })
      respond((url) => (url.endsWith('/auth/refresh') ? json(200, SESSION) : json(200, {})))

      await http.refreshSession()

      expect(lock).toHaveBeenCalledExactlyOnceWith('auth-refresh', expect.any(Function))
      vi.unstubAllGlobals()
      vi.stubGlobal('fetch', fetchMock)
    })

    it('shares one refresh between requests that fail together', async () => {
      http.setAccessToken('token-lama')
      respond((url, init) => {
        if (url.endsWith('/auth/refresh')) return json(200, SESSION)
        const auth = (init.headers as Record<string, string>).Authorization
        return auth === 'Bearer token-baru' ? json(200, { url }) : unauthorized()
      })

      const results = await Promise.all([http.request('/a'), http.request('/b'), http.request('/c')])

      expect(results).toHaveLength(3)
      expect(refreshCalls()).toBe(1)
    })

    it('tries the refresh a second time when another tab has just rotated the token', async () => {
      http.setAccessToken('token-lama')
      let refreshes = 0
      respond((url, init) => {
        if (url.endsWith('/auth/refresh')) {
          refreshes += 1
          return refreshes === 1 ? unauthorized() : json(200, SESSION)
        }
        const auth = (init.headers as Record<string, string>).Authorization
        return auth === 'Bearer token-baru' ? json(200, { ok: true }) : unauthorized()
      })

      expect(await http.request('/users')).toEqual({ ok: true })
      expect(refreshCalls()).toBe(2)
    })

    it('gives up after two failed refreshes and reports the expired session exactly once', async () => {
      const expired = vi.fn<() => void>()
      http.bindSessionEvents({ ...QUIET, onExpired: expired })
      http.setAccessToken('token-lama')
      respond(() => unauthorized())

      const results = await Promise.allSettled([http.request('/a'), http.request('/b'), http.request('/c')])

      expect(results.every((r) => r.status === 'rejected' && r.reason.statusCode === 401)).toBe(true)
      expect(refreshCalls()).toBe(2)
      expect(expired).toHaveBeenCalledTimes(1)

      fetchMock.mockClear()
      respond(() => json(200, {}))
      await http.request('/users')
      expect(headersOf(fetchMock.mock.calls[0]!).Authorization).toBeUndefined()
    })

    it('stops refreshing when the server is unreachable, without ending the session', async () => {
      const expired = vi.fn<() => void>()
      http.bindSessionEvents({ ...QUIET, onExpired: expired })
      http.setAccessToken('token-lama')
      respond((url) => {
        if (url.endsWith('/auth/refresh')) throw new TypeError('Failed to fetch')
        return unauthorized()
      })

      await expect(http.request('/users')).rejects.toMatchObject({ statusCode: 401 })
      expect(refreshCalls()).toBe(1)
      expect(expired).not.toHaveBeenCalled()
    })

    it('does not refresh for unauthenticated requests such as login', async () => {
      respond(() => json(401, { statusCode: 401, message: 'Email atau password salah' }))

      await expect(
        http.request('/auth/login', { method: 'POST', body: {}, auth: false }),
      ).rejects.toMatchObject({ statusCode: 401, message: 'Email atau password salah' })
      expect(refreshCalls()).toBe(0)
    })

    it('does not loop when the retried request is rejected again', async () => {
      http.setAccessToken('token-lama')
      respond((url) => (url.endsWith('/auth/refresh') ? json(200, SESSION) : unauthorized()))

      await expect(http.request('/users')).rejects.toMatchObject({ statusCode: 401 })
      expect(refreshCalls()).toBe(1)
    })
  })

  describe('forbidden responses', () => {
    const forbidden = () => json(403, { statusCode: 403, message: 'Anda tidak memiliki akses' })

    it('tells the session listener about a 403 and still rejects with it', async () => {
      const onForbidden = vi.fn<() => void>()
      http.bindSessionEvents({ ...QUIET, onForbidden })
      http.setAccessToken('token-1')
      respond(forbidden)

      await expect(http.request('/users')).rejects.toMatchObject({ statusCode: 403 })

      expect(onForbidden).toHaveBeenCalledTimes(1)
      expect(refreshCalls()).toBe(0)
    })

    it('says nothing for a 403 on an unauthenticated request', async () => {
      const onForbidden = vi.fn<() => void>()
      http.bindSessionEvents({ ...QUIET, onForbidden })
      respond(forbidden)

      await expect(http.request('/auth/login', { method: 'POST', body: {}, auth: false })).rejects.toMatchObject({
        statusCode: 403,
      })

      expect(onForbidden).not.toHaveBeenCalled()
    })
  })

  describe('refreshSession', () => {
    it('returns the session and stores its token', async () => {
      respond((url) => (url.endsWith('/auth/refresh') ? json(200, SESSION) : json(200, {})))

      expect(await http.refreshSession()).toEqual(SESSION)

      await http.request('/users')
      expect(headersOf(fetchMock.mock.calls[fetchMock.mock.calls.length - 1]!).Authorization).toBe('Bearer token-baru')
    })

    it('returns null without reporting an expired session when nobody was logged in', async () => {
      const expired = vi.fn<() => void>()
      http.bindSessionEvents({ ...QUIET, onExpired: expired })
      respond(() => unauthorized())

      expect(await http.refreshSession()).toBeNull()
      expect(expired).not.toHaveBeenCalled()
    })
  })

  describe('files and deletes', () => {
    beforeEach(() => http.setAccessToken('token-1'))

    it('sends DELETE and resolves undefined for 204', async () => {
      respond(() => new Response(null, { status: 204 }))

      expect(await http.request('/attachments/a1', { method: 'DELETE' })).toBeUndefined()

      expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'DELETE' })
    })

    it('sends a form as it is, leaving the content type to the browser', async () => {
      respond(() => json(201, { id: 'a1' }))
      const form = new FormData()
      form.append('file', new Blob(['isi']), 'nota.pdf')

      expect(await http.request('/transactions/t1/attachments', { method: 'POST', form })).toEqual({ id: 'a1' })

      const call = fetchMock.mock.calls[0]!
      expect(call[1]?.body).toBe(form)
      expect(headersOf(call)['Content-Type']).toBeUndefined()
      expect(headersOf(call).Authorization).toBe('Bearer token-1')
    })

    it('refuses a request with both a JSON body and a form, before sending anything', async () => {
      await expect(
        http.request('/transactions', { method: 'POST', body: {}, form: new FormData() }),
      ).rejects.toThrow('body')

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns a download as a blob', async () => {
      respond(() => new Response('isi berkas', { status: 200, headers: { 'Content-Type': 'application/pdf' } }))

      const blob = await http.requestBlob('/attachments/a1/download')

      expect(await blob.text()).toBe('isi berkas')
      expect(blob.type).toBe('application/pdf')
      expect(urlOf(fetchMock.mock.calls[0]!)).toBe('/api/v1/attachments/a1/download')
      expect(headersOf(fetchMock.mock.calls[0]!).Authorization).toBe('Bearer token-1')
    })

    it('refreshes and retries a download like any other request', async () => {
      respond((url, init) => {
        if (url.endsWith('/auth/refresh')) return json(200, SESSION)
        const auth = (init.headers as Record<string, string>).Authorization
        return auth === 'Bearer token-baru' ? new Response('isi') : unauthorized()
      })

      expect(await (await http.requestBlob('/attachments/a1/download')).text()).toBe('isi')
      expect(refreshCalls()).toBe(1)
    })

    it('reports a refused download with the API message, and a 403 to the session listener', async () => {
      const onForbidden = vi.fn<() => void>()
      http.bindSessionEvents({ ...QUIET, onForbidden })
      respond(() => json(404, { statusCode: 404, message: 'Bukti tidak ditemukan' }))

      const missing = await failureOf(http.requestBlob('/attachments/a1/download'))
      expect(missing).toMatchObject({ statusCode: 404, message: 'Bukti tidak ditemukan' })
      expect(onForbidden).not.toHaveBeenCalled()

      respond(() => json(403, { statusCode: 403, message: 'Anda tidak memiliki akses' }))
      await failureOf(http.requestBlob('/attachments/a1/download'))
      expect(onForbidden).toHaveBeenCalledTimes(1)
    })
  })

  describe('downloads with filters and a name', () => {
    const csv = (disposition?: string) =>
      new Response('isi', {
        status: 200,
        headers: { 'Content-Type': 'text/csv', ...(disposition ? { 'Content-Disposition': disposition } : {}) },
      })

    beforeEach(() => http.setAccessToken('token-1'))

    it('asks with the given filters and reads the name the API chose', async () => {
      respond(() => csv('attachment; filename="transaksi-20261007-1005.csv"'))

      const file = await http.requestFile('/transactions/export', { status: 'PENDING', search: '', type: null })

      expect(urlOf(fetchMock.mock.calls[0]!)).toBe('/api/v1/transactions/export?status=PENDING')
      expect(headersOf(fetchMock.mock.calls[0]!).Authorization).toBe('Bearer token-1')
      expect(file.fileName).toBe('transaksi-20261007-1005.csv')
      expect(await file.blob.text()).toBe('isi')
    })

    it('has no name when the API sent none', async () => {
      respond(() => csv())

      expect((await http.requestFile('/attachments/a1/download')).fileName).toBeNull()
    })

    it.each([
      ['attachment; filename="../../etc/passwd"', 'passwd'],
      ['attachment; filename="C:\\\\Users\\\\x\\\\nota.pdf"', 'nota.pdf'],
      ['attachment; filename=".."', null],
      ['attachment; filename=""', null],
      ['attachment; filename=tanpa-kutip.csv', 'tanpa-kutip.csv'],
    ])('keeps only a plain file name from %j', async (disposition, expected) => {
      respond(() => csv(disposition))

      expect((await http.requestFile('/transactions/export')).fileName).toBe(expected)
    })

    it('refreshes and retries like any other request', async () => {
      respond((url, init) => {
        if (url.endsWith('/auth/refresh')) return json(200, SESSION)
        const auth = (init.headers as Record<string, string>).Authorization
        return auth === 'Bearer token-baru' ? csv('attachment; filename="a.csv"') : unauthorized()
      })

      expect((await http.requestFile('/transactions/export')).fileName).toBe('a.csv')
      expect(refreshCalls()).toBe(1)
    })

    it('rejects with the API message and field errors when the filters are refused', async () => {
      respond(() =>
        json(400, { statusCode: 400, message: 'Validasi gagal', errors: [{ field: 'status', messages: ['tidak valid'] }] }),
      )

      const failure = await failureOf(http.requestFile('/transactions/export', { status: 'LUNAS' }))

      expect(failure).toMatchObject({ statusCode: 400, message: 'Validasi gagal' })
      expect(failure.fieldErrors).toEqual([{ field: 'status', messages: ['tidak valid'] }])
    })

    it('still offers a plain blob download', async () => {
      respond(() => csv('attachment; filename="nota.pdf"'))

      expect(await (await http.requestBlob('/attachments/a1/download')).text()).toBe('isi')
    })
  })
})
