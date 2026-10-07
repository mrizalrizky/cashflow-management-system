import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import DataTable from 'primevue/datatable'
import Select from 'primevue/select'
import * as auditApi from '@/api/audit-logs'
import { ApiError } from '@/api/http'
import type { AuditLog, Role, User } from '@/api/types'
import * as usersApi from '@/api/users'
import DateField from '@/components/DateField.vue'
import { menuFor } from '@/router/navigation'
import { routes } from '@/router/routes'
import { freshPinia, mountView } from '@/test/mount'
import { signInAs } from '@/test/session'
import { pageOf } from '@/test/transactions'
import AuditLogView from '../AuditLogView.vue'

vi.mock('@/api/audit-logs')
vi.mock('@/api/users')

const TX_ID = '11111111-2222-4333-8444-555555555555'
const DEWI = { id: 'u-dewi', name: 'Dewi' }

function makeLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'l-approve',
    action: 'APPROVE',
    entityType: 'transaction',
    entityId: TX_ID,
    user: DEWI,
    before: { status: 'PENDING', amount: '150000', reviewed_by_id: null },
    after: { status: 'APPROVED', amount: '150000', reviewed_by_id: 'u-dewi' },
    ip: '10.0.0.7',
    createdAt: '2026-10-06T03:05:00.000Z',
    ...overrides,
  }
}

const APPROVE = makeLog()
const FAILED_LOGIN = makeLog({
  id: 'l-login',
  action: 'LOGIN_FAILED',
  entityType: 'user',
  entityId: 'siapa@example.com',
  user: null,
  before: null,
  after: null,
  ip: null,
})
const NEW_ACCOUNT = makeLog({
  id: 'l-account',
  action: 'CREATE',
  entityType: 'account',
  entityId: 'a-kas',
  before: null,
  after: { name: 'Kas Kecil', opening_balance: '500000', is_active: true },
})

function user(id: string, name: string): User {
  return {
    id,
    name,
    email: `${id}@example.com`,
    role: 'STAFF',
    isActive: true,
    mustChangePassword: false,
    createdAt: '2026-10-06T03:00:00.000Z',
    updatedAt: '2026-10-06T03:00:00.000Z',
  }
}

const listLogs = vi.mocked(auditApi.listAuditLogs)

function lastParams() {
  return listLogs.mock.calls[listLogs.mock.calls.length - 1]![0]
}

function select(wrapper: VueWrapper, label: string) {
  const found = wrapper.findAllComponents(Select).find((s) => s.props('ariaLabel') === label)
  if (!found) throw new Error(`Tidak ada pilihan berlabel ${label}`)
  return found
}

async function choose(wrapper: VueWrapper, label: string, value: string | null): Promise<void> {
  select(wrapper, label).vm.$emit('update:modelValue', value)
  await flushPromises()
}

async function mountLog(logs: AuditLog[] = [APPROVE, FAILED_LOGIN, NEW_ACCOUNT], path = '/audit-log') {
  signInAs('SUPER_ADMIN')
  listLogs.mockResolvedValue(pageOf(logs))
  vi.mocked(usersApi.listUsers).mockResolvedValue(pageOf([user('u-dewi', 'Dewi'), user('u-sari', 'Sari')]))
  return mountView(AuditLogView, { path, withOverlays: true })
}

async function openDetail(wrapper: VueWrapper, id: string): Promise<VueWrapper> {
  await wrapper.get(`[data-testid="detail-${id}"]`).trigger('click')
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
})

describe('audit log route and menu', () => {
  it('is for the admin only', async () => {
    const route = routes.find((r) => r.path === '/audit-log')!
    const loaded = await (route.component as () => Promise<{ default: unknown }>)()

    expect(loaded.default).toBe(AuditLogView)
    expect(route.meta?.roles).toEqual(['SUPER_ADMIN'])
  })

  it.each<[Role, boolean]>([
    ['SUPER_ADMIN', true],
    ['PROJECT_MANAGER', false],
    ['STAFF', false],
  ])('appears in the menu of %s: %s', (role, expected) => {
    const labels = menuFor(role).map((item) => item.label)

    // Untuk admin, di urutan terakhir; untuk peran lain, tidak ada.
    expect(labels.indexOf('Audit log')).toBe(expected ? labels.length - 1 : -1)
  })
})

