import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { ApiError } from '@/api/http'
import * as reportsApi from '@/api/reports'
import type { CompanyDashboard } from '@/api/types'
import BarList from '@/components/BarList.vue'
import DateField from '@/components/DateField.vue'
import MonthlyCashflowChart from '@/components/MonthlyCashflowChart.vue'
import { PERIOD_PRESETS } from '@/lib/periods'
import { routes } from '@/router/routes'
import { freshPinia, mountView } from '@/test/mount'
import { signInAs } from '@/test/session'
import { makeTransaction } from '@/test/transactions'
import DashboardView from '../DashboardView.vue'

vi.mock('@/api/reports')
vi.mock('@/lib/calendar', () => ({ todayInJakarta: () => '2026-10-07' }))

const getDashboard = vi.mocked(reportsApi.getCompanyDashboard)

function makeDashboard(overrides: Partial<CompanyDashboard> = {}): CompanyDashboard {
  return {
    period: { from: '2025-11-01', to: '2026-10-07' },
    accounts: [
      { id: 'a-bank', name: 'Bank Utama', type: 'BANK', isActive: true, balance: '14500000' },
      { id: 'a-kas', name: 'Kas Kecil', type: 'CASH', isActive: true, balance: '-500000' },
      { id: 'a-lama', name: 'Kas Lama', type: 'CASH', isActive: false, balance: '0' },
    ],
    totalBalance: '14000000',
    totals: { income: '55000000', expense: '51500000', net: '3500000' },
    monthly: [
      { month: '2026-09', income: '0', expense: '31000000', net: '-31000000' },
      { month: '2026-10', income: '25000000', expense: '3500000', net: '21500000' },
    ],
    expenseByCategory: [
      { categoryId: 'c1', name: 'Material', amount: '40000000' },
      { categoryId: 'c2', name: 'Upah', amount: '7000000' },
    ],
    expenseByScope: { overhead: '4500000', project: '47000000' },
    recentTransactions: [
      makeTransaction(),
      makeTransaction({ id: 't-listrik', description: 'Listrik kantor', project: null, status: 'APPROVED' }),
      makeTransaction({ id: 't-pindah', description: 'Isi kas kecil', project: null, isTransfer: true }),
    ],
    pendingCount: 3,
    ...overrides,
  }
}

const EMPTY = makeDashboard({
  accounts: [],
  totalBalance: '0',
  totals: { income: '0', expense: '0', net: '0' },
  monthly: [{ month: '2026-10', income: '0', expense: '0', net: '0' }],
  expenseByCategory: [],
  expenseByScope: { overhead: '0', project: '0' },
  recentTransactions: [],
  pendingCount: 0,
})

async function mountDashboard(first: CompanyDashboard = makeDashboard()) {
  signInAs('SUPER_ADMIN')
  getDashboard.mockResolvedValue(first)
  return mountView(DashboardView, { path: '/dashboard', withOverlays: true })
}

function stat(wrapper: VueWrapper, id: string): string {
  return wrapper.get(`[data-testid="stat-${id}"]`).text()
}

async function preset(wrapper: VueWrapper, id: string): Promise<void> {
  await wrapper.get(`[data-testid="preset-${id}"]`).trigger('click')
  await flushPromises()
}

async function pickDates(wrapper: VueWrapper, from: string | null, to: string | null): Promise<void> {
  const [fromField, toField] = wrapper.findAllComponents(DateField)
  // Satu per satu, seperti orang memilih tanggal: yang kedua melihat hasil yang pertama.
  if (from !== null) fromField!.vm.$emit('update:modelValue', from)
  await flushPromises()
  if (to !== null) toField!.vm.$emit('update:modelValue', to)
  await flushPromises()
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
})

