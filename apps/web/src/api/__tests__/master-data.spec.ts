import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as accounts from '../accounts'
import * as categories from '../categories'
import * as http from '../http'
import * as projects from '../projects'
import * as users from '../users'

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
    [
      'listProjects',
      () => projects.listProjects({ page: 1, pageSize: 20, search: 'rumah', status: 'ACTIVE' }),
      ['/projects', { query: { page: 1, pageSize: 20, search: 'rumah', status: 'ACTIVE' } }],
    ],
    ['getProject', () => projects.getProject('p1'), ['/projects/p1']],
    [
      'createProject',
      () => projects.createProject({ name: 'Rumah', clientName: 'Budi', contractValue: '850000000' }),
      ['/projects', { method: 'POST', body: { name: 'Rumah', clientName: 'Budi', contractValue: '850000000' } }],
    ],
    [
      'updateProject',
      () => projects.updateProject('p1', { status: 'COMPLETED', endDate: null }),
      ['/projects/p1', { method: 'PATCH', body: { status: 'COMPLETED', endDate: null } }],
    ],
    [
      'setProjectMembers',
      () => projects.setProjectMembers('p1', ['u1', 'u2']),
      ['/projects/p1/members', { method: 'PUT', body: { userIds: ['u1', 'u2'] } }],
    ],
  ])('%s calls the right route', async (_name, call, expected) => {
    await call()
    expect(request).toHaveBeenCalledExactlyOnceWith(...expected)
  })

  it('lists the active project managers that can be assigned', async () => {
    const managers = [{ id: 'u1', name: 'Ani' }]
    request.mockResolvedValue({ data: managers, meta: { page: 1, pageSize: 100, total: 1 } })

    expect(await users.listAssignableManagers()).toEqual(managers)

    expect(request).toHaveBeenCalledExactlyOnceWith('/users', {
      query: { role: 'PROJECT_MANAGER', isActive: true, page: 1, pageSize: 100 },
    })
  })
})