describe('AuditLogView', () => {
  it('lists who did what to which record, and when', async () => {
    const { wrapper } = await mountLog()

    expect(wrapper.get('h1').text()).toBe('Audit log')
    const rows = wrapper.findAll('tbody tr').map((row) => row.text())
    expect(rows[0]).toContain('06 Okt 2026 10.05')
    expect(rows[0]).toContain('Dewi')
    expect(rows[0]).toContain('Menyetujui')
    expect(rows[0]).toContain('Transaksi')
    expect(rows[0]).toContain('11111111')
    expect(rows[0]).toContain('10.0.0.7')
    expect(rows[1]).toContain('Tidak dikenal')
    expect(rows[1]).toContain('Gagal masuk')
    expect(rows[2]).toContain('Membuat')
    expect(rows[2]).toContain('Akun')
  })

  it('offers nothing that changes or deletes an entry', async () => {
    const { wrapper } = await mountLog()

    const labels = wrapper.findAll('button').map((b) => `${b.text()} ${b.attributes('aria-label') ?? ''}`.toLowerCase())
    expect(labels.some((label) => /hapus|ubah|simpan|bersihkan/.test(label))).toBe(false)
  })

  it('shows an unknown action or record type as it is', async () => {
    const { wrapper } = await mountLog([makeLog({ action: 'ARCHIVE', entityType: 'invoice' })])

    const row = wrapper.get('tbody tr').text()
    expect(row).toContain('ARCHIVE')
    expect(row).toContain('invoice')
  })

  it('filters by record type, action and user, starting again from page 1', async () => {
    const { wrapper } = await mountLog()
    wrapper.findComponent(DataTable).vm.$emit('page', { page: 2, rows: 50 })
    await flushPromises()
    expect(lastParams()).toMatchObject({ page: 3, pageSize: 50 })

    await choose(wrapper, 'Jenis data', 'transaction')
    expect(lastParams()).toMatchObject({ entityType: 'transaction', page: 1 })
    await choose(wrapper, 'Tindakan', 'APPROVE')
    await choose(wrapper, 'Pengguna', 'u-sari')

    expect(lastParams()).toMatchObject({ entityType: 'transaction', action: 'APPROVE', userId: 'u-sari' })
    expect((select(wrapper, 'Pengguna').props('options') as { label: string }[]).map((o) => o.label)).toEqual([
      'Dewi',
      'Sari',
    ])
  })

  it('filters by a date range, and does not send one that runs backwards', async () => {
    const { wrapper } = await mountLog()
    const [from, to] = wrapper.findAllComponents(DateField)

    from!.vm.$emit('update:modelValue', '2026-10-01')
    to!.vm.$emit('update:modelValue', '2026-10-06')
    await flushPromises()
    expect(lastParams()).toMatchObject({ dateFrom: '2026-10-01', dateTo: '2026-10-06' })

    from!.vm.$emit('update:modelValue', '2026-10-09')
    await flushPromises()
    expect(lastParams().dateFrom).toBeUndefined()
    expect(lastParams().dateTo).toBeUndefined()
    expect(wrapper.text()).toContain('Tanggal awal tidak boleh setelah tanggal akhir')
  })

  it('clears every filter with Reset', async () => {
    const { wrapper } = await mountLog()
    await choose(wrapper, 'Tindakan', 'APPROVE')
    wrapper.findAllComponents(DateField)[0]!.vm.$emit('update:modelValue', '2026-10-01')
    await flushPromises()

    await wrapper.get('[data-testid="reset-filters"]').trigger('click')
    await flushPromises()

    expect(lastParams().action).toBeUndefined()
    expect(lastParams().dateFrom).toBeUndefined()
    expect(wrapper.findAllComponents(DateField)[0]!.props('modelValue')).toBeNull()
  })

  it('tells an empty log apart from filters that match nothing, and offers a retry on failure', async () => {
    const { wrapper } = await mountLog([])
    expect(wrapper.text()).toContain('Belum ada catatan')
    await choose(wrapper, 'Tindakan', 'VOID')
    expect(wrapper.text()).toContain('Tidak ada catatan yang cocok')

    listLogs.mockRejectedValueOnce(new ApiError(500, 'Terjadi kesalahan pada server'))
    await choose(wrapper, 'Tindakan', 'APPROVE')
    expect(wrapper.text()).toContain('Terjadi kesalahan pada server')
    listLogs.mockResolvedValue(pageOf([APPROVE]))
    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Menyetujui')
  })

  it('opens on the history of one record when the address names it', async () => {
    const { wrapper } = await mountLog([APPROVE], `/audit-log?entityType=transaction&entityId=${TX_ID}`)

    expect(listLogs).toHaveBeenCalledTimes(1)
    expect(lastParams()).toMatchObject({ entityType: 'transaction', entityId: TX_ID, page: 1 })
    expect(wrapper.get('[data-testid="record-notice"]').text()).toContain('Riwayat satu data: Transaksi 11111111')
    expect(select(wrapper, 'Jenis data').props('modelValue')).toBe('transaction')

    await wrapper.get('[data-testid="clear-record"]').trigger('click')
    await flushPromises()

    expect(lastParams().entityId).toBeUndefined()
    expect(lastParams()).toMatchObject({ entityType: 'transaction' })
    expect(wrapper.find('[data-testid="record-notice"]').exists()).toBe(false)
  })

  it.each([
    ['a record type that is not a simple word', '/audit-log?entityType=DROP%20TABLE&entityId=x'],
    ['a record id that is far too long', `/audit-log?entityId=${'x'.repeat(101)}`],
    ['repeated values', '/audit-log?entityId=a&entityId=b'],
  ])('ignores %s in the address', async (_label, path) => {
    const { wrapper } = await mountLog([APPROVE], path)

    expect(lastParams().entityId).toBeUndefined()
    expect(lastParams().entityType).toBeUndefined()
    expect(wrapper.find('[data-testid="record-notice"]').exists()).toBe(false)
  })
})

