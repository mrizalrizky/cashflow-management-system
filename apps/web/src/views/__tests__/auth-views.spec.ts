import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import * as authApi from '@/api/auth'
import { ApiError } from '@/api/http'
import type { AuthUser, Role } from '@/api/types'
import { useSessionStore } from '@/stores/session'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import ChangePasswordView from '../ChangePasswordView.vue'
import LoginView from '../LoginView.vue'

vi.mock('@/api/auth')

function user(role: Role, mustChangePassword = false): AuthUser {
  return { id: 'u1', name: 'Nama', email: 'a@example.com', role, mustChangePassword }
}

function sessionFor(current: AuthUser) {
  return { accessToken: 'token', user: current }
}

/** Login lewat store sungguhan supaya halaman melihat keadaan yang sama seperti di aplikasi. */
async function signIn(current: AuthUser): Promise<void> {
  vi.mocked(authApi.login).mockResolvedValueOnce(sessionFor(current))
  await useSessionStore().login(current.email, 'password-123')
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
})

describe('LoginView', () => {
  async function mountLogin(path = '/login') {
    const view = await mountView(LoginView, { path })
    return view
  }

  async function typeCredentials(wrapper: Awaited<ReturnType<typeof mountLogin>>['wrapper']) {
    await fill(wrapper, '#email', 'admin@example.com')
    await fill(wrapper, '#password', 'rahasia-123')
  }

  it('asks for both fields and calls nothing when submitted empty', async () => {
    const { wrapper } = await mountLogin()

    await submitForm(wrapper)

    expect(wrapper.text()).toContain('Email wajib diisi')
    expect(wrapper.text()).toContain('Password wajib diisi')
    expect(authApi.login).not.toHaveBeenCalled()
  })

  it.each<[Role, string]>([
    ['SUPER_ADMIN', '/dashboard'],
    ['PROJECT_MANAGER', '/proyek'],
    ['STAFF', '/transaksi'],
  ])('logs a %s in and opens %s', async (role, landing) => {
    vi.mocked(authApi.login).mockResolvedValue(sessionFor(user(role)))
    const { wrapper, router } = await mountLogin()

    await typeCredentials(wrapper)
    await submitForm(wrapper)

    expect(authApi.login).toHaveBeenCalledWith('admin@example.com', 'rahasia-123')
    expect(router.currentRoute.value.fullPath).toBe(landing)
  })

  it('returns to the page the user originally asked for', async () => {
    vi.mocked(authApi.login).mockResolvedValue(sessionFor(user('SUPER_ADMIN')))
    const { wrapper, router } = await mountLogin('/login?redirect=/pengguna')

    await typeCredentials(wrapper)
    await submitForm(wrapper)

    expect(router.currentRoute.value.fullPath).toBe('/pengguna')
  })

  it('ignores a redirect that points outside the app', async () => {
    vi.mocked(authApi.login).mockResolvedValue(sessionFor(user('STAFF')))
    const { wrapper, router } = await mountLogin('/login?redirect=//evil.example')

    await typeCredentials(wrapper)
    await submitForm(wrapper)

    expect(router.currentRoute.value.fullPath).toBe('/transaksi')
  })

  it('sends a user with a temporary password to the change-password page', async () => {
    vi.mocked(authApi.login).mockResolvedValue(sessionFor(user('SUPER_ADMIN', true)))
    const { wrapper, router } = await mountLogin('/login?redirect=/pengguna')

    await typeCredentials(wrapper)
    await submitForm(wrapper)

    expect(router.currentRoute.value.fullPath).toBe('/ganti-password')
  })

  it.each([
    [new ApiError(401, 'Email atau password salah'), 'Email atau password salah'],
    [
      new ApiError(429, 'Terlalu banyak percobaan login. Coba lagi nanti.'),
      'Terlalu banyak percobaan login',
    ],
    [new ApiError(0, 'Tidak dapat terhubung ke server'), 'Tidak dapat terhubung ke server'],
  ])('shows the reason when login fails', async (error, message) => {
    vi.mocked(authApi.login).mockRejectedValue(error)
    const { wrapper, router } = await mountLogin()

    await typeCredentials(wrapper)
    await submitForm(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toContain(message)
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('disables the button while the request is in flight', async () => {
    let finish!: () => void
    vi.mocked(authApi.login).mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve(sessionFor(user('STAFF')))
      }),
    )
    const { wrapper } = await mountLogin()

    await typeCredentials(wrapper)
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    finish()
    await flushPromises()
  })
})

