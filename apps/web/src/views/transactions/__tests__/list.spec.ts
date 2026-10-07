import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import DataTable from 'primevue/datatable'
import DatePicker from 'primevue/datepicker'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import * as accountsApi from '@/api/accounts'
import * as categoriesApi from '@/api/categories'
import { ApiError } from '@/api/http'
import * as projectsApi from '@/api/projects'
import * as transactionsApi from '@/api/transactions'
import type { Role, Transaction } from '@/api/types'
import DateField from '@/components/DateField.vue'
import { useTransactionOptions } from '@/composables/useTransactionOptions'
import { fill, freshPinia, mountView } from '@/test/mount'
import { signInAs } from '@/test/session'
import {
  BANK,
  KAFE,
  KAS,
  makeTransaction,
  MATERIAL,
  pageOf,
  RUMAH,
  TERMIN,
  TRANSFER_KELUAR,
  UPAH,
} from '@/test/transactions'
import TransactionFormDialog from '../TransactionFormDialog.vue'
import TransactionsView from '../TransactionsView.vue'
import TransactionTable from '../TransactionTable.vue'

vi.mock('@/api/transactions')
vi.mock('@/api/accounts')
vi.mock('@/api/projects')
vi.mock('@/api/categories')

const SEMEN = makeTransaction()
const TERMIN_MASUK = makeTransaction({
  id: 't-termin',
  type: 'IN',
  amount: '5000000',
  description: 'Termin pertama',
  status: 'APPROVED',
  category: TERMIN,
  account: BANK,
  createdBy: { id: 'u-admin', name: 'Dewi' },
})
const LISTRIK = makeTransaction({ id: 't-listrik', description: 'Listrik kantor', project: null })
const TRANSFER = makeTransaction({
  id: 't-transfer',
  description: 'Isi kas kecil',
  status: 'APPROVED',
  project: null,
  isTransfer: true,
  transferGroupId: 'g1',
  category: TRANSFER_KELUAR,
})

function stubOptions(): void {
  vi.mocked(accountsApi.listAccountOptions).mockResolvedValue([KAS, BANK])
  vi.mocked(projectsApi.listProjectOptions).mockResolvedValue([RUMAH, KAFE])
  vi.mocked(categoriesApi.listCategories).mockResolvedValue([MATERIAL, UPAH, TERMIN, TRANSFER_KELUAR])
}

