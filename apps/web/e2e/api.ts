import { expect, type APIRequestContext } from '@playwright/test'
import { OWNER } from './env'

const API = '/api/v1'

export interface UploadFile {
  name: string
  mimeType: string
  buffer: Buffer
}

export interface ApiSession {
  post<T = unknown>(path: string, data?: unknown): Promise<T>
  put<T = unknown>(path: string, data: unknown): Promise<T>
  upload(path: string, file: UploadFile): Promise<void>
}

/**
 * Memanggil API langsung atas nama pemilik, untuk menyiapkan data test tanpa bergantung pada
 * file test lain. Pada database baru, PIN dibuat dulu.
 */
export async function ownerApi(request: APIRequestContext): Promise<ApiSession> {
  const status = await request.get(`${API}/auth/pin-status`)
  const { pinSet } = (await status.json()) as { pinSet: boolean }
  const login = await request.post(`${API}/auth/${pinSet ? 'login' : 'setup-pin'}`, { data: { pin: OWNER.pin } })
  expect(login.ok(), `masuk dengan PIN lewat API: ${await login.text()}`).toBe(true)
  const headers = { Authorization: `Bearer ${(await login.json()).accessToken}` }

  async function send<T>(method: 'post' | 'put', path: string, options: object): Promise<T> {
    const response = await request[method](`${API}${path}`, { headers, ...options })
    expect(response.ok(), `${method.toUpperCase()} ${path}: ${await response.text()}`).toBe(true)
    return (response.status() === 204 ? undefined : await response.json()) as T
  }

  return {
    post: (path, data) => send('post', path, { data }),
    put: (path, data) => send('put', path, { data }),
    upload: (path, file) => send('post', path, { multipart: { file } }),
  }
}
