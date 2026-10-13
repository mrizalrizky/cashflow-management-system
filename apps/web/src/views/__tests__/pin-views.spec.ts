import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '@/api/auth'
import { ApiError } from '@/api/http'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import { useSessionStore } from '@/stores/session'
import PinLoginView from '../auth/PinLoginView.vue'
import SetupPinView from '../auth/SetupPinView.vue'

vi.mock('@/api/auth')

const SESSION = { accessToken: 'token', user: { id: 'u-owner', name: 'Pemilik' } }

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
})

describe('SetupPinView', () => {
  beforeEach(() => {
    vi.mocked(authApi.pinStatus).mockResolvedValue({ pinSet: false })
  })

  it('goes to the PIN entry at once, saying why, when a PIN already exists', async () => {
    vi.mocked(authApi.pinStatus).mockResolvedValue({ pinSet: true })
    const { router } = await mountView(SetupPinView, { path: '/buat-pin', withOverlays: true })

    expect(router.currentRoute.value.path).toBe('/masuk')
    expect(document.body.textContent).toContain('PIN sudah dibuat. Masuk dengan PIN itu.')
  })

  it('creates the PIN after it is typed twice the same, then opens the dashboard', async () => {
    vi.mocked(authApi.setupPin).mockResolvedValue(SESSION)
    const { wrapper, router } = await mountView(SetupPinView, { path: '/buat-pin' })

    await fill(wrapper, '#pin', '000123')
    await fill(wrapper, '#pin-confirm', '000123')
    await submitForm(wrapper)

    expect(authApi.setupPin).toHaveBeenCalledWith('000123')
    expect(useSessionStore().user).toEqual(SESSION.user)
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('stops when the two PINs differ', async () => {
    const { wrapper } = await mountView(SetupPinView, { path: '/buat-pin' })
    await fill(wrapper, '#pin', '123456')
    await fill(wrapper, '#pin-confirm', '123457')
    await submitForm(wrapper)

    expect(wrapper.get('#pin-confirm-error').text()).toBe('PIN tidak sama')
    expect(authApi.setupPin).not.toHaveBeenCalled()
  })

  it('refuses a PIN with a letter before sending anything', async () => {
    const { wrapper } = await mountView(SetupPinView, { path: '/buat-pin' })
    await fill(wrapper, '#pin', '12345a')
    await fill(wrapper, '#pin-confirm', '12345a')
    await submitForm(wrapper)

    expect(wrapper.get('#pin-error').text()).toBe('PIN harus 6 sampai 12 angka')
    expect(authApi.setupPin).not.toHaveBeenCalled()
  })

  it('sends the visitor to the PIN entry when another tab already created the PIN', async () => {
    vi.mocked(authApi.setupPin).mockRejectedValue(new ApiError(409, 'PIN sudah dibuat'))
    const { wrapper, router } = await mountView(SetupPinView, { path: '/buat-pin', withOverlays: true })
    await fill(wrapper, '#pin', '123456')
    await fill(wrapper, '#pin-confirm', '123456')
    await submitForm(wrapper)

    expect(router.currentRoute.value.path).toBe('/masuk')
    expect(document.body.textContent).toContain('PIN sudah dibuat. Masuk dengan PIN itu.')
  })
})

describe('PinLoginView', () => {
  beforeEach(() => {
    vi.mocked(authApi.pinStatus).mockResolvedValue({ pinSet: true })
  })

  it('signs in with the PIN and follows the redirect', async () => {
    vi.mocked(authApi.login).mockResolvedValue(SESSION)
    const { wrapper, router } = await mountView(PinLoginView, { path: '/masuk?redirect=/transaksi' })

    await fill(wrapper, '#pin', '135792')
    await submitForm(wrapper)

    expect(authApi.login).toHaveBeenCalledWith('135792')
    expect(router.currentRoute.value.path).toBe('/transaksi')
  })

  it('shows the API message for a wrong PIN and for the pause', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce(new ApiError(401, 'PIN salah'))
    vi.mocked(authApi.login).mockRejectedValueOnce(new ApiError(429, 'PIN dikunci. Coba lagi dalam 15 menit.'))
    const { wrapper } = await mountView(PinLoginView, { path: '/masuk' })

    await fill(wrapper, '#pin', '999999')
    await submitForm(wrapper)
    expect(wrapper.text()).toContain('PIN salah')

    await submitForm(wrapper)
    expect(wrapper.text()).toContain('PIN dikunci. Coba lagi dalam 15 menit.')
  })

  it('opens "Buat PIN" when the server answers that no PIN exists yet', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(409, 'PIN belum dibuat'))
    const { wrapper, router } = await mountView(PinLoginView, { path: '/masuk' })

    await fill(wrapper, '#pin', '135792')
    await submitForm(wrapper)

    expect(router.currentRoute.value.path).toBe('/buat-pin')
  })

  it('opens "Buat PIN" when no PIN exists yet', async () => {
    vi.mocked(authApi.pinStatus).mockResolvedValue({ pinSet: false })
    const { router } = await mountView(PinLoginView, { path: '/masuk' })
    expect(router.currentRoute.value.path).toBe('/buat-pin')
  })
})
