import { describe, expect, it } from 'vitest'
import type { AuthUser } from '@/api/types'
import { postLoginPath, resolveNavigation, safeRedirect } from '../guards'
import { menu } from '../navigation'
import { routes } from '../routes'

const OWNER: AuthUser = { id: 'u-owner', name: 'Pemilik' }

/** Menjalankan aturan navigasi terhadap rute yang benar-benar terdaftar. */
function navigate(current: AuthUser | null, path: string) {
  const pathname = path.split('?')[0]
  const route = routes.find((r) => r.path === pathname)
  if (!route) throw new Error(`Rute ${pathname} tidak terdaftar`)
  return resolveNavigation({ user: current, to: { path: pathname!, fullPath: path, meta: route.meta ?? {} } })
}

describe('resolveNavigation', () => {
  it('sends a visitor without a session to the PIN entry, remembering the page', () => {
    expect(navigate(null, '/transaksi?page=2')).toEqual({
      path: '/masuk',
      query: { redirect: '/transaksi?page=2' },
    })
  })

  it('lets a visitor open the PIN pages', () => {
    expect(navigate(null, '/masuk')).toBe(true)
    expect(navigate(null, '/buat-pin')).toBe(true)
  })

  it('sends the owner from the root and the PIN pages to the dashboard', () => {
    expect(navigate(OWNER, '/')).toEqual({ path: '/dashboard' })
    expect(navigate(OWNER, '/masuk')).toEqual({ path: '/dashboard' })
    expect(navigate(OWNER, '/buat-pin')).toEqual({ path: '/dashboard' })
  })

  it('lets the owner open every page of the menu, the settings and the audit log', () => {
    for (const item of menu()) expect(navigate(OWNER, item.to)).toBe(true)
    expect(navigate(OWNER, '/pengaturan/audit-log')).toBe(true)
    expect(navigate(OWNER, '/cicilan/:id')).toBe(true)
  })

  it('no longer knows the company pages', () => {
    for (const path of ['/pengguna', '/proyek', '/ganti-password', '/login']) {
      expect(routes.find((route) => route.path === path)).toBeUndefined()
    }
  })
})

describe('postLoginPath', () => {
  it('follows a safe redirect and otherwise opens the dashboard', () => {
    expect(postLoginPath('/transaksi')).toBe('/transaksi')
    expect(postLoginPath('//evil.example')).toBe('/dashboard')
    expect(postLoginPath(undefined)).toBe('/dashboard')
  })
})

describe('menu', () => {
  it('lists the pages of the personal edition', () => {
    expect(menu().map((item) => item.label)).toEqual(['Dashboard', 'Transaksi', 'Cicilan', 'Master data', 'Pengaturan'])
  })
})

describe('safeRedirect', () => {
  it.each([
    ['/transaksi?page=2', '/transaksi?page=2'],
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
