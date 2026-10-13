import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import * as authApi from '@/api/auth'
import { useSessionStore } from '@/stores/session'
import { freshPinia, mountView } from '@/test/mount'
import AppLayout from '../AppLayout.vue'

vi.mock('@/api/auth')

async function mountLayout(path: string) {
  vi.mocked(authApi.login).mockResolvedValueOnce({ accessToken: 'token', user: { id: 'u1', name: 'Pemilik' } })
  await useSessionStore().login('135792')
  return mountView(AppLayout, { path })
}

function sidebarLinks(wrapper: Awaited<ReturnType<typeof mountLayout>>['wrapper']) {
  return wrapper.get('[data-testid="sidebar"]').findAll('a')
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
})

describe('AppLayout', () => {
  it('shows the menu of the personal edition', async () => {
    const { wrapper } = await mountLayout('/dashboard')

    expect(sidebarLinks(wrapper).map((link) => link.text())).toEqual([
      'Dashboard',
      'Transaksi',
      'Master data',
      'Pengaturan',
    ])
  })

  it('marks the current page in the menu', async () => {
    const { wrapper } = await mountLayout('/pengaturan')

    const current = sidebarLinks(wrapper).filter((link) => link.attributes('aria-current') === 'page')

    expect(current.map((link) => link.text())).toEqual(['Pengaturan'])
  })

  it('signs out and returns to the PIN entry', async () => {
    vi.mocked(authApi.logout).mockResolvedValue()
    const { wrapper, router } = await mountLayout('/transaksi')

    await wrapper.get('[data-testid="logout"]').trigger('click')
    await flushPromises()

    expect(authApi.logout).toHaveBeenCalled()
    expect(useSessionStore().isAuthenticated).toBe(false)
    expect(router.currentRoute.value.path).toBe('/masuk')
  })

  it('opens the menu as a drawer on small screens and closes it after a choice', async () => {
    const { wrapper, router } = await mountLayout('/dashboard')
    const toggle = wrapper.get('[data-testid="menu-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('click')
    await flushPromises()
    expect(toggle.attributes('aria-expanded')).toBe('true')

    const drawerLinks = [...document.querySelectorAll<HTMLAnchorElement>('[data-testid="drawer-nav"] a')]
    expect(drawerLinks.map((link) => link.textContent?.trim())).toEqual([
      'Dashboard',
      'Transaksi',
      'Master data',
      'Pengaturan',
    ])
    drawerLinks[3]!.click()
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/pengaturan')
    expect(toggle.attributes('aria-expanded')).toBe('false')
  })

  it('renders the page content', async () => {
    const { wrapper } = await mountLayout('/transaksi')
    expect(wrapper.find('main').exists()).toBe(true)
  })
})
