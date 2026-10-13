import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import DataTable from 'primevue/datatable'
import DatePicker from 'primevue/datepicker'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import * as accountsApi from '@/api/accounts'
import * as categoriesApi from '@/api/categories'
import { ApiError, type DownloadedFile } from '@/api/http'
import * as transactionsApi from '@/api/transactions'
import type { Transaction } from '@/api/types'
import DateField from '@/components/DateField.vue'
import { useTransactionOptions } from '@/composables/useTransactionOptions'
import * as download from '@/lib/download'
import { fill, freshPinia, mountView } from '@/test/mount'
import { signIn } from '@/test/session'
import {
  BANK,
  KAS,
  makeTransaction,
  MATERIAL,
  pageOf,
  TERMIN,
  TRANSFER_KELUAR,
  UPAH,
} from '@/test/transactions'
import TransactionFormDialog from '../TransactionFormDialog.vue'
import TransactionsView from '../TransactionsView.vue'
import TransactionTable from '../TransactionTable.vue'

vi.mock('@/api/transactions')
vi.mock('@/api/accounts')
vi.mock('@/api/categories')
vi.mock('@/lib/download')

const SEMEN = makeTransaction({ status: 'VOID' })
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
const LISTRIK = makeTransaction({ id: 't-listrik', description: 'Listrik kantor' })
const TRANSFER = makeTransaction({
  id: 't-transfer',
  description: 'Isi kas kecil',
  status: 'APPROVED',
  isTransfer: true,
  transferGroupId: 'g1',
  category: TRANSFER_KELUAR,
})

