import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import * as authApi from '@/api/auth'
import type { Role } from '@/api/types'
import { useSessionStore } from '@/stores/session'
import { freshPinia, mountView } from '@/test/mount'
import AppLayout from '../AppLayout.vue'

vi.mock('@/api/auth')

async function mountLayout(role: Role, path: string) {
  vi.mocked(authApi.login).mockResolvedValueOnce({
    accessToken: 'token',
    user: { id: 'u1', name: 'Siti Rahma', email: 'siti@example.com', role, mustChangePassword: false },
  })
  await useSessionStore().login('siti@example.com', 'password-123')
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
  it.each<[Role, string, string[]]>([
    ['SUPER_ADMIN', '/dashboard', ['Dashboard', 'Transaksi', 'Proyek', 'Master data', 'Pengguna', 'Audit log']],
    ['PROJECT_MANAGER', '/proyek', ['Proyek Saya', 'Transaksi']],
    ['STAFF', '/transaksi', ['Transaksi']],
  ])('shows %s exactly their menu', async (role, path, labels) => {
    const { wrapper } = await mountLayout(role, path)

    expect(sidebarLinks(wrapper).map((link) => link.text())).toEqual(labels)
  })

  it('marks the current page in the menu', async () => {
    const { wrapper } = await mountLayout('SUPER_ADMIN', '/pengguna')

    const current = sidebarLinks(wrapper).filter((link) => link.attributes('aria-current') === 'page')

    expect(current.map((link) => link.text())).toEqual(['Pengguna'])
  })

  it('shows who is logged in and in which role', async () => {
    const { wrapper } = await mountLayout('PROJECT_MANAGER', '/proyek')

    const header = wrapper.get('header').text()
    expect(header).toContain('Siti Rahma')
    expect(header).toContain('Koordinator Proyek')
  })

  it('offers a way to change the password', async () => {
    const { wrapper, router } = await mountLayout('STAFF', '/transaksi')

    await wrapper.get('[data-testid="change-password"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/ganti-password')
  })

  it('logs out and returns to the login page', async () => {
    vi.mocked(authApi.logout).mockResolvedValue()
    const { wrapper, router } = await mountLayout('STAFF', '/transaksi')

    await wrapper.get('[data-testid="logout"]').trigger('click')
    await flushPromises()

    expect(authApi.logout).toHaveBeenCalled()
    expect(useSessionStore().isAuthenticated).toBe(false)
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('opens the menu as a drawer on small screens and closes it after a choice', async () => {
    const { wrapper, router } = await mountLayout('SUPER_ADMIN', '/dashboard')
    const toggle = wrapper.get('[data-testid="menu-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('click')
    await flushPromises()
    expect(toggle.attributes('aria-expanded')).toBe('true')

    const drawerLinks = [...document.querySelectorAll<HTMLAnchorElement>('[data-testid="drawer-nav"] a')]
    expect(drawerLinks.map((link) => link.textContent?.trim())).toEqual([
      'Dashboard',
      'Transaksi',
      'Proyek',
      'Master data',
      'Pengguna',
      'Audit log',
    ])
    drawerLinks[4]!.click()
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/pengguna')
    expect(toggle.attributes('aria-expanded')).toBe('false')
  })

  it('renders the page content', async () => {
    const { wrapper } = await mountLayout('STAFF', '/transaksi')
    expect(wrapper.find('main').exists()).toBe(true)
  })
})
