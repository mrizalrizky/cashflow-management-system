import { describe, expect, it } from 'vitest'
import { createTestRouter } from '@/test/mount'
import { reconcileRoute } from '../reconcile'
import type { AuthUser, Role } from '@/api/types'
import { resolveNavigation, safeRedirect } from '../guards'
import { menuFor } from '../navigation'
import { landingPath } from '../paths'
import { routes } from '../routes'

function user(role: Role, mustChangePassword = false): AuthUser {
  return { id: 'u1', name: 'Nama', email: 'a@example.com', role, mustChangePassword }
}

/** Menjalankan aturan navigasi terhadap rute yang benar-benar terdaftar. */
function navigate(current: AuthUser | null, path: string) {
  const pathname = path.split('?')[0]
  const route = routes.find((r) => r.path === pathname)
  if (!route) throw new Error(`Rute ${pathname} tidak terdaftar`)
  return resolveNavigation({
    user: current,
    to: { path: pathname!, fullPath: path, meta: route.meta ?? {} },
  })
}

describe('resolveNavigation', () => {
  it('sends a logged-out visitor to login and remembers where they were going', () => {
    expect(navigate(null, '/pengguna?page=2')).toEqual({
      path: '/login',
      query: { redirect: '/pengguna?page=2' },
    })
  })

  it('lets a logged-out visitor open the login page', () => {
    expect(navigate(null, '/login')).toBe(true)
  })

  it.each<[Role, string]>([
    ['SUPER_ADMIN', '/dashboard'],
    ['PROJECT_MANAGER', '/proyek'],
    ['STAFF', '/transaksi'],
  ])('sends a logged-in %s away from login and from / to %s', (role, landing) => {
    expect(navigate(user(role), '/login')).toEqual({ path: landing })
    expect(navigate(user(role), '/')).toEqual({ path: landing })
    expect(landingPath(role)).toBe(landing)
  })

  it('confines a user with a pending password change to the change-password page', () => {
    const pending = user('SUPER_ADMIN', true)
    for (const path of ['/dashboard', '/pengguna', '/', '/login']) {
      expect(navigate(pending, path)).toEqual({ path: '/ganti-password' })
    }
    expect(navigate(pending, '/ganti-password')).toBe(true)
  })

  it('lets any logged-in user change their password voluntarily', () => {
    expect(navigate(user('STAFF'), '/ganti-password')).toBe(true)
  })

  it.each<[Role, true | { path: string }]>([
    ['STAFF', { path: '/transaksi' }],
    ['PROJECT_MANAGER', { path: '/proyek' }],
    ['SUPER_ADMIN', true],
  ])('handles %s opening the user management page', (role, expected) => {
    expect(navigate(user(role), '/pengguna')).toEqual(expected)
  })

  it.each<Role>(['SUPER_ADMIN', 'PROJECT_MANAGER', 'STAFF'])(
    'allows %s to open every item in their own menu and their landing page',
    (role) => {
      for (const item of menuFor(role)) {
        expect(navigate(user(role), item.to)).toBe(true)
      }
      expect(navigate(user(role), landingPath(role))).toBe(true)
    },
  )
})

describe('project detail page', () => {
  it.each<[Role, true | { path: string }]>([
    ['STAFF', { path: '/transaksi' }],
    ['PROJECT_MANAGER', true],
    ['SUPER_ADMIN', true],
  ])('handles %s opening one', (role, expected) => {
    const route = routes.find((r) => r.path === '/proyek/:id')!
    const result = resolveNavigation({
      user: user(role),
      to: { path: '/proyek/abc', fullPath: '/proyek/abc', meta: route.meta ?? {} },
    })
    expect(result).toEqual(expected)
  })
})

describe('master data page', () => {
  it.each<[Role, true | { path: string }]>([
    ['STAFF', { path: '/transaksi' }],
    ['PROJECT_MANAGER', { path: '/proyek' }],
    ['SUPER_ADMIN', true],
  ])('handles %s opening it', (role, expected) => {
    expect(navigate(user(role), '/master-data')).toEqual(expected)
  })
})

describe('menuFor', () => {
  it.each<[Role, string[]]>([
    ['SUPER_ADMIN', ['Dashboard', 'Transaksi', 'Proyek', 'Master data', 'Pengguna', 'Audit log']],
    ['PROJECT_MANAGER', ['Proyek Saya', 'Transaksi']],
    ['STAFF', ['Transaksi']],
  ])('lists the pages for %s', (role, labels) => {
    expect(menuFor(role).map((item) => item.label)).toEqual(labels)
  })
})

describe('safeRedirect', () => {
  it.each([
    ['/pengguna?page=2', '/pengguna?page=2'],
    ['//evil.example', null],
    ['https://evil.example', null],
    ['/\\evil.example', null],
    ['javascript:alert(1)', null],
    ['', null],
    [undefined, null],
    [['/a', '/b'], null],
  ])('maps %j to %j', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected)
  })
})

describe('reconcileRoute', () => {
  async function at(path: string) {
    const router = createTestRouter()
    await router.push(path)
    await router.isReady()
    return router
  }

  it('moves a user whose password was reset to the change-password page', async () => {
    const router = await at('/transaksi')

    await reconcileRoute(router, user('STAFF', true))

    expect(router.currentRoute.value.path).toBe('/ganti-password')
  })

  it('leaves the user where they are when the page is still allowed', async () => {
    const router = await at('/transaksi')

    await reconcileRoute(router, user('STAFF'))

    expect(router.currentRoute.value.path).toBe('/transaksi')
  })
})
