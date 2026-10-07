import { expect, type APIRequestContext } from '@playwright/test'
import { ADMIN } from './env'

const API = '/api/v1'

export interface UploadFile {
  name: string
  mimeType: string
  buffer: Buffer
}

export interface AdminApi {
  post<T = unknown>(path: string, data?: unknown): Promise<T>
  put<T = unknown>(path: string, data: unknown): Promise<T>
  upload(path: string, file: UploadFile): Promise<void>
}

/**
 * Menyiapkan data test langsung lewat API atas nama admin, supaya tiap file test browser tidak
 * bergantung pada data file lain. Admin harus sudah memakai password tetapnya (lihat `signIn`).
 */
export async function adminApi(request: APIRequestContext): Promise<AdminApi> {
  const login = await request.post(`${API}/auth/login`, {
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(login.ok(), 'admin login lewat API').toBe(true)
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