function stubOptions(): void {
  vi.mocked(accountsApi.listAccountOptions).mockResolvedValue([KAS, BANK])
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
  async function mountList(
    rows: Transaction[] = [SEMEN, TERMIN_MASUK, LISTRIK, TRANSFER],
    path = '/transaksi',
  ) {
    signIn()
    vi.mocked(transactionsApi.listTransactions).mockResolvedValue(pageOf(rows))
    return mountView(TransactionsView, { path, withOverlays: true })
  }

  it('lists transactions with date, description, category, account, amount and status', async () => {
    const { wrapper } = await mountList()

    const rows = wrapper.findAll('tbody tr').map((row) => row.text())
    expect(rows[0]).toContain('01 Okt 2026')
    expect(rows[0]).toContain('Beli semen')
    expect(rows[0]).toContain('Material')
    expect(rows[0]).toContain('Kas Kecil')
    expect(rows[0]).toContain('-Rp 150.000')
    expect(rows[0]).toContain('Dibatalkan')
    expect(rows[1]).toContain('+Rp 5.000.000')
    expect(rows[1]).toContain('Tercatat')
    expect(rows[2]).toContain('Listrik kantor')
  })

  it('marks a transfer leg as a transfer', async () => {
    const { wrapper } = await mountList([TRANSFER])

    const row = wrapper.get('tbody tr').text()
    expect(row).toContain('Transfer')
  })

  it('links each row to its detail page', async () => {
    const { wrapper } = await mountList()

    const links = wrapper.findAll('tbody a').map((a) => a.attributes('href'))

    expect(links).toContain('/transaksi/t-semen')
    expect(links).toContain('/transaksi/t-termin')
  })

  it('shows only counted amounts in colour', async () => {
    const { wrapper } = await mountList([SEMEN, TERMIN_MASUK])

    const amounts = wrapper.findAll('tbody [title="Belum dihitung dalam saldo"]')
    expect(amounts.map((a) => a.text())).toEqual(['-Rp 150.000'])
  })

  it('filters by type, status, account and category, starting again from page 1', async () => {
    const { wrapper } = await mountList()
    wrapper.findComponent(DataTable).vm.$emit('page', { page: 2, rows: 50 })
    await flushPromises()
    expect(lastListParams()).toMatchObject({ page: 3, pageSize: 50 })

    await choose(wrapper, 'Status', 'VOID')
    expect(lastListParams()).toMatchObject({ status: 'VOID', page: 1 })

    await choose(wrapper, 'Tipe', 'OUT')
    await choose(wrapper, 'Akun', KAS.id)
    await choose(wrapper, 'Kategori', MATERIAL.id)
    expect(lastListParams()).toMatchObject({
      status: 'VOID',
      type: 'OUT',
      accountId: KAS.id,
      categoryId: MATERIAL.id,
    })
  })

  it('offers only the categories of the chosen type, never system ones, and drops a category that no longer fits', async () => {
    const { wrapper } = await mountList()
    expect(optionLabels(wrapper, 'Kategori')).toEqual(['Material', 'Upah Tukang', 'Termin Klien'])

    await choose(wrapper, 'Kategori', MATERIAL.id)
    await choose(wrapper, 'Tipe', 'IN')

    expect(optionLabels(wrapper, 'Kategori')).toEqual(['Termin Klien'])
    expect(lastListParams()).toMatchObject({ type: 'IN' })
    expect(lastListParams().categoryId).toBeUndefined()
  })

  it('searches after a pause', async () => {
    const { wrapper } = await mountList()

    vi.useFakeTimers()
    await fill(wrapper, '#transaction-search', ' semen ')
    await vi.advanceTimersByTimeAsync(300)

    expect(lastListParams()).toMatchObject({ search: 'semen', page: 1 })
  })

  it('filters by a date range, and does not send a range that runs backwards', async () => {
    const { wrapper } = await mountList()

    await pickDates(wrapper, '2026-10-01', '2026-10-31')
    expect(lastListParams()).toMatchObject({ dateFrom: '2026-10-01', dateTo: '2026-10-31' })
    expect(wrapper.text()).not.toContain('Tanggal awal tidak boleh setelah tanggal akhir')

    await pickDates(wrapper, '2026-11-05', '2026-10-31')
    expect(lastListParams().dateFrom).toBeUndefined()
    expect(lastListParams().dateTo).toBeUndefined()
    expect(wrapper.text()).toContain('Tanggal awal tidak boleh setelah tanggal akhir')
  })

  it('names the two date filters, for the eye and for a screen reader', async () => {
    const { wrapper } = await mountList()

    const pickers = wrapper.findAllComponents(DatePicker)
    expect(pickers.map((p) => p.props('ariaLabel'))).toEqual(['Dari tanggal', 'Sampai tanggal'])
    expect(pickers.map((p) => p.props('placeholder'))).toEqual(['Dari tanggal', 'Sampai tanggal'])
  })

  it('opens on the status named in the address, with one request', async () => {
    const { wrapper } = await mountList([SEMEN], '/transaksi?status=VOID')

    expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1)
    expect(lastListParams()).toMatchObject({ status: 'VOID', page: 1 })
    expect(select(wrapper, 'Status').props('modelValue')).toBe('VOID')

    await wrapper.get('[data-testid="reset-filters"]').trigger('click')
    await flushPromises()
    expect(lastListParams().status).toBeUndefined()
    expect(select(wrapper, 'Status').props('modelValue')).toBeUndefined()
  })

  it('ignores a status in the address that does not exist, or is no longer offered', async () => {
    const { wrapper } = await mountList([SEMEN], '/transaksi?status=PENDING')

    expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1)
    expect(lastListParams().status).toBeUndefined()
    expect(select(wrapper, 'Status').props('modelValue')).toBeUndefined()
  })

  it('makes a single request when the address names no status', async () => {
    await mountList()

    expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1)
    expect(lastListParams().status).toBeUndefined()
  })

  it('clears every filter with Reset', async () => {
    const { wrapper } = await mountList()
    await choose(wrapper, 'Status', 'VOID')
    await pickDates(wrapper, '2026-10-01', null)

    await wrapper.get('[data-testid="reset-filters"]').trigger('click')
    await flushPromises()

    const params = lastListParams()
    expect(params.status).toBeUndefined()
    expect(params.dateFrom).toBeUndefined()
    expect(select(wrapper, 'Status').props('modelValue')).toBeUndefined()
  })

  it('tells an empty list apart from filters that match nothing', async () => {
    const { wrapper } = await mountList([])
    expect(wrapper.text()).toContain('Belum ada transaksi')

    await choose(wrapper, 'Status', 'VOID')
    expect(wrapper.text()).toContain('Tidak ada transaksi yang cocok')
  })

  it('shows an error with a retry when the list cannot be loaded', async () => {
    signIn()
    vi.mocked(transactionsApi.listTransactions).mockRejectedValueOnce(new ApiError(500, 'Terjadi kesalahan pada server'))
    const { wrapper } = await mountView(TransactionsView, { path: '/transaksi', withOverlays: true })
    expect(wrapper.text()).toContain('Terjadi kesalahan pada server')

    vi.mocked(transactionsApi.listTransactions).mockResolvedValue(pageOf([SEMEN]))
    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Beli semen')
  })

  it('gives an admin both actions and a switch that hides transfers', async () => {
    const { wrapper } = await mountList()

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
    const { wrapper } = await mountList()

    await wrapper.get('[data-testid="add-transaction"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('#tx-amount').exists()).toBe(true)

    vi.mocked(transactionsApi.listTransactions).mockClear()
    wrapper.findComponent(TransactionFormDialog).vm.$emit('saved', SEMEN)
    await flushPromises()
    expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1)
  })

  it('offers transfers, without a creator or project column', async () => {
    const { wrapper } = await mountList()

    expect(wrapper.get('h1').text()).toBe('Transaksi')
    expect(wrapper.find('[data-testid="add-transfer"]').exists()).toBe(true)
    const headers = wrapper.findAll('thead th').map((th) => th.text())
    expect(headers).not.toContain('Dicatat oleh')
    expect(headers).not.toContain('Proyek')
  })

  it('offers a reload when the filter choices cannot be loaded, and still lists transactions', async () => {
    vi.mocked(accountsApi.listAccountOptions).mockRejectedValueOnce(new ApiError(0, 'Tidak dapat terhubung ke server'))
    const { wrapper } = await mountList()
    expect(wrapper.text()).toContain('Beli semen')
    expect(optionLabels(wrapper, 'Akun')).toEqual([])

    await wrapper.get('[data-testid="reload-options"]').trigger('click')
    await flushPromises()

    expect(optionLabels(wrapper, 'Akun')).toEqual(['Kas Kecil', 'Bank Utama'])
    expect(wrapper.find('[data-testid="reload-options"]').exists()).toBe(false)
  })
})