describe('ChangePasswordView', () => {
  const CURRENT = '#currentPassword'
  const NEXT = '#newPassword'
  const CONFIRM = '#confirmPassword'

  async function mountChange(current: AuthUser) {
    await signIn(current)
    return mountView(ChangePasswordView, { path: '/ganti-password' })
  }

  it('explains the forced change only when one is pending', async () => {
    const pending = await mountChange(user('STAFF', true))
    expect(pending.wrapper.text()).toContain('wajib mengganti password')
    pending.wrapper.unmount()

    freshPinia()
    const voluntary = await mountChange(user('STAFF'))
    expect(voluntary.wrapper.text()).not.toContain('wajib mengganti password')
  })

  it.each([
    ['a short new password', 'pendek1', 'pendek1', 'Password baru minimal 8 karakter'],
    ['a confirmation that differs', 'password-baru-1', 'password-baru-2', 'Konfirmasi password tidak sama'],
  ])('rejects %s without calling the API', async (_label, next, confirm, message) => {
    const { wrapper } = await mountChange(user('STAFF', true))

    await fill(wrapper, CURRENT, 'password-lama-1')
    await fill(wrapper, NEXT, next)
    await fill(wrapper, CONFIRM, confirm)
    await submitForm(wrapper)

    expect(wrapper.text()).toContain(message)
    expect(authApi.changePassword).not.toHaveBeenCalled()
  })

  it('changes the password and opens the landing page', async () => {
    vi.mocked(authApi.changePassword).mockResolvedValue(sessionFor(user('PROJECT_MANAGER')))
    const { wrapper, router } = await mountChange(user('PROJECT_MANAGER', true))

    await fill(wrapper, CURRENT, 'password-lama-1')
    await fill(wrapper, NEXT, 'password-baru-1')
    await fill(wrapper, CONFIRM, 'password-baru-1')
    await submitForm(wrapper)

    expect(authApi.changePassword).toHaveBeenCalledWith('password-lama-1', 'password-baru-1')
    expect(router.currentRoute.value.fullPath).toBe('/proyek')
  })

  it('shows a server field error under the field it belongs to', async () => {
    vi.mocked(authApi.changePassword).mockRejectedValue(
      new ApiError(400, 'Validasi gagal', [
        { field: 'currentPassword', messages: ['Password saat ini salah'] },
      ]),
    )
    const { wrapper, router } = await mountChange(user('STAFF', true))

    await fill(wrapper, CURRENT, 'bukan-password')
    await fill(wrapper, NEXT, 'password-baru-1')
    await fill(wrapper, CONFIRM, 'password-baru-1')
    await submitForm(wrapper)

    expect(wrapper.get('#currentPassword-error').text()).toBe('Password saat ini salah')
    expect(router.currentRoute.value.path).toBe('/ganti-password')
  })

  it('lets a user who cannot change the password log out instead', async () => {
    vi.mocked(authApi.logout).mockResolvedValue()
    const { wrapper, router } = await mountChange(user('STAFF', true))

    await wrapper.get('[data-testid="logout"]').trigger('click')
    await flushPromises()

    expect(authApi.logout).toHaveBeenCalled()
    expect(useSessionStore().isAuthenticated).toBe(false)
    expect(router.currentRoute.value.path).toBe('/login')
  })
})
