import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import * as authApi from '@/api/auth'
import * as http from '@/api/http'
import type { AuthUser, SessionResponse } from '@/api/types'
import { useSessionStore } from '../session'

vi.mock('@/api/auth')
vi.mock('@/api/http')

const OWNER: AuthUser = { id: 'u-owner', name: 'Pemilik' }
const SESSION: SessionResponse = { accessToken: 'token-1', user: OWNER }

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

      expect(session.user).toEqual(OWNER)
      expect(session.isAuthenticated).toBe(true)
      expect(session.ready).toBe(true)
    })

    it('ends up signed out but ready when there is no session', async () => {
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

  describe('signing in', () => {
    it('creates the PIN, then holds the owner and hands the token to the HTTP client', async () => {
      vi.mocked(authApi.setupPin).mockResolvedValue(SESSION)
      const session = useSessionStore()

      await session.setupPin('000123')

      expect(authApi.setupPin).toHaveBeenCalledWith('000123')
      expect(session.user).toEqual(OWNER)
      expect(http.setAccessToken).toHaveBeenCalledWith('token-1')
    })

    it('signs in with the PIN', async () => {
      vi.mocked(authApi.login).mockResolvedValue(SESSION)
      const session = useSessionStore()

      await session.login('135792')

      expect(authApi.login).toHaveBeenCalledWith('135792')
      expect(session.user).toEqual(OWNER)
    })

    it('stays signed out and passes the error on when the PIN is refused', async () => {
      const failure = new Error('PIN salah')
      vi.mocked(authApi.login).mockRejectedValue(failure)
      const session = useSessionStore()

      await expect(session.login('999999')).rejects.toBe(failure)
      expect(session.user).toBeNull()
      expect(http.setAccessToken).not.toHaveBeenCalled()
    })
  })

  it('takes the new token after a PIN change', async () => {
    vi.mocked(authApi.login).mockResolvedValue(SESSION)
    vi.mocked(authApi.changePin).mockResolvedValue({ accessToken: 'token-2', user: OWNER })
    const session = useSessionStore()
    await session.login('135792')

    await session.changePin('135792', '246810')

    expect(authApi.changePin).toHaveBeenCalledWith('135792', '246810')
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
      await session.login('135792')

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
    await session.login('135792')

    vi.mocked(http.bindSessionEvents).mock.calls[0]![0].onExpired()

    expect(session.user).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('follows a silently refreshed session', async () => {
    vi.mocked(authApi.login).mockResolvedValue(SESSION)
    const session = useSessionStore()
    await session.login('135792')
    const renamed = { ...OWNER, name: 'Pemilik Baru' }

    vi.mocked(http.bindSessionEvents).mock.calls[0]![0].onRefreshed({ accessToken: 'token-3', user: renamed })

    expect(session.user).toEqual(renamed)
  })

  it('never writes to browser storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    vi.mocked(authApi.login).mockResolvedValue(SESSION)
    vi.mocked(http.refreshSession).mockResolvedValue(SESSION)
    const session = useSessionStore()

    await session.restore()
    await session.login('135792')
    await session.logout()

    expect(setItem).not.toHaveBeenCalled()
    expect(document.cookie).toBe('')
  })
})