function lastListParams() {
  const calls = vi.mocked(transactionsApi.listTransactions).mock.calls
  return calls[calls.length - 1]![0]
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

function optionLabels(wrapper: VueWrapper, label: string): string[] {
  return (select(wrapper, label).props('options') as { label: string }[]).map((o) => o.label)
}

async function pickDates(wrapper: VueWrapper, from: string | null, to: string | null): Promise<void> {
  const [fromField, toField] = wrapper.findAllComponents(DateField)
  fromField!.vm.$emit('update:modelValue', from)
  toField!.vm.$emit('update:modelValue', to)
  await flushPromises()
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
  stubOptions()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TransactionsView', () => {
  async function mountList(role: Role, rows: Transaction[] = [SEMEN, TERMIN_MASUK, LISTRIK, TRANSFER]) {
    signInAs(role)
    vi.mocked(transactionsApi.listTransactions).mockResolvedValue(pageOf(rows))
    return mountView(TransactionsView, { path: '/transaksi', withOverlays: true })
  }

  it('lists transactions with date, description, category, project, account, amount, status and creator', async () => {
    const { wrapper } = await mountList('SUPER_ADMIN')

    const rows = wrapper.findAll('tbody tr').map((row) => row.text())
    expect(rows[0]).toContain('01 Okt 2026')
    expect(rows[0]).toContain('Beli semen')
    expect(rows[0]).toContain('Material')
    expect(rows[0]).toContain('PRJ-2026-001')
    expect(rows[0]).toContain('Rumah Pak Budi')
    expect(rows[0]).toContain('Kas Kecil')
    expect(rows[0]).toContain('-Rp 150.000')
    expect(rows[0]).toContain('Menunggu')
    expect(rows[0]).toContain('Sari')
    expect(rows[1]).toContain('+Rp 5.000.000')
    expect(rows[1]).toContain('Disetujui')
    expect(rows[2]).toContain('Overhead')
  })

  it('marks a transfer leg as a transfer instead of naming a project', async () => {
    const { wrapper } = await mountList('SUPER_ADMIN', [TRANSFER])

    const row = wrapper.get('tbody tr').text()
    expect(row).toContain('Transfer')
    expect(row).not.toContain('Overhead')
  })

  it('links each row to its detail page', async () => {
    const { wrapper } = await mountList('SUPER_ADMIN')

    const links = wrapper.findAll('tbody a').map((a) => a.attributes('href'))

    expect(links).toContain('/transaksi/t-semen')
    expect(links).toContain('/transaksi/t-termin')
  })

  it('marks the rows the user may review', async () => {
    const waiting = makeTransaction({ permissions: { canReview: true } })
    const { wrapper } = await mountList('PROJECT_MANAGER', [waiting, TERMIN_MASUK])

    const rows = wrapper.findAll('tbody tr').map((row) => row.text())
    expect(rows[0]).toContain('Perlu ditinjau')
    expect(rows[1]).not.toContain('Perlu ditinjau')
  })

  it('shows only counted amounts in colour', async () => {
    const { wrapper } = await mountList('SUPER_ADMIN', [SEMEN, TERMIN_MASUK])

    const amounts = wrapper.findAll('tbody [title="Belum dihitung dalam saldo"]')
    expect(amounts.map((a) => a.text())).toEqual(['-Rp 150.000'])
  })

  it('filters by type, status, account, category and project, starting again from page 1', async () => {
    const { wrapper } = await mountList('SUPER_ADMIN')
    wrapper.findComponent(DataTable).vm.$emit('page', { page: 2, rows: 50 })
    await flushPromises()
    expect(lastListParams()).toMatchObject({ page: 3, pageSize: 50 })

    await choose(wrapper, 'Status', 'PENDING')
    expect(lastListParams()).toMatchObject({ status: 'PENDING', page: 1 })

    await choose(wrapper, 'Tipe', 'OUT')
    await choose(wrapper, 'Akun', KAS.id)
    await choose(wrapper, 'Kategori', MATERIAL.id)
    await choose(wrapper, 'Proyek', RUMAH.id)
    expect(lastListParams()).toMatchObject({
      status: 'PENDING',
      type: 'OUT',
      accountId: KAS.id,
      categoryId: MATERIAL.id,
      projectId: RUMAH.id,
    })
    expect(lastListParams().overhead).toBeUndefined()
  })

  it('offers only the categories of the chosen type, never system ones, and drops a category that no longer fits', async () => {
    const { wrapper } = await mountList('SUPER_ADMIN')
    expect(optionLabels(wrapper, 'Kategori')).toEqual(['Material', 'Upah Tukang', 'Termin Klien'])

    await choose(wrapper, 'Kategori', MATERIAL.id)
    await choose(wrapper, 'Tipe', 'IN')

    expect(optionLabels(wrapper, 'Kategori')).toEqual(['Termin Klien'])
    expect(lastListParams()).toMatchObject({ type: 'IN' })
    expect(lastListParams().categoryId).toBeUndefined()
  })

  it('filters overhead as transactions without a project', async () => {
    const { wrapper } = await mountList('SUPER_ADMIN')
    expect(optionLabels(wrapper, 'Proyek')[0]).toBe('Overhead (tanpa proyek)')

    await choose(wrapper, 'Proyek', RUMAH.id)
    await choose(wrapper, 'Proyek', 'overhead')

    expect(lastListParams()).toMatchObject({ overhead: true })
    expect(lastListParams().projectId).toBeUndefined()
  })

  it('searches after a pause', async () => {
    const { wrapper } = await mountList('SUPER_ADMIN')

    vi.useFakeTimers()
    await fill(wrapper, '#transaction-search', ' semen ')
    await vi.advanceTimersByTimeAsync(300)

    expect(lastListParams()).toMatchObject({ search: 'semen', page: 1 })
  })

  it('filters by a date range, and does not send a range that runs backwards', async () => {
    const { wrapper } = await mountList('SUPER_ADMIN')

    await pickDates(wrapper, '2026-10-01', '2026-10-31')
    expect(lastListParams()).toMatchObject({ dateFrom: '2026-10-01', dateTo: '2026-10-31' })
    expect(wrapper.text()).not.toContain('Tanggal awal tidak boleh setelah tanggal akhir')

    await pickDates(wrapper, '2026-11-05', '2026-10-31')
    expect(lastListParams().dateFrom).toBeUndefined()
    expect(lastListParams().dateTo).toBeUndefined()
    expect(wrapper.text()).toContain('Tanggal awal tidak boleh setelah tanggal akhir')
  })

  it('names the two date filters, for the eye and for a screen reader', async () => {
    const { wrapper } = await mountList('SUPER_ADMIN')

    const pickers = wrapper.findAllComponents(DatePicker)
    expect(pickers.map((p) => p.props('ariaLabel'))).toEqual(['Dari tanggal', 'Sampai tanggal'])
    expect(pickers.map((p) => p.props('placeholder'))).toEqual(['Dari tanggal', 'Sampai tanggal'])
  })

  it('clears every filter with Reset', async () => {
    const { wrapper } = await mountList('SUPER_ADMIN')
    await choose(wrapper, 'Status', 'PENDING')
    await pickDates(wrapper, '2026-10-01', null)

    await wrapper.get('[data-testid="reset-filters"]').trigger('click')
    await flushPromises()

    const params = lastListParams()
    expect(params.status).toBeUndefined()
    expect(params.dateFrom).toBeUndefined()
    expect(select(wrapper, 'Status').props('modelValue')).toBeUndefined()
  })

  it('tells an empty list apart from filters that match nothing', async () => {
    const { wrapper } = await mountList('STAFF', [])
    expect(wrapper.text()).toContain('Belum ada transaksi')

    await choose(wrapper, 'Status', 'VOID')
    expect(wrapper.text()).toContain('Tidak ada transaksi yang cocok')
  })

  it('shows an error with a retry when the list cannot be loaded', async () => {
    signInAs('STAFF')
    vi.mocked(transactionsApi.listTransactions).mockRejectedValueOnce(new ApiError(500, 'Terjadi kesalahan pada server'))
    const { wrapper } = await mountView(TransactionsView, { path: '/transaksi', withOverlays: true })
    expect(wrapper.text()).toContain('Terjadi kesalahan pada server')

    vi.mocked(transactionsApi.listTransactions).mockResolvedValue(pageOf([SEMEN]))
    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Beli semen')
  })

  it('gives an admin both actions and a switch that hides transfers', async () => {
    const { wrapper } = await mountList('SUPER_ADMIN')

    expect(wrapper.get('h1').text()).toBe('Transaksi')
    expect(wrapper.find('[data-testid="add-transaction"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="add-transfer"]').exists()).toBe(true)
    expect(lastListParams().includeTransfers).toBeUndefined()

    wrapper.findComponent(ToggleSwitch).vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(lastListParams()).toMatchObject({ includeTransfers: false, page: 1 })

    wrapper.findComponent(ToggleSwitch).vm.$emit('update:modelValue', true)
    await flushPromises()
    expect(lastListParams().includeTransfers).toBeUndefined()
  })

  it('opens the form from "Catat transaksi" and reloads the list after a save', async () => {
    const { wrapper } = await mountList('STAFF')

    await wrapper.get('[data-testid="add-transaction"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('#tx-amount').exists()).toBe(true)

    vi.mocked(transactionsApi.listTransactions).mockClear()
    wrapper.findComponent(TransactionFormDialog).vm.$emit('saved', SEMEN)
    await flushPromises()
    expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1)
  })

  it('offers a project manager no transfer controls and no overhead filter', async () => {
    const { wrapper } = await mountList('PROJECT_MANAGER')

    expect(wrapper.get('h1').text()).toBe('Transaksi')
    expect(wrapper.find('[data-testid="add-transaction"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="add-transfer"]').exists()).toBe(false)
    expect(wrapper.findComponent(ToggleSwitch).exists()).toBe(false)
    expect(optionLabels(wrapper, 'Proyek')).toEqual(['PRJ-2026-001 · Rumah Pak Budi', 'PRJ-2026-002 · Interior Kafe'])
  })

  it('shows staff their own transactions, without a creator column or transfer controls', async () => {
    const { wrapper } = await mountList('STAFF')

    expect(wrapper.get('h1').text()).toBe('Transaksi Saya')
    expect(wrapper.find('[data-testid="add-transfer"]').exists()).toBe(false)
    expect(wrapper.findComponent(ToggleSwitch).exists()).toBe(false)
    const headers = wrapper.findAll('thead th').map((th) => th.text())
    expect(headers).not.toContain('Dicatat oleh')
    expect(headers).toContain('Proyek')
  })

  it('offers a reload when the filter choices cannot be loaded, and still lists transactions', async () => {
    vi.mocked(accountsApi.listAccountOptions).mockRejectedValueOnce(new ApiError(0, 'Tidak dapat terhubung ke server'))
    const { wrapper } = await mountList('SUPER_ADMIN')
    expect(wrapper.text()).toContain('Beli semen')
    expect(optionLabels(wrapper, 'Akun')).toEqual([])

    await wrapper.get('[data-testid="reload-options"]').trigger('click')
    await flushPromises()

    expect(optionLabels(wrapper, 'Akun')).toEqual(['Kas Kecil', 'Bank Utama'])
    expect(wrapper.find('[data-testid="reload-options"]').exists()).toBe(false)
  })
})

