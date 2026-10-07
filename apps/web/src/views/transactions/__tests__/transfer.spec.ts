import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import Select from 'primevue/select'
import * as accountsApi from '@/api/accounts'
import * as categoriesApi from '@/api/categories'
import { ApiError } from '@/api/http'
import * as projectsApi from '@/api/projects'
import * as transactionsApi from '@/api/transactions'
import type { Role, Transaction } from '@/api/types'
import DateField from '@/components/DateField.vue'
import { useTransactionOptions } from '@/composables/useTransactionOptions'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import { signInAs } from '@/test/session'
import { BANK, KAS, makeTransaction, pageOf } from '@/test/transactions'
import TransactionsView from '../TransactionsView.vue'
import TransferDialog from '../TransferDialog.vue'

vi.mock('@/api/transactions')
vi.mock('@/api/accounts')
vi.mock('@/api/projects')
vi.mock('@/api/categories')
vi.mock('@/lib/calendar', () => ({ todayInJakarta: () => '2026-10-07' }))

const TABUNGAN = { id: 'a-tabungan', name: 'Tabungan', type: 'BANK' } as const
const LEGS = [makeTransaction({ id: 't-out', isTransfer: true }), makeTransaction({ id: 't-in', isTransfer: true })]

const onSaved = vi.fn<(legs: Transaction[]) => void>()
const onVisible = vi.fn<(visible: boolean) => void>()

async function mountTransfer() {
  signInAs('SUPER_ADMIN')
  const options = useTransactionOptions()
  await flushPromises()
  const { wrapper } = await mountView(TransferDialog, {
    props: { visible: true, options, onSaved, 'onUpdate:visible': onVisible },
    withOverlays: true,
  })
  return wrapper
}

function select(wrapper: VueWrapper, id: string) {
  const found = wrapper.findAllComponents(Select).find((s) => s.props('ariaLabelledby') === `${id}-label`)
  if (!found) throw new Error(`Tidak ada pilihan ${id}`)
  return found
}

async function choose(wrapper: VueWrapper, id: string, value: string): Promise<void> {
  select(wrapper, id).vm.$emit('update:modelValue', value)
  await flushPromises()
}

function optionLabels(wrapper: VueWrapper, id: string): string[] {
  return (select(wrapper, id).props('options') as { label: string }[]).map((o) => o.label)
}

async function fillTransfer(wrapper: VueWrapper): Promise<void> {
  await choose(wrapper, 'tf-from', BANK.id)
  await choose(wrapper, 'tf-to', KAS.id)
  await fill(wrapper, '#tf-amount', '500000')
  await fill(wrapper, '#tf-description', ' Isi kas kecil ')
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
  vi.mocked(accountsApi.listAccountOptions).mockResolvedValue([KAS, BANK, TABUNGAN])
  vi.mocked(projectsApi.listProjectOptions).mockResolvedValue([])
  vi.mocked(categoriesApi.listCategories).mockResolvedValue([])
  vi.mocked(transactionsApi.createTransfer).mockResolvedValue(LEGS)
})

