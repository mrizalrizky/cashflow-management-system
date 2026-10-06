import { request } from './http'
import type { SessionResponse } from './types'

export function login(email: string, password: string): Promise<SessionResponse> {
  return request('/auth/login', { method: 'POST', body: { email, password }, auth: false })
}

/** Publik di sisi API: boleh dipanggil walau access token sudah kedaluwarsa. */
export function logout(): Promise<void> {
  return request('/auth/logout', { method: 'POST', auth: false })
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<SessionResponse> {
  return request('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  })
}
