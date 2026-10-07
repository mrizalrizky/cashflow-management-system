import { expect, type APIRequestContext } from '@playwright/test'
import { ADMIN } from './env'

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
 * Memanggil API langsung atas nama seorang pengguna, untuk menyiapkan data test tanpa
 * bergantung pada file test lain. Pengguna itu harus sudah memakai password tetapnya
 * (lihat `signIn`), karena password sementara tidak boleh dipakai selain untuk menggantinya.
 */
export async function apiAs(
  request: APIRequestContext,
  account: { email: string; password: string },
): Promise<ApiSession> {
  const login = await request.post(`${API}/auth/login`, {
    data: { email: account.email, password: account.password },
  })
  expect(login.ok(), `login ${account.email} lewat API`).toBe(true)
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

export function adminApi(request: APIRequestContext): Promise<ApiSession> {
  return apiAs(request, ADMIN)
}