describe('TransferDialog', () => {
  it('asks for both accounts, an amount and a description, dated today', async () => {
    const wrapper = await mountTransfer()
    expect(wrapper.text()).toContain('Transfer antar akun')
    expect(wrapper.findComponent(DateField).props('modelValue')).toBe('2026-10-07')

    await submitForm(wrapper)

    expect(wrapper.get('#tf-from-error').text()).toBe('Akun asal wajib dipilih')
    expect(wrapper.get('#tf-to-error').text()).toBe('Akun tujuan wajib dipilih')
    expect(wrapper.get('#tf-amount-error').text()).toBe('Jumlah wajib diisi')
    expect(wrapper.get('#tf-description-error').text()).toBe('Keterangan wajib diisi')
    expect(transactionsApi.createTransfer).not.toHaveBeenCalled()
  })

  it('refuses a zero amount and a date in the future', async () => {
    const wrapper = await mountTransfer()
    await fillTransfer(wrapper)
    await fill(wrapper, '#tf-amount', '0')
    wrapper.findComponent(DateField).vm.$emit('update:modelValue', '2026-10-08')

    await submitForm(wrapper)

    expect(wrapper.get('#tf-amount-error').text()).toBe('Jumlah harus lebih dari 0')
    expect(wrapper.get('#tf-date-error').text()).toBe('Tanggal transaksi tidak boleh di masa depan')
  })

  it('never offers the source account as the destination', async () => {
    const wrapper = await mountTransfer()
    expect(optionLabels(wrapper, 'tf-to')).toEqual(['Kas Kecil', 'Bank Utama', 'Tabungan'])

    await choose(wrapper, 'tf-to', KAS.id)
    await choose(wrapper, 'tf-from', KAS.id)

    expect(optionLabels(wrapper, 'tf-to')).toEqual(['Bank Utama', 'Tabungan'])
    expect(select(wrapper, 'tf-to').props('modelValue')).toBeNull()
  })

  it('records the transfer, closes and reports', async () => {
    const wrapper = await mountTransfer()
    await fillTransfer(wrapper)

    await submitForm(wrapper)

    expect(transactionsApi.createTransfer).toHaveBeenCalledExactlyOnceWith({
      fromAccountId: BANK.id,
      toAccountId: KAS.id,
      amount: '500000',
      transactionDate: '2026-10-07',
      description: 'Isi kas kecil',
    })
    expect(onVisible).toHaveBeenLastCalledWith(false)
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(LEGS)
    expect(document.body.textContent).toContain('Transfer dicatat')
  })

  it('sends one request however often it is submitted', async () => {
    let finish!: (legs: Transaction[]) => void
    vi.mocked(transactionsApi.createTransfer).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const wrapper = await mountTransfer()
    await fillTransfer(wrapper)

    await submitForm(wrapper)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await submitForm(wrapper)
    finish(LEGS)
    await flushPromises()

    expect(transactionsApi.createTransfer).toHaveBeenCalledTimes(1)
  })

  it('puts an API field error under its field', async () => {
    vi.mocked(transactionsApi.createTransfer).mockRejectedValue(
      new ApiError(400, 'Validasi gagal', [{ field: 'toAccountId', messages: ['Akun sudah tidak aktif'] }]),
    )
    const wrapper = await mountTransfer()
    await fillTransfer(wrapper)

    await submitForm(wrapper)

    expect(wrapper.get('#tf-to-error').text()).toBe('Akun sudah tidak aktif')
    expect(onVisible).not.toHaveBeenCalled()
  })

  it('stays open with its values when the server fails', async () => {
    vi.mocked(transactionsApi.createTransfer).mockRejectedValue(new ApiError(500, 'Terjadi kesalahan pada server'))
    const wrapper = await mountTransfer()
    await fillTransfer(wrapper)

    await submitForm(wrapper)

    expect(wrapper.get('form').text()).toContain('Terjadi kesalahan pada server')
    expect((wrapper.get('#tf-amount').element as HTMLInputElement).value).toBe('500.000')
    expect(onVisible).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('TransactionsView: transfer', () => {
  async function mountList(role: Role) {
    signInAs(role)
    vi.mocked(transactionsApi.listTransactions).mockResolvedValue(pageOf([makeTransaction()]))
    return mountView(TransactionsView, { path: '/transaksi', withOverlays: true })
  }

  it('opens the transfer dialog for an admin and reloads the list afterwards', async () => {
    const { wrapper } = await mountList('SUPER_ADMIN')

    await wrapper.get('[data-testid="add-transfer"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('#tf-amount').exists()).toBe(true)

    vi.mocked(transactionsApi.listTransactions).mockClear()
    wrapper.findComponent(TransferDialog).vm.$emit('saved', LEGS)
    await flushPromises()
    expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1)
  })

  it('is not part of the page for other roles', async () => {
    const { wrapper } = await mountList('PROJECT_MANAGER')

    expect(wrapper.findComponent(TransferDialog).exists()).toBe(false)
  })
})