describe('TransactionTable', () => {
  it('keeps to its scope, which does not count as a filter', async () => {
    signInAs('PROJECT_MANAGER')
    vi.mocked(transactionsApi.listTransactions).mockResolvedValue(pageOf([]))

    const { wrapper } = await mountView(TransactionTable, {
      props: { scope: { projectId: RUMAH.id }, showProject: false },
    })

    expect(lastListParams()).toMatchObject({ projectId: RUMAH.id, page: 1 })
    expect(wrapper.text()).toContain('Belum ada transaksi')
    expect(wrapper.findAll('thead th').map((th) => th.text())).not.toContain('Proyek')
  })

  it('loads again when its scope changes', async () => {
    signInAs('PROJECT_MANAGER')
    vi.mocked(transactionsApi.listTransactions).mockResolvedValue(pageOf([SEMEN]))
    const { wrapper } = await mountView(TransactionTable, { props: { scope: { projectId: RUMAH.id } } })

    await wrapper.setProps({ scope: { projectId: KAFE.id } })
    await flushPromises()

    expect(lastListParams()).toMatchObject({ projectId: KAFE.id })
  })
})

describe('useTransactionOptions', () => {
  it('loads accounts, projects and usable categories once, and narrows categories by type', async () => {
    const options = useTransactionOptions()
    await flushPromises()

    expect(options.accounts.value).toEqual([KAS, BANK])
    expect(options.projects.value).toEqual([RUMAH, KAFE])
    expect(options.categories.value).toEqual([MATERIAL, UPAH, TERMIN])
    expect(options.categoriesFor('OUT')).toEqual([MATERIAL, UPAH])
    expect(options.categoriesFor('IN')).toEqual([TERMIN])
    expect(options.categoriesFor(null)).toEqual([MATERIAL, UPAH, TERMIN])
    expect(categoriesApi.listCategories).toHaveBeenCalledExactlyOnceWith({ isActive: true })
    expect(accountsApi.listAccountOptions).toHaveBeenCalledTimes(1)
  })

  it('reports a failed load and can try again', async () => {
    vi.mocked(projectsApi.listProjectOptions).mockRejectedValueOnce(new ApiError(500, 'Terjadi kesalahan pada server'))
    const options = useTransactionOptions()
    await flushPromises()

    expect(options.error.value).toBe('Terjadi kesalahan pada server')
    expect(options.accounts.value).toEqual([])

    await options.reload()

    expect(options.error.value).toBeNull()
    expect(options.projects.value).toEqual([RUMAH, KAFE])
  })
})
