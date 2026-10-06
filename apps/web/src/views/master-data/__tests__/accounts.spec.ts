import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import DataTable from 'primevue/datatable'
import Select from 'primevue/select'
import * as accountsApi from '@/api/accounts'
import { ApiError } from '@/api/http'
import type { Account, Paginated } from '@/api/types'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import AccountFormDialog from '../AccountFormDialog.vue'
import AccountsTab from '../AccountsTab.vue'
import MasterDataView from '../MasterDataView.vue'

vi.mock('@/api/accounts')
vi.mock('@/api/categories')

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a-kas',
    name: 'Kas Kecil',
    type: 'CASH',
    openingBalance: '1000000',
    balance: '1300000',
    isActive: true,
    createdAt: '2026-10-06T03:00:00.000Z',
    ...overrides,
  }
}

const KAS = makeAccount()
const BANK = makeAccount({ id: 'a-bank', name: 'Bank Utama', type: 'BANK', openingBalance: '0', balance: '-250000' })
const OLD = makeAccount({ id: 'a-lama', name: 'Kas Lama', isActive: false })

function pageOf(accounts: Account[]): Paginated<Account> {
  return { data: accounts, meta: { page: 1, pageSize: 20, total: accounts.length } }
}

function lastListParams() {
  const calls = vi.mocked(accountsApi.listAccounts).mock.calls
  return calls[calls.length - 1]![0]
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
})

describe('MasterDataView', () => {
  it('opens on the accounts tab, with categories as the second tab', async () => {
    vi.mocked(accountsApi.listAccounts).mockResolvedValue(pageOf([KAS]))

    const { wrapper } = await mountView(MasterDataView, { path: '/master-data', withOverlays: true })

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual(['Akun', 'Kategori'])
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('Akun')
    expect(wrapper.text()).toContain('Kas Kecil')
  })
})

describe('AccountsTab', () => {
  async function mountTab(accounts: Account[] = [KAS, BANK, OLD]) {
    vi.mocked(accountsApi.listAccounts).mockResolvedValue(pageOf(accounts))
    return mountView(AccountsTab, { withOverlays: true })
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists accounts with type, both amounts as rupiah, and status', async () => {
    const { wrapper } = await mountTab()

    const rows = wrapper.findAll('tbody tr').map((row) => row.text())
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('Kas Kecil')
    expect(rows[0]).toContain('Kas')
    expect(rows[0]).toContain('Rp 1.000.000')
    expect(rows[0]).toContain('Rp 1.300.000')
    expect(rows[0]).toContain('Aktif')
    expect(rows[1]).toContain('Bank')
    expect(rows[2]).toContain('Nonaktif')
  })

  it('marks a negative balance', async () => {
    const { wrapper } = await mountTab()

    const negative = wrapper.get('[data-testid="balance-a-bank"]')
    expect(negative.text()).toBe('-Rp 250.000')
    expect(negative.classes()).toContain('text-red-600')
    expect(wrapper.get('[data-testid="balance-a-kas"]').classes()).not.toContain('text-red-600')
  })

  it('searches after a pause and filters by type and status', async () => {
    const { wrapper } = await mountTab()
    const [type, status] = wrapper.findAllComponents(Select)

    type!.vm.$emit('update:modelValue', 'BANK')
    await flushPromises()
    status!.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(lastListParams()).toMatchObject({ type: 'BANK', isActive: false, page: 1 })

    vi.useFakeTimers()
    await fill(wrapper, '#account-search', 'kas')
    await vi.advanceTimersByTimeAsync(300)
    expect(lastListParams()).toMatchObject({ search: 'kas', type: 'BANK' })
  })

  it('asks the API for the page the table requests', async () => {
    const { wrapper } = await mountTab()
    wrapper.findComponent(DataTable).vm.$emit('page', { page: 1, rows: 50 })
    await flushPromises()
    expect(lastListParams()).toMatchObject({ page: 2, pageSize: 50 })
  })

  it('distinguishes an empty list from no match, and recovers from a load failure', async () => {
    const empty = await mountTab([])
    expect(empty.wrapper.text()).toContain('Belum ada akun')
    empty.wrapper.findAllComponents(Select)[0]!.vm.$emit('update:modelValue', 'CASH')
    await flushPromises()
    expect(empty.wrapper.text()).toContain('Tidak ada akun yang cocok')
    empty.wrapper.unmount()

    vi.mocked(accountsApi.listAccounts).mockRejectedValueOnce(new ApiError(0, 'Tidak dapat terhubung ke server'))
    const { wrapper } = await mountView(AccountsTab, { withOverlays: true })
    expect(wrapper.text()).toContain('Tidak dapat terhubung ke server')
    vi.mocked(accountsApi.listAccounts).mockResolvedValue(pageOf([KAS]))
    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Kas Kecil')
  })

  it('deactivates after confirmation and reactivates directly', async () => {
    vi.mocked(accountsApi.updateAccount).mockResolvedValue(KAS)
    const { wrapper } = await mountTab()

    await wrapper.get('[data-testid="toggle-a-kas"]').trigger('click')
    await flushPromises()
    expect(accountsApi.updateAccount).not.toHaveBeenCalled()
    document.querySelector<HTMLButtonElement>('.p-confirmdialog-accept-button')!.click()
    await flushPromises()
    expect(accountsApi.updateAccount).toHaveBeenCalledWith('a-kas', { isActive: false })

    await wrapper.get('[data-testid="toggle-a-lama"]').trigger('click')
    await flushPromises()
    expect(accountsApi.updateAccount).toHaveBeenLastCalledWith('a-lama', { isActive: true })
  })

  it('opens the form to add or edit, and reloads after saving', async () => {
    const { wrapper } = await mountTab()

    await wrapper.get('[data-testid="add-account"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Tambah akun')

    await wrapper.get('[data-testid="edit-a-kas"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Ubah akun')

    vi.mocked(accountsApi.listAccounts).mockClear()
    wrapper.findComponent(AccountFormDialog).vm.$emit('saved', KAS)
    await flushPromises()
    expect(accountsApi.listAccounts).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('Kas Kecil disimpan')
  })
})

