import type { FieldError, SessionResponse } from './types'

const BASE_URL = '/api/v1'
const REFRESH_PATH = '/auth/refresh'

export type QueryValue = string | number | boolean | undefined

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH'
  body?: unknown
  query?: Record<string, QueryValue>
  /** `false` untuk rute tanpa access token (login, refresh, logout). */
  auth?: boolean
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
let sessionExpiredHandler: (() => void) | null = null
let refreshing: Promise<SessionResponse | null> | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

/** Dipanggil sekali saat sesi yang tadinya aktif tidak bisa diperpanjang lagi. */
export function onSessionExpired(handler: () => void): void {
  sessionExpiredHandler = handler
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value))
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

async function callRefresh(): Promise<RefreshOutcome> {
  // Dicoba dua kali: tab lain mungkin baru saja merotasi token yang sama, dan
  // percobaan kedua membawa cookie baru yang ditulis tab itu.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await send<SessionResponse>(REFRESH_PATH, { method: 'POST', auth: false })
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 401) return 'unavailable'
    }
  }
  return 'expired'
}

/**
 * Memperpanjang sesi lewat cookie refresh. Pemanggil yang datang bersamaan menunggu satu
 * request yang sama. Mengembalikan null bila tidak ada sesi yang bisa diperpanjang.
 */
export function refreshSession(): Promise<SessionResponse | null> {
  refreshing ??= (async () => {
    const hadSession = accessToken !== null
    const outcome = await callRefresh()
    if (typeof outcome === 'object') {
      accessToken = outcome.accessToken
      return outcome
    }
    if (outcome === 'expired') {
      accessToken = null
      if (hadSession) sessionExpiredHandler?.()
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
    const tokenRejected =
      error instanceof ApiError && error.statusCode === 401 && options.auth !== false
    if (!tokenRejected || !(await refreshSession())) throw error
    return send<T>(path, options)
  }
}
