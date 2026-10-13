import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as accounts from '../accounts'
import * as categories from '../categories'
import * as http from '../http'

vi.mock('../http')

const request = vi.mocked(http.request)

beforeEach(() => {
  vi.resetAllMocks()
  request.mockResolvedValue({ data: [] })
})

/** Tiap fungsi API hanya meneruskan argumennya ke `request` dengan rute dan metode yang benar. */
describe('master data API modules', () => {
  it.each<[string, () => Promise<unknown>, Parameters<typeof http.request>]>([
    [
      'listAccounts',
      () => accounts.listAccounts({ page: 2, pageSize: 20, type: 'CASH', isActive: null }),
      ['/accounts', { query: { page: 2, pageSize: 20, type: 'CASH', isActive: null } }],
    ],
    [
      'createAccount',
      () => accounts.createAccount({ name: 'Kas', type: 'CASH', openingBalance: '1000' }),
      ['/accounts', { method: 'POST', body: { name: 'Kas', type: 'CASH', openingBalance: '1000' } }],
    ],
    [
      'updateAccount',
      () => accounts.updateAccount('a1', { isActive: false }),
      ['/accounts/a1', { method: 'PATCH', body: { isActive: false } }],
    ],
    [
      'listCategories',
      () => categories.listCategories({ type: 'OUT', isActive: true }),
      ['/categories', { query: { type: 'OUT', isActive: true } }],
    ],
    [
      'createCategory',
      () => categories.createCategory({ name: 'Material', type: 'OUT' }),
      ['/categories', { method: 'POST', body: { name: 'Material', type: 'OUT' } }],
    ],
    [
      'updateCategory',
      () => categories.updateCategory('c1', { name: 'Bahan' }),
      ['/categories/c1', { method: 'PATCH', body: { name: 'Bahan' } }],
    ],
  ])('%s calls the right route', async (_name, call, expected) => {
    await call()
    expect(request).toHaveBeenCalledExactlyOnceWith(...expected)
  })
})