describe('period presets', () => {
  it('cover the last twelve months, this month and this year', () => {
    const ranges = Object.fromEntries(PERIOD_PRESETS.map((p) => [p.id, p.range('2026-10-07')]))

    expect(ranges).toEqual({
      last12: {},
      thisMonth: { from: '2026-10-01', to: '2026-10-07' },
      thisYear: { from: '2026-01-01', to: '2026-10-07' },
    })
    expect(PERIOD_PRESETS.map((p) => p.label)).toEqual(['12 bulan terakhir', 'Bulan ini', 'Tahun ini'])
  })
})

describe('DashboardView', () => {
  it('is the page behind /dashboard', async () => {
    const route = routes.find((r) => r.path === '/dashboard')!
    const loaded = await (route.component as () => Promise<{ default: unknown }>)()

    expect(loaded.default).toBe(DashboardView)
    expect(route.meta?.roles).toEqual(['SUPER_ADMIN'])
  })

  it('asks for the default period and shows what it covers', async () => {
    const { wrapper } = await mountDashboard()

    expect(getDashboard).toHaveBeenCalledExactlyOnceWith({})
    expect(wrapper.get('h1').text()).toBe('Dashboard')
    expect(wrapper.get('[data-testid="period-covered"]').text()).toBe('01 Nov 2025 – 07 Okt 2026')
    const [from, to] = wrapper.findAllComponents(DateField)
    expect([from!.props('modelValue'), to!.props('modelValue')]).toEqual(['2025-11-01', '2026-10-07'])
    expect(wrapper.get('[data-testid="preset-last12"]').attributes('aria-pressed')).toBe('true')
  })

  it('shows the totals, with income and expense in their colours', async () => {
    const { wrapper } = await mountDashboard()

    expect(stat(wrapper, 'balance')).toContain('Rp 14.000.000')
    expect(stat(wrapper, 'income')).toContain('Rp 55.000.000')
    expect(stat(wrapper, 'expense')).toContain('Rp 51.500.000')
    expect(stat(wrapper, 'net')).toContain('Rp 3.500.000')
  })

  it('shows a net outflow in red with its minus sign', async () => {
    const { wrapper } = await mountDashboard(
      makeDashboard({ totals: { income: '1000', expense: '5000', net: '-4000' } }),
    )

    const net = wrapper.get('[data-testid="stat-net"]')
    expect(net.text()).toContain('-Rp 4.000')
    expect(net.find('.text-red-600').exists()).toBe(true)
  })

  it('lists each account with its balance, marking negative and inactive ones', async () => {
    const { wrapper } = await mountDashboard()

    const rows = wrapper.findAll('[data-testid="account-row"]')
    expect(rows.map((row) => row.text())).toEqual([
      expect.stringContaining('Bank Utama'),
      expect.stringContaining('Kas Kecil'),
      expect.stringContaining('Nonaktif'),
    ])
    expect(rows[0]!.text()).toContain('Rp 14.500.000')
    expect(rows[0]!.text()).toContain('Bank')
    expect(rows[1]!.text()).toContain('-Rp 500.000')
    expect(rows[1]!.find('.text-red-600').exists()).toBe(true)
    expect(rows[0]!.text()).not.toContain('Nonaktif')
  })

  it('passes the months to the chart and the categories and scopes to bar lists', async () => {
    const dashboard = makeDashboard()
    const { wrapper } = await mountDashboard(dashboard)

    expect(wrapper.findComponent(MonthlyCashflowChart).props('months')).toEqual(dashboard.monthly)
    const [categories, scopes] = wrapper.findAllComponents(BarList)
    expect(categories!.props('items')).toEqual([
      { id: 'c1', name: 'Material', amount: '40000000' },
      { id: 'c2', name: 'Upah', amount: '7000000' },
    ])
    expect(scopes!.props('items')).toEqual([
      { id: 'overhead', name: 'Overhead (tanpa proyek)', amount: '4500000' },
      { id: 'project', name: 'Proyek', amount: '47000000' },
    ])
  })

  it('links the waiting count to the pending transactions', async () => {
    const { wrapper } = await mountDashboard()

    const link = wrapper.get('[data-testid="pending-link"]')
    expect(link.text()).toContain('3 transaksi menunggu ditinjau')
    expect(link.attributes('href')).toBe('/transaksi?status=PENDING')
  })

  it('says nothing is waiting, without a link, when the count is zero', async () => {
    const { wrapper } = await mountDashboard(makeDashboard({ pendingCount: 0 }))

    expect(wrapper.find('[data-testid="pending-link"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Tidak ada transaksi yang menunggu')
  })

  it('lists the recent transactions with links, where they belong, amount and status', async () => {
    const { wrapper } = await mountDashboard()

    const rows = wrapper.findAll('[data-testid="recent-row"]')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.text()).toContain('01 Okt 2026')
    expect(rows[0]!.get('a').text()).toBe('Beli semen')
    expect(rows[0]!.get('a').attributes('href')).toBe('/transaksi/t-semen')
    expect(rows[0]!.text()).toContain('PRJ-2026-001 · Rumah Pak Budi')
    expect(rows[0]!.text()).toContain('-Rp 150.000')
    expect(rows[0]!.text()).toContain('Menunggu')
    expect(rows[0]!.find('[title="Belum dihitung dalam saldo"]').exists()).toBe(true)
    expect(rows[1]!.text()).toContain('Overhead')
    expect(rows[1]!.find('[title="Belum dihitung dalam saldo"]').exists()).toBe(false)
    expect(rows[2]!.text()).toContain('Transfer')
  })

  it('shows zeros and short notes for a company with nothing yet', async () => {
    const { wrapper } = await mountDashboard(EMPTY)

    expect(stat(wrapper, 'balance')).toContain('Rp 0')
    expect(stat(wrapper, 'net')).toContain('Rp 0')
    const text = wrapper.text()
    expect(text).toContain('Belum ada akun')
    expect(text).toContain('Belum ada transaksi yang disetujui pada periode ini')
    expect(text).toContain('Belum ada pengeluaran pada periode ini')
    expect(text).toContain('Belum ada transaksi')
    expect(text).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('shows an error with a retry when the first load fails', async () => {
    signInAs('SUPER_ADMIN')
    getDashboard.mockRejectedValueOnce(new ApiError(500, 'Terjadi kesalahan pada server'))
    const { wrapper } = await mountView(DashboardView, { path: '/dashboard', withOverlays: true })
    expect(wrapper.text()).toContain('Terjadi kesalahan pada server')

    getDashboard.mockResolvedValue(makeDashboard())
    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()

    expect(stat(wrapper, 'income')).toContain('Rp 55.000.000')
  })
})

describe('DashboardView: changing the period', () => {
  const OCTOBER = makeDashboard({
    period: { from: '2026-10-01', to: '2026-10-07' },
    totals: { income: '25000000', expense: '3500000', net: '21500000' },
  })

  it('asks for a preset period and shows its figures', async () => {
    const { wrapper } = await mountDashboard()
    getDashboard.mockResolvedValue(OCTOBER)

    await preset(wrapper, 'thisMonth')

    expect(getDashboard).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-07' })
    expect(stat(wrapper, 'income')).toContain('Rp 25.000.000')
    expect(wrapper.get('[data-testid="period-covered"]').text()).toBe('01 Okt 2026 – 07 Okt 2026')
    expect(wrapper.get('[data-testid="preset-thisMonth"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="preset-last12"]').attributes('aria-pressed')).toBe('false')
  })

  it('asks for the dates that were picked', async () => {
    const { wrapper } = await mountDashboard()

    await pickDates(wrapper, '2026-08-01', null)
    expect(getDashboard).toHaveBeenLastCalledWith({ from: '2026-08-01' })

    await pickDates(wrapper, null, '2026-08-31')
    expect(getDashboard).toHaveBeenLastCalledWith({ from: '2026-08-01', to: '2026-08-31' })
  })

  it('keeps the old figures on screen, marked busy, while the new ones load', async () => {
    const { wrapper } = await mountDashboard()
    let finish!: (dashboard: CompanyDashboard) => void
    getDashboard.mockReturnValue(new Promise((resolve) => (finish = resolve)))

    await preset(wrapper, 'thisMonth')

    expect(stat(wrapper, 'income')).toContain('Rp 55.000.000')
    expect(wrapper.get('[data-testid="figures"]').attributes('aria-busy')).toBe('true')

    finish(OCTOBER)
    await flushPromises()
    expect(wrapper.get('[data-testid="figures"]').attributes('aria-busy')).toBe('false')
  })

  it('catches a period that runs backwards without asking the server', async () => {
    const { wrapper } = await mountDashboard()
    getDashboard.mockClear()

    await pickDates(wrapper, '2026-10-05', '2026-10-01')

    expect(wrapper.get('#period-from-error').text()).toBe('Tanggal awal tidak boleh setelah tanggal akhir')
    expect(getDashboard).toHaveBeenCalledTimes(1)
    expect(getDashboard).toHaveBeenLastCalledWith({ from: '2026-10-05' })
    expect(stat(wrapper, 'income')).toContain('Rp 55.000.000')

    getDashboard.mockResolvedValue(OCTOBER)
    await pickDates(wrapper, '2026-10-01', '2026-10-07')
    expect(wrapper.find('#period-from-error').exists()).toBe(false)
    expect(stat(wrapper, 'income')).toContain('Rp 25.000.000')
  })

  it('shows the server’s objection under the field it names, keeping the last good figures', async () => {
    const { wrapper } = await mountDashboard()
    getDashboard.mockRejectedValue(
      new ApiError(400, 'Validasi gagal', [{ field: 'to', messages: ['Rentang paling lama 60 bulan'] }]),
    )

    await pickDates(wrapper, '2020-01-01', null)

    expect(wrapper.get('#period-to-error').text()).toBe('Rentang paling lama 60 bulan')
    expect(stat(wrapper, 'income')).toContain('Rp 55.000.000')
    expect(wrapper.find('[data-testid="retry"]').exists()).toBe(false)

    getDashboard.mockResolvedValue(OCTOBER)
    await preset(wrapper, 'thisMonth')
    expect(wrapper.find('#period-to-error').exists()).toBe(false)
  })

  it('says so when a later load fails for another reason, and can try again', async () => {
    const { wrapper } = await mountDashboard()
    getDashboard.mockRejectedValueOnce(new ApiError(0, 'Tidak dapat terhubung ke server'))

    await preset(wrapper, 'thisMonth')
    expect(wrapper.text()).toContain('Data terbaru gagal dimuat: Tidak dapat terhubung ke server')
    expect(stat(wrapper, 'income')).toContain('Rp 55.000.000')

    getDashboard.mockResolvedValue(OCTOBER)
    await wrapper.get('[data-testid="retry-reload"]').trigger('click')
    await flushPromises()

    expect(stat(wrapper, 'income')).toContain('Rp 25.000.000')
    expect(wrapper.text()).not.toContain('Data terbaru gagal dimuat')
  })

  it('shows only the answer to the latest request', async () => {
    const { wrapper } = await mountDashboard()
    const pending: ((dashboard: CompanyDashboard) => void)[] = []
    getDashboard.mockImplementation(() => new Promise((resolve) => pending.push(resolve)))
    const YEAR = makeDashboard({
      period: { from: '2026-01-01', to: '2026-10-07' },
      totals: { income: '99000000', expense: '1', net: '98999999' },
    })

    await preset(wrapper, 'thisMonth')
    await preset(wrapper, 'thisYear')
    pending[1]!(YEAR)
    await flushPromises()
    pending[0]!(OCTOBER)
    await flushPromises()

    expect(stat(wrapper, 'income')).toContain('Rp 99.000.000')
    expect(wrapper.get('[data-testid="period-covered"]').text()).toBe('01 Jan 2026 – 07 Okt 2026')
  })
})