describe('TransactionsView: export', () => {
  const FILE: DownloadedFile = { blob: new Blob(['isi']), fileName: 'transaksi-20261007-1005.csv' }
  const exportFile = vi.mocked(transactionsApi.exportTransactions)

  async function mountList(path = '/transaksi') {
    signIn()
    vi.mocked(transactionsApi.listTransactions).mockResolvedValue(pageOf([SEMEN]))
    exportFile.mockResolvedValue(FILE)
    return mountView(TransactionsView, { path, withOverlays: true })
  }

  async function clickExport(wrapper: VueWrapper): Promise<void> {
    await wrapper.get('[data-testid="export-transactions"]').trigger('click')
    await flushPromises()
  }

  it.each(['SUPER_ADMIN', 'PROJECT_MANAGER', 'STAFF'] as const)('is offered to a %s', async (role) => {
    const { wrapper } = await mountList(role)

    expect(wrapper.get('[data-testid="export-transactions"]').text()).toBe('Ekspor CSV')
  })

  it('saves the file under the name the API chose and says so', async () => {
    const { wrapper } = await mountList()

    await clickExport(wrapper)

    expect(exportFile).toHaveBeenCalledExactlyOnceWith({})
    expect(download.saveBlob).toHaveBeenCalledExactlyOnceWith(FILE.blob, 'transaksi-20261007-1005.csv')
    expect(document.body.textContent).toContain('Berkas ekspor diunduh')
  })

  it('falls back to a plain name when the API sent none', async () => {
    const { wrapper } = await mountList()
    exportFile.mockResolvedValue({ blob: FILE.blob, fileName: null })

    await clickExport(wrapper)

    expect(download.saveBlob).toHaveBeenCalledExactlyOnceWith(FILE.blob, 'transaksi.csv')
  })

  it('exports with exactly the filters of the list on screen', async () => {
    const { wrapper } = await mountList()
    await choose(wrapper, 'Status', 'VOID')
    await choose(wrapper, 'Akun', KAS.id)
    wrapper.findComponent(ToggleSwitch).vm.$emit('update:modelValue', false)
    await flushPromises()

    await clickExport(wrapper)

    const { page: _page, pageSize: _pageSize, ...listed } = lastListParams()
    const sent = exportFile.mock.calls[0]![0]
    expect(sent).toMatchObject({ status: 'VOID', accountId: KAS.id, includeTransfers: false })
    expect(sent).not.toHaveProperty('page')
    expect(sent).not.toHaveProperty('pageSize')
    // Yang terisi di permintaan daftar sama dengan yang terisi di permintaan ekspor.
    const filled = (filters: object) => Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined))
    expect(filled(sent)).toEqual(filled(listed))
  })

  it('uses a search only once the list has applied it', async () => {
    const { wrapper } = await mountList()
    vi.useFakeTimers()
    await fill(wrapper, '#transaction-search', 'semen')

    // Masih diketik: daftar belum disaring, jadi ekspor pun belum.
    await wrapper.get('[data-testid="export-transactions"]').trigger('click')
    await vi.advanceTimersByTimeAsync(0)
    expect(exportFile.mock.calls[0]![0].search).toBeUndefined()

    await vi.advanceTimersByTimeAsync(300)
    expect(lastListParams()).toMatchObject({ search: 'semen' })
    await wrapper.get('[data-testid="export-transactions"]').trigger('click')
    await vi.advanceTimersByTimeAsync(0)
    expect(exportFile.mock.calls[1]![0]).toMatchObject({ search: 'semen' })
  })

  it('carries a status that came from the address, and leaves out a backwards date range', async () => {
    const { wrapper } = await mountList('/transaksi?status=VOID')
    await pickDates(wrapper, '2026-11-05', '2026-10-31')

    await clickExport(wrapper)

    const sent = exportFile.mock.calls[0]![0]
    expect(sent.status).toBe('VOID')
    expect(sent.dateFrom).toBeUndefined()
    expect(sent.dateTo).toBeUndefined()
  })

  it('runs one export at a time, showing that it is busy', async () => {
    const { wrapper } = await mountList()
    let finish!: (file: DownloadedFile) => void
    exportFile.mockReturnValue(new Promise((resolve) => (finish = resolve)))

    await clickExport(wrapper)
    expect(wrapper.get('[data-testid="export-transactions"]').attributes('disabled')).toBeDefined()
    await clickExport(wrapper)
    finish(FILE)
    await flushPromises()

    expect(exportFile).toHaveBeenCalledTimes(1)
    expect(download.saveBlob).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="export-transactions"]').attributes('disabled')).toBeUndefined()
  })

  it.each([
    ['the API refuses', new ApiError(400, 'Validasi gagal')],
    ['the network drops', new ApiError(0, 'Tidak dapat terhubung ke server')],
  ])('saves nothing and frees the button when %s', async (_label, failure) => {
    const { wrapper } = await mountList()
    exportFile.mockRejectedValue(failure)

    await clickExport(wrapper)

    expect(download.saveBlob).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain(failure.message)
    expect(document.body.textContent).not.toContain('Berkas ekspor diunduh')
    expect(wrapper.get('[data-testid="export-transactions"]').attributes('disabled')).toBeUndefined()
  })
})

