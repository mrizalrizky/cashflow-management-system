import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '@/api/auth'
import { ApiError } from '@/api/http'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import { signIn } from '@/test/session'
import SettingsView from '../SettingsView.vue'

vi.mock('@/api/auth')

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
  signIn()
})

async function fillChange(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], current: string) {
  await fill(wrapper, '#current-pin', current)
  await fill(wrapper, '#new-pin', '246810')
  await fill(wrapper, '#new-pin-confirm', '246810')
  await submitForm(wrapper)
}

describe('SettingsView', () => {
  it('changes the PIN and links to the audit log', async () => {
    vi.mocked(authApi.changePin).mockResolvedValue({ accessToken: 't', user: { id: 'u-owner', name: 'Pemilik' } })
    const { wrapper } = await mountView(SettingsView, { path: '/pengaturan', withOverlays: true })

    expect(wrapper.find('a[href="/pengaturan/audit-log"]').exists()).toBe(true)
    await fillChange(wrapper, '135792')

    expect(authApi.changePin).toHaveBeenCalledWith('135792', '246810')
    expect(document.body.textContent).toContain('PIN diganti. Perangkat lain sudah dikeluarkan.')
    expect((wrapper.get('#current-pin').element as HTMLInputElement).value).toBe('')
  })

  it('shows the API complaint about the current PIN under that field', async () => {
    vi.mocked(authApi.changePin).mockRejectedValue(
      new ApiError(400, 'Validasi gagal', [{ field: 'currentPin', messages: ['PIN saat ini salah'] }]),
    )
    const { wrapper } = await mountView(SettingsView, { path: '/pengaturan', withOverlays: true })

    await fillChange(wrapper, '000000')

    expect(wrapper.get('#current-pin-error').text()).toBe('PIN saat ini salah')
  })

  it('stops when the new PIN is not typed the same twice', async () => {
    const { wrapper } = await mountView(SettingsView, { path: '/pengaturan', withOverlays: true })
    await fill(wrapper, '#current-pin', '135792')
    await fill(wrapper, '#new-pin', '246810')
    await fill(wrapper, '#new-pin-confirm', '246811')
    await submitForm(wrapper)

    expect(wrapper.get('#new-pin-confirm-error').text()).toBe('PIN tidak sama')
    expect(authApi.changePin).not.toHaveBeenCalled()
  })
})