describe('AccountFormDialog', () => {
  function mountForm(account: Account | null = null) {
    return mountView(AccountFormDialog, { props: { visible: true, account } })
  }

  async function chooseType(wrapper: VueWrapper, type: string) {
    wrapper.findComponent(Select).vm.$emit('update:modelValue', type)
    await flushPromises()
  }

  it('requires a name and a type', async () => {
    const { wrapper } = await mountForm()

    await submitForm(wrapper)

    expect(wrapper.text()).toContain('Nama wajib diisi')
    expect(wrapper.text()).toContain('Jenis wajib diisi')
    expect(accountsApi.createAccount).not.toHaveBeenCalled()
  })

  it('creates an account, sending the opening balance as digits', async () => {
    vi.mocked(accountsApi.createAccount).mockResolvedValue(KAS)
    const { wrapper } = await mountForm()

    await fill(wrapper, '#account-name', 'Kas Proyek')
    await chooseType(wrapper, 'CASH')
    await fill(wrapper, '#account-opening', '1.500.000')
    await submitForm(wrapper)

    expect(accountsApi.createAccount).toHaveBeenCalledWith({
      name: 'Kas Proyek',
      type: 'CASH',
      openingBalance: '1500000',
    })
    expect(wrapper.emitted('saved')?.[0]).toEqual([KAS])
  })

  it('treats an empty opening balance as zero and accepts a negative one', async () => {
    vi.mocked(accountsApi.createAccount).mockResolvedValue(KAS)
    const zero = await mountForm()
    await fill(zero.wrapper, '#account-name', 'Bank Baru')
    await chooseType(zero.wrapper, 'BANK')
    await submitForm(zero.wrapper)
    expect(accountsApi.createAccount).toHaveBeenLastCalledWith(expect.objectContaining({ openingBalance: '0' }))
    zero.wrapper.unmount()

    const minus = await mountForm()
    await fill(minus.wrapper, '#account-name', 'Rekening Minus')
    await chooseType(minus.wrapper, 'BANK')
    await fill(minus.wrapper, '#account-opening', '-500000')
    await submitForm(minus.wrapper)
    expect(accountsApi.createAccount).toHaveBeenLastCalledWith(
      expect.objectContaining({ openingBalance: '-500000' }),
    )
  })

  it('shows a duplicate name under the name field', async () => {
    vi.mocked(accountsApi.createAccount).mockRejectedValue(new ApiError(409, 'Nama akun sudah dipakai'))
    const { wrapper } = await mountForm()

    await fill(wrapper, '#account-name', 'Kas Kecil')
    await chooseType(wrapper, 'CASH')
    await submitForm(wrapper)

    expect(wrapper.get('#account-name-error').text()).toBe('Nama akun sudah dipakai')
  })

  it('edits with the current values filled in and sends only what changed', async () => {
    vi.mocked(accountsApi.updateAccount).mockResolvedValue({ ...KAS, openingBalance: '2000000' })
    const { wrapper } = await mountForm(KAS)
    expect((wrapper.get('#account-name').element as HTMLInputElement).value).toBe('Kas Kecil')
    expect((wrapper.get('#account-opening').element as HTMLInputElement).value).toBe('1.000.000')

    await fill(wrapper, '#account-opening', '2000000')
    await submitForm(wrapper)

    expect(accountsApi.updateAccount).toHaveBeenCalledWith('a-kas', { openingBalance: '2000000' })
  })
})