describe('AuditLogDetailDialog', () => {
  it('shows the entry and what changed, before and after', async () => {
    const { wrapper } = await mountLog()
    await openDetail(wrapper, 'l-approve')

    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.text()).toContain('06 Okt 2026 10.05')
    expect(dialog.text()).toContain('Dewi')
    expect(dialog.text()).toContain('Menyetujui')
    expect(dialog.text()).toContain(TX_ID)
    expect(dialog.text()).toContain('10.0.0.7')
    const changes = dialog.findAll('[data-testid="change-row"]').map((row) => row.findAll('td').map((td) => td.text()))
    expect(changes).toEqual([
      ['reviewed_by_id', '-', 'u-dewi'],
      ['status', 'PENDING', 'APPROVED'],
    ])
  })

  it('links a transaction entry to the transaction, and nothing else', async () => {
    const { wrapper } = await mountLog()
    await openDetail(wrapper, 'l-approve')
    expect(wrapper.get('[role="dialog"] a').attributes('href')).toBe(`/transaksi/${TX_ID}`)

    wrapper.findComponent({ name: 'Dialog' }).vm.$emit('update:visible', false)
    await flushPromises()
    await openDetail(wrapper, 'l-account')
    expect(wrapper.get('[role="dialog"]').find('a').exists()).toBe(false)
  })

  it('lists the values of a new record, with amounts as rupiah', async () => {
    const { wrapper } = await mountLog()
    await openDetail(wrapper, 'l-account')

    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.text()).toContain('Data baru')
    const changes = dialog.findAll('[data-testid="change-row"]').map((row) => row.findAll('td').map((td) => td.text()))
    expect(changes).toEqual([
      ['is_active', '-', 'Ya'],
      ['name', '-', 'Kas Kecil'],
      ['opening_balance', '-', 'Rp 500.000'],
    ])
  })

  it('does not call an entry a new record unless it created one', async () => {
    const failed = makeLog({ id: 'l-gagal', action: 'LOGIN_FAILED', entityType: 'user', before: null, after: { email: 'siapa@example.com' } })
    const { wrapper } = await mountLog([failed])
    await openDetail(wrapper, 'l-gagal')

    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.text()).not.toContain('Data baru')
    expect(dialog.text()).toContain('Rincian')
    expect(dialog.text()).toContain('siapa@example.com')
  })

  it('says so when an entry recorded no details', async () => {
    const { wrapper } = await mountLog()
    await openDetail(wrapper, 'l-login')

    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.text()).toContain('Tidak ada rincian perubahan')
    expect(dialog.text()).toContain('Tidak dikenal')
    expect(dialog.find('[data-testid="change-row"]').exists()).toBe(false)
  })

  it('shows hostile, long and nested values as plain, bounded text', async () => {
    const hostile = '<img src=x onerror="window.dibajak = true">'
    const { wrapper } = await mountLog([
      makeLog({
        before: null,
        after: { description: hostile, note: 'x'.repeat(5000), filters: { status: 'PENDING' } },
      }),
    ])
    await openDetail(wrapper, 'l-approve')

    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.text()).toContain(hostile)
    expect(dialog.find('img').exists()).toBe(false)
    expect((window as unknown as { dibajak?: boolean }).dibajak).toBeUndefined()
    expect(dialog.text()).toContain('{"status":"PENDING"}')
    const note = dialog.findAll('[data-testid="change-row"]').find((row) => row.text().startsWith('note'))!
    expect(note.findAll('td')[2]!.text()).toHaveLength(2001)
  })
})
