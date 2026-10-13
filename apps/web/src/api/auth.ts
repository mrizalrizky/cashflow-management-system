import { request } from './http'
import type { AuthUser, SessionResponse } from './types'

/** Apakah PIN sudah dibuat; menentukan layar pertama. */
export function pinStatus(): Promise<{ pinSet: boolean }> {
  return request('/auth/pin-status', { auth: false })
}

export function setupPin(pin: string): Promise<SessionResponse> {
  return request('/auth/setup-pin', { method: 'POST', body: { pin }, auth: false })
}

export function login(pin: string): Promise<SessionResponse> {
  return request('/auth/login', { method: 'POST', body: { pin }, auth: false })
}

/** Publik di sisi API: boleh dipanggil walau access token sudah kedaluwarsa. */
export function logout(): Promise<void> {
  return request('/auth/logout', { method: 'POST', auth: false })
}

export function me(): Promise<{ user: AuthUser }> {
  return request('/auth/me')
}

export function changePin(currentPin: string, newPin: string): Promise<SessionResponse> {
  return request('/auth/change-pin', { method: 'POST', body: { currentPin, newPin } })
}