describe('TransactionTable', () => {
  it('keeps to its scope, which does not count as a filter', async () => {
    signIn()
    vi.mocked(transactionsApi.listTransactions).mockResolvedValue(pageOf([]))

    const { wrapper } = await mountView(TransactionTable, {
      props: { scope: { accountId: KAS.id } },
    })

    expect(lastListParams()).toMatchObject({ accountId: KAS.id, page: 1 })
    expect(wrapper.text()).toContain('Belum ada transaksi')
  })

  it('loads again when its scope changes', async () => {
    signIn()
    vi.mocked(transactionsApi.listTransactions).mockResolvedValue(pageOf([SEMEN]))
    const { wrapper } = await mountView(TransactionTable, { props: { scope: { accountId: KAS.id } } })

    await wrapper.setProps({ scope: { accountId: BANK.id } })
    await flushPromises()

    expect(lastListParams()).toMatchObject({ accountId: BANK.id })
  })
})

describe('useTransactionOptions', () => {
  it('loads accounts and usable categories once, and narrows categories by type', async () => {
    const options = useTransactionOptions()
    await flushPromises()

    expect(options.accounts.value).toEqual([KAS, BANK])
    expect(options.categories.value).toEqual([MATERIAL, UPAH, TERMIN])
    expect(options.categoriesFor('OUT')).toEqual([MATERIAL, UPAH])
    expect(options.categoriesFor('IN')).toEqual([TERMIN])
    expect(options.categoriesFor(null)).toEqual([MATERIAL, UPAH, TERMIN])
    expect(categoriesApi.listCategories).toHaveBeenCalledExactlyOnceWith({ isActive: true })
    expect(accountsApi.listAccountOptions).toHaveBeenCalledTimes(1)
  })

  it('reports a failed load and can try again', async () => {
    vi.mocked(accountsApi.listAccountOptions).mockRejectedValueOnce(new ApiError(500, 'Terjadi kesalahan pada server'))
    const options = useTransactionOptions()
    await flushPromises()

    expect(options.error.value).toBe('Terjadi kesalahan pada server')
    expect(options.accounts.value).toEqual([])

    await options.reload()

    expect(options.error.value).toBeNull()
    expect(options.accounts.value).toEqual([KAS, BANK])
  })
})
