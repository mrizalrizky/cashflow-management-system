import type { FieldError, SessionResponse } from './types'

const BASE_URL = '/api/v1'
const REFRESH_PATH = '/auth/refresh'
const REFRESH_LOCK = 'auth-refresh'
const REFRESH_RETRY_DELAY_MS = 250

/** `null` dan `undefined` sama-sama berarti "tanpa filter". */
export type QueryValue = string | number | boolean | null | undefined

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT'
  body?: unknown
  query?: Record<string, QueryValue>
  /** `false` untuk rute tanpa access token (login, refresh, logout). */
  auth?: boolean
}

export interface SessionEvents {
  /** Sesi diperpanjang diam-diam; pemiliknya bisa saja berbeda bila tab lain login ulang. */
  onRefreshed(session: SessionResponse): void
  /** Sesi yang tadinya aktif tidak bisa diperpanjang lagi. */
  onExpired(): void
  /**
   * API menolak sebuah request (403). Bisa berarti hak akses user baru saja berubah,
   * mis. password direset atau perannya diganti oleh admin.
   */
  onForbidden(): void
}

export class ApiError extends Error {
  constructor(
    /** Status HTTP; 0 bila request tidak sampai ke server. */
    readonly statusCode: number,
    message: string,
    readonly fieldErrors: FieldError[] = [],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Access token hanya hidup di memori; tidak pernah ditulis ke storage browser.
let accessToken: string | null = null
let sessionEvents: SessionEvents | null = null
let refreshing: Promise<SessionResponse | null> | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

/** Satu pendengar untuk perubahan sesi yang terjadi di balik layar (dipakai store sesi). */
export function bindSessionEvents(events: SessionEvents): void {
  sessionEvents = events
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) params.set(key, String(value))
  }
  const search = params.toString()
  return `${BASE_URL}${path}${search ? `?${search}` : ''}`
}

function toApiError(status: number, payload: unknown): ApiError {
  if (payload && typeof payload === 'object') {
    const { message, errors } = payload as { message?: unknown; errors?: unknown }
    if (typeof message === 'string') {
      return new ApiError(status, message, Array.isArray(errors) ? (errors as FieldError[]) : [])
    }
  }
  return new ApiError(status, `Terjadi kesalahan pada server (${status})`)
}

/** Satu request ke API, tanpa percobaan ulang. Setiap kegagalan menjadi `ApiError`. */
async function send<T>(path: string, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'Tidak dapat terhubung ke server')
  }

  if (response.status === 204) return undefined as T

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    // Mis. halaman HTML dari proxy; bukan jawaban API.
    throw new ApiError(response.status, `Respons server tidak dapat dibaca (${response.status})`)
  }
  if (!response.ok) throw toApiError(response.status, payload)
  return payload as T
}

type RefreshOutcome = SessionResponse | 'expired' | 'unavailable'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callRefresh(): Promise<RefreshOutcome> {
  // Dicoba dua kali dengan jeda: tab lain mungkin baru saja merotasi token yang sama,
  // dan percobaan kedua membawa cookie baru yang ditulis tab itu.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await wait(REFRESH_RETRY_DELAY_MS)
    try {
      return await send<SessionResponse>(REFRESH_PATH, { method: 'POST', auth: false })
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 401) return 'unavailable'
    }
  }
  return 'expired'
}

/**
 * Menjalankan refresh bergantian antar tab bila browser mendukung Web Locks, sehingga tab
 * kedua baru mengirim request setelah cookie baru dari tab pertama tersimpan.
 */
function acrossTabs<T>(run: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks
  return locks ? (locks.request(REFRESH_LOCK, run) as Promise<T>) : run()
}

/**
 * Memperpanjang sesi lewat cookie refresh. Pemanggil yang datang bersamaan menunggu satu
 * request yang sama. Mengembalikan null bila tidak ada sesi yang bisa diperpanjang.
 */
export function refreshSession(): Promise<SessionResponse | null> {
  refreshing ??= (async () => {
    const hadSession = accessToken !== null
    const outcome = await acrossTabs(callRefresh)
    if (typeof outcome === 'object') {
      accessToken = outcome.accessToken
      sessionEvents?.onRefreshed(outcome)
      return outcome
    }
    if (outcome === 'expired') {
      accessToken = null
      if (hadSession) sessionEvents?.onExpired()
    }
    return null
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

/** Request ke API. Bila access token kedaluwarsa, sesi diperpanjang diam-diam lalu request diulang sekali. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await send<T>(path, options)
  } catch (error) {
    if (!(error instanceof ApiError) || options.auth === false) throw error
    if (error.statusCode === 403) sessionEvents?.onForbidden()
    if (error.statusCode !== 401 || !(await refreshSession())) throw error
    return send<T>(path, options)
  }
}
