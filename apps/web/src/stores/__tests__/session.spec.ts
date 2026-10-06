import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import * as authApi from '@/api/auth'
import * as http from '@/api/http'
import type { AuthUser, SessionResponse } from '@/api/types'
import { useSessionStore } from '../session'

vi.mock('@/api/auth')
vi.mock('@/api/http')

const USER: AuthUser = {
  id: 'u1',
  name: 'Admin',
  email: 'admin@example.com',
  role: 'SUPER_ADMIN',
  mustChangePassword: true,
}
const SESSION: SessionResponse = { accessToken: 'token-1', user: USER }

describe('session store', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
  })

  describe('restore', () => {
    it('picks up an existing session', async () => {
      vi.mocked(http.refreshSession).mockResolvedValue(SESSION)
      const session = useSessionStore()

      await session.restore()

      expect(session.user).toEqual(USER)
      expect(session.isAuthenticated).toBe(true)
      expect(session.ready).toBe(true)
    })

    it('ends up logged out but ready when there is no session', async () => {
      vi.mocked(http.refreshSession).mockResolvedValue(null)
      const session = useSessionStore()

      await session.restore()

      expect(session.user).toBeNull()
      expect(session.ready).toBe(true)
    })

    it('never throws, even when the refresh blows up', async () => {
      vi.mocked(http.refreshSession).mockRejectedValue(new Error('boom'))
      const session = useSessionStore()

      await expect(session.restore()).resolves.toBeUndefined()
      expect(session.ready).toBe(true)
    })

    it('runs only once however often it is called', async () => {
      vi.mocked(http.refreshSession).mockResolvedValue(SESSION)
      const session = useSessionStore()

      await Promise.all([session.restore(), session.restore()])
      await session.restore()

      expect(http.refreshSession).toHaveBeenCalledTimes(1)
    })
  })

  describe('login', () => {
    it('stores the user and hands the token to the HTTP client', async () => {
      vi.mocked(authApi.login).mockResolvedValue(SESSION)
      const session = useSessionStore()

      await session.login('admin@example.com', 'rahasia-123')

      expect(authApi.login).toHaveBeenCalledWith('admin@example.com', 'rahasia-123')
      expect(session.user).toEqual(USER)
      expect(session.role).toBe('SUPER_ADMIN')
      expect(http.setAccessToken).toHaveBeenCalledWith('token-1')
    })

    it('stays logged out and passes the error on when login fails', async () => {
      const failure = new Error('Email atau password salah')
      vi.mocked(authApi.login).mockRejectedValue(failure)
      const session = useSessionStore()

      await expect(session.login('a@example.com', 'salah')).rejects.toBe(failure)
      expect(session.user).toBeNull()
      expect(http.setAccessToken).not.toHaveBeenCalled()
    })
  })

  it('replaces the user and token after a password change', async () => {
    vi.mocked(authApi.login).mockResolvedValue(SESSION)
    vi.mocked(authApi.changePassword).mockResolvedValue({
      accessToken: 'token-2',
      user: { ...USER, mustChangePassword: false },
    })
    const session = useSessionStore()
    await session.login('admin@example.com', 'lama-12345')

    await session.changePassword('lama-12345', 'baru-12345')

    expect(authApi.changePassword).toHaveBeenCalledWith('lama-12345', 'baru-12345')
    expect(session.user?.mustChangePassword).toBe(false)
    expect(http.setAccessToken).toHaveBeenLastCalledWith('token-2')
  })

  describe('logout', () => {
    it.each([
      ['succeeds', () => vi.mocked(authApi.logout).mockResolvedValue(undefined)],
      ['fails', () => vi.mocked(authApi.logout).mockRejectedValue(new Error('offline'))],
    ])('clears the session when the API call %s', async (_label, arrange) => {
      vi.mocked(authApi.login).mockResolvedValue(SESSION)
      arrange()
      const session = useSessionStore()
      await session.login('admin@example.com', 'rahasia-123')

      await session.logout()

      expect(session.user).toBeNull()
      expect(session.isAuthenticated).toBe(false)
      expect(http.setAccessToken).toHaveBeenLastCalledWith(null)
    })
  })

  it('clears itself and notifies the listener when the HTTP client reports an expired session', async () => {
    vi.mocked(authApi.login).mockResolvedValue(SESSION)
    const session = useSessionStore()
    const listener = vi.fn<() => void>()
    session.onExpired(listener)
    await session.login('admin@example.com', 'rahasia-123')

    vi.mocked(http.bindSessionEvents).mock.calls[0]![0].onExpired()

    expect(session.user).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('follows the user of a silently refreshed session, such as another login in a second tab', async () => {
    vi.mocked(authApi.login).mockResolvedValue(SESSION)
    const session = useSessionStore()
    await session.login('admin@example.com', 'rahasia-123')
    const other = { ...USER, id: 'u2', name: 'Orang Lain', role: 'STAFF' as const }

    vi.mocked(http.bindSessionEvents).mock.calls[0]![0].onRefreshed({
      accessToken: 'token-3',
      user: other,
    })

    expect(session.user).toEqual(other)
    expect(session.role).toBe('STAFF')
  })

  it('never writes to browser storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    vi.mocked(authApi.login).mockResolvedValue(SESSION)
    vi.mocked(http.refreshSession).mockResolvedValue(SESSION)
    const session = useSessionStore()

    await session.restore()
    await session.login('admin@example.com', 'rahasia-123')
    await session.logout()

    expect(setItem).not.toHaveBeenCalled()
    expect(document.cookie).toBe('')
  })
})
