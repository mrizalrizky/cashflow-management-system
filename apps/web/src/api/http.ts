import type { FieldError, SessionResponse } from './types'

const BASE_URL = '/api/v1'
const REFRESH_PATH = '/auth/refresh'
const REFRESH_LOCK = 'auth-refresh'
const REFRESH_RETRY_DELAY_MS = 250

/** `null`, `undefined` dan teks kosong sama-sama berarti "tanpa filter". */
export type QueryValue = string | number | boolean | null | undefined

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** Dikirim sebagai JSON. */
  body?: unknown
  /** Dikirim apa adanya (unggah berkas); tidak bisa bersama `body`. */
  form?: FormData
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
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
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

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    // Mis. halaman HTML dari proxy; bukan jawaban API.
    throw new ApiError(response.status, `Respons server tidak dapat dibaca (${response.status})`)
  }
}

function encodeBody(options: RequestOptions): BodyInit | undefined {
  if (options.form) {
    if (options.body !== undefined) throw new Error('Request tidak bisa membawa body dan form sekaligus')
    return options.form
  }
  return options.body === undefined ? undefined : JSON.stringify(options.body)
}

/**
 * Satu request ke API, tanpa percobaan ulang. Setiap kegagalan menjadi `ApiError`;
 * jawaban yang berhasil dibaca oleh `read` (JSON atau berkas).
 */
async function send<T>(
  path: string,
  options: RequestOptions,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const body = encodeBody(options)
  const headers: Record<string, string> = { Accept: 'application/json' }
  // Untuk form, browser sendiri yang mengisi Content-Type beserta pembatasnya.
  if (typeof body === 'string') headers['Content-Type'] = 'application/json'
  if (options.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'Tidak dapat terhubung ke server')
  }

  if (response.status === 204) return undefined as T
  if (!response.ok) throw toApiError(response.status, await readJson(response))
  return read(response)
}

function sendJson<T>(path: string, options: RequestOptions): Promise<T> {
  return send(path, options, (response) => readJson(response) as Promise<T>)
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
      return await sendJson<SessionResponse>(REFRESH_PATH, { method: 'POST', auth: false })
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

/** Bila access token kedaluwarsa, sesi diperpanjang diam-diam lalu request diulang sekali. */
async function withSession<T>(options: RequestOptions, attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt()
  } catch (error) {
    if (!(error instanceof ApiError) || options.auth === false) throw error
    if (error.statusCode === 403) sessionEvents?.onForbidden()
    if (error.statusCode !== 401 || !(await refreshSession())) throw error
    return attempt()
  }
}

/** Request ke API dengan jawaban JSON. */
export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return withSession(options, () => sendJson<T>(path, options))
}

/** Mengambil berkas dari API, dengan aturan sesi yang sama seperti `request`. */
export function requestBlob(path: string): Promise<Blob> {
  return withSession({}, () => send(path, {}, (response) => response.blob()))
}
