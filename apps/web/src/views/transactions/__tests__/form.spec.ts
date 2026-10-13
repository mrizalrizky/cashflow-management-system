import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import * as accountsApi from '@/api/accounts'
import * as attachmentsApi from '@/api/attachments'
import * as categoriesApi from '@/api/categories'
import * as installmentsApi from '@/api/installments'
import { ApiError } from '@/api/http'
import * as transactionsApi from '@/api/transactions'
import type { Transaction } from '@/api/types'
import DateField from '@/components/DateField.vue'
import ProofPicker from '@/components/ProofPicker.vue'
import { useTransactionOptions } from '@/composables/useTransactionOptions'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import { signIn } from '@/test/session'
import {
  BANK,
  installmentList,
  KAS,
  KREDIT,
  makeAttachment,
  makeInstallment,
  makeTransaction,
  MATERIAL,
  TERMIN,
  TRANSFER_KELUAR,
  UPAH,
} from '@/test/transactions'
import TransactionFormDialog from '../TransactionFormDialog.vue'

vi.mock('@/api/transactions')
vi.mock('@/api/attachments')
vi.mock('@/api/accounts')
vi.mock('@/api/categories')
vi.mock('@/api/installments')
vi.mock('@/lib/calendar', () => ({ todayInJakarta: () => '2026-10-07' }))

const NOTA = new File(['x'], 'nota.jpg', { type: 'image/jpeg' })
const CREATED = makeTransaction({ id: 't-baru' })

const onSaved = vi.fn<(tx: Transaction) => void>()
const onVisible = vi.fn<(visible: boolean) => void>()

async function mountForm(transaction: Transaction | null = null, withOverlays = true) {
  signIn()
  const options = useTransactionOptions()
  await flushPromises()
  return mountView(TransactionFormDialog, {
    props: { visible: true, transaction, options, onSaved, 'onUpdate:visible': onVisible },
    withOverlays,
  })
}

function select(wrapper: VueWrapper, id: string) {
  const found = wrapper.findAllComponents(Select).find((s) => s.props('ariaLabelledby') === `${id}-label`)
  if (!found) throw new Error(`Tidak ada pilihan ${id}`)
  return found
}

async function choose(wrapper: VueWrapper, id: string, value: string | null): Promise<void> {
  select(wrapper, id).vm.$emit('update:modelValue', value)
  await flushPromises()
}

function optionLabels(wrapper: VueWrapper, id: string): string[] {
  return (select(wrapper, id).props('options') as { label: string }[]).map((o) => o.label)
}

async function pickProof(wrapper: VueWrapper, files: File[]): Promise<void> {
  wrapper.findComponent(ProofPicker).vm.$emit('update:modelValue', files)
  await flushPromises()
}

/** Mengisi pengeluaran yang sah; tipe dan tanggal memakai bawaannya. */
async function fillExpense(wrapper: VueWrapper): Promise<void> {
  await fill(wrapper, '#tx-amount', '150000')
  await choose(wrapper, 'tx-account', KAS.id)
  await choose(wrapper, 'tx-category', MATERIAL.id)
  await fill(wrapper, '#tx-description', ' Beli semen ')
}

function errorOf(wrapper: VueWrapper, id: string): string {
  return wrapper.get(`#${id}-error`).text()
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
  vi.mocked(accountsApi.listAccountOptions).mockResolvedValue([KAS, BANK])
  vi.mocked(categoriesApi.listCategories).mockResolvedValue([MATERIAL, UPAH, TERMIN, TRANSFER_KELUAR])
  vi.mocked(installmentsApi.listInstallments).mockResolvedValue(installmentList())
  vi.mocked(transactionsApi.createTransaction).mockResolvedValue(CREATED)
  vi.mocked(attachmentsApi.uploadAttachment).mockResolvedValue(makeAttachment())
})

describe('TransactionFormDialog: recording', () => {
  it('saves an expense without proof straight away, without asking', async () => {
    const { wrapper } = await mountForm()
    await fillExpense(wrapper)
    await submitForm(wrapper)

    expect(document.body.textContent).not.toContain('Simpan tanpa bukti')
    expect(transactionsApi.createTransaction).toHaveBeenCalledOnce()
    expect(document.body.textContent).not.toContain('Langsung setujui')
  })

  it('has no project field', async () => {
    const { wrapper } = await mountForm()
    expect(() => select(wrapper, 'tx-project')).toThrow('Tidak ada pilihan tx-project')
  })

  it('starts as an expense dated today, and asks for everything else', async () => {
    const { wrapper } = await mountForm()
    expect(wrapper.text()).toContain('Catat transaksi')
    expect(select(wrapper, 'tx-type').props('modelValue')).toBe('OUT')
    expect(wrapper.findComponent(DateField).props('modelValue')).toBe('2026-10-07')

    await submitForm(wrapper)

    expect(errorOf(wrapper, 'tx-amount')).toBe('Jumlah wajib diisi')
    expect(errorOf(wrapper, 'tx-account')).toBe('Akun wajib dipilih')
    expect(errorOf(wrapper, 'tx-category')).toBe('Kategori wajib dipilih')
    expect(errorOf(wrapper, 'tx-description')).toBe('Keterangan wajib diisi')
    expect(transactionsApi.createTransaction).not.toHaveBeenCalled()
  })

  it('refuses a zero amount, an amount over 13 digits, and a date in the future', async () => {
    const { wrapper } = await mountForm()
    await fillExpense(wrapper)

    await fill(wrapper, '#tx-amount', '0')
    await submitForm(wrapper)
    expect(errorOf(wrapper, 'tx-amount')).toBe('Jumlah harus lebih dari 0')

    await fill(wrapper, '#tx-amount', '12345678901234')
    await submitForm(wrapper)
    expect(errorOf(wrapper, 'tx-amount')).toBe('Jumlah terlalu besar')

    await fill(wrapper, '#tx-amount', '150000')
    wrapper.findComponent(DateField).vm.$emit('update:modelValue', '2026-10-08')
    await submitForm(wrapper)
    expect(errorOf(wrapper, 'tx-date')).toBe('Tanggal transaksi tidak boleh di masa depan')
    expect(transactionsApi.createTransaction).not.toHaveBeenCalled()
  })

  it('offers accounts by name only, and categories of the chosen type', async () => {
    const { wrapper } = await mountForm()
    expect(optionLabels(wrapper, 'tx-account')).toEqual(['Kas Kecil', 'Bank Utama'])
    expect(optionLabels(wrapper, 'tx-category')).toEqual(['Material', 'Upah Tukang'])

    await choose(wrapper, 'tx-category', MATERIAL.id)
    await choose(wrapper, 'tx-type', 'IN')

    expect(optionLabels(wrapper, 'tx-category')).toEqual(['Termin Klien'])
    expect(select(wrapper, 'tx-category').props('modelValue')).toBeNull()
  })

  it('creates the transaction, uploads its proof, closes and reports', async () => {
    const { wrapper } = await mountForm()
    await fillExpense(wrapper)
    await pickProof(wrapper, [NOTA])

    await submitForm(wrapper)

    expect(transactionsApi.createTransaction).toHaveBeenCalledExactlyOnceWith({
      type: 'OUT',
      amount: '150000',
      transactionDate: '2026-10-07',
      description: 'Beli semen',
      accountId: KAS.id,
      categoryId: MATERIAL.id,
      installmentId: null,
    })
    expect(attachmentsApi.uploadAttachment).toHaveBeenCalledExactlyOnceWith('t-baru', NOTA)
    expect(onVisible).toHaveBeenLastCalledWith(false)
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(CREATED)
    expect(document.body.textContent).toContain('Transaksi dicatat')
  })

  it('sends nothing more while a save is in flight', async () => {
    let finish!: (tx: Transaction) => void
    vi.mocked(transactionsApi.createTransaction).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { wrapper } = await mountForm()
    await fillExpense(wrapper)
    await pickProof(wrapper, [NOTA])

    await submitForm(wrapper)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await submitForm(wrapper)
    await submitForm(wrapper)
    finish(CREATED)
    await flushPromises()

    expect(transactionsApi.createTransaction).toHaveBeenCalledTimes(1)
    expect(attachmentsApi.uploadAttachment).toHaveBeenCalledTimes(1)
  })

  it('cannot be closed while a save is in flight', async () => {
    vi.mocked(transactionsApi.createTransaction).mockReturnValue(new Promise(() => undefined))
    const { wrapper } = await mountForm()
    const cancel = () => wrapper.findAll('button').find((b) => b.text() === 'Batal')!
    expect(wrapper.findComponent(Dialog).props()).toMatchObject({ closable: true, closeOnEscape: true })
    expect(cancel().attributes('disabled')).toBeUndefined()
    await fillExpense(wrapper)
    await pickProof(wrapper, [NOTA])

    await submitForm(wrapper)

    expect(wrapper.findComponent(Dialog).props()).toMatchObject({ closable: false, closeOnEscape: false })
    expect(cancel().attributes('disabled')).toBeDefined()
  })

  it('uploads the proof that was chosen when Simpan was pressed, whatever happens to the form meanwhile', async () => {
    let finish!: (tx: Transaction) => void
    vi.mocked(transactionsApi.createTransaction).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { wrapper } = await mountForm()
    await fillExpense(wrapper)
    await pickProof(wrapper, [NOTA])

    await submitForm(wrapper)
    await pickProof(wrapper, [])
    finish(CREATED)
    await flushPromises()

    expect(attachmentsApi.uploadAttachment).toHaveBeenCalledExactlyOnceWith('t-baru', NOTA)
  })

  it('says so when its choices cannot be loaded, and can load them again', async () => {
    vi.mocked(accountsApi.listAccountOptions).mockRejectedValueOnce(new ApiError(0, 'Tidak dapat terhubung ke server'))
    const { wrapper } = await mountForm()
    expect(wrapper.get('form').text()).toContain('Pilihan gagal dimuat: Tidak dapat terhubung ke server')
    expect(optionLabels(wrapper, 'tx-account')).toEqual([])

    await wrapper.get('form [data-testid="reload-options"]').trigger('click')
    await flushPromises()

    expect(optionLabels(wrapper, 'tx-account')).toEqual(['Kas Kecil', 'Bank Utama'])
    expect(wrapper.find('form [data-testid="reload-options"]').exists()).toBe(false)
  })

  it('keeps the save button busy until the proof is uploaded too', async () => {
    let finishUpload!: () => void
    vi.mocked(attachmentsApi.uploadAttachment).mockReturnValue(
      new Promise((resolve) => (finishUpload = () => resolve(makeAttachment()))),
    )
    const { wrapper } = await mountForm()
    await fillExpense(wrapper)
    await pickProof(wrapper, [NOTA])

    await submitForm(wrapper)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(onVisible).not.toHaveBeenCalled()

    await submitForm(wrapper)
    finishUpload()
    await flushPromises()

    expect(transactionsApi.createTransaction).toHaveBeenCalledTimes(1)
    expect(onVisible).toHaveBeenLastCalledWith(false)
  })

  it('takes the user to the saved transaction when a proof fails to upload', async () => {
    vi.mocked(attachmentsApi.uploadAttachment).mockRejectedValue(new ApiError(400, 'Jenis berkas tidak didukung'))
    const { wrapper, router } = await mountForm()
    await fillExpense(wrapper)
    await pickProof(wrapper, [NOTA])

    await submitForm(wrapper)
    await flushPromises()

    expect(onVisible).toHaveBeenLastCalledWith(false)
    expect(router.currentRoute.value.path).toBe('/transaksi/t-baru')
    expect(document.body.textContent).toContain('Transaksi tersimpan')
    expect(document.body.textContent).toContain('nota.jpg: Jenis berkas tidak didukung')
    expect(transactionsApi.createTransaction).toHaveBeenCalledTimes(1)
  })

  it('puts API field errors under their fields and keeps what was typed', async () => {
    vi.mocked(transactionsApi.createTransaction).mockRejectedValue(
      new ApiError(400, 'Validasi gagal', [{ field: 'accountId', messages: ['Akun sudah tidak aktif'] }]),
    )
    const { wrapper } = await mountForm()
    await fillExpense(wrapper)
    await pickProof(wrapper, [NOTA])

    await submitForm(wrapper)

    expect(errorOf(wrapper, 'tx-account')).toBe('Akun sudah tidak aktif')
    expect((wrapper.get('#tx-description').element as HTMLTextAreaElement).value).toBe(' Beli semen ')
    expect(onVisible).not.toHaveBeenCalled()
    expect(attachmentsApi.uploadAttachment).not.toHaveBeenCalled()
  })

})

describe('TransactionFormDialog: editing', () => {
  const RECORDED = makeTransaction({ permissions: { canEdit: true } })

  it('pre-fills every field and has no proof picker', async () => {
    const { wrapper } = await mountForm(RECORDED)

    expect(wrapper.text()).toContain('Ubah transaksi')
    expect(select(wrapper, 'tx-type').props('modelValue')).toBe('OUT')
    expect((wrapper.get('#tx-amount').element as HTMLInputElement).value).toBe('150.000')
    expect(wrapper.findComponent(DateField).props('modelValue')).toBe('2026-10-01')
    expect(select(wrapper, 'tx-account').props('modelValue')).toBe(KAS.id)
    expect(select(wrapper, 'tx-category').props('modelValue')).toBe(MATERIAL.id)
    expect((wrapper.get('#tx-description').element as HTMLTextAreaElement).value).toBe('Beli semen')
    expect(wrapper.findComponent(ProofPicker).exists()).toBe(false)
  })

  it('sends only what changed', async () => {
    const saved = makeTransaction({ amount: '90000' })
    vi.mocked(transactionsApi.updateTransaction).mockResolvedValue(saved)
    const { wrapper } = await mountForm(RECORDED)

    await fill(wrapper, '#tx-amount', '90000')
    await submitForm(wrapper)

    expect(transactionsApi.updateTransaction).toHaveBeenCalledExactlyOnceWith('t-semen', {
      amount: '90000',
    })
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(saved)
    expect(document.body.textContent).toContain('Transaksi disimpan')
  })

  it('closes without a request when nothing was changed', async () => {
    const { wrapper } = await mountForm(RECORDED)

    await submitForm(wrapper)

    expect(transactionsApi.updateTransaction).not.toHaveBeenCalled()
    expect(onVisible).toHaveBeenLastCalledWith(false)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('still offers an account or category that has since been closed', async () => {
    const old = makeTransaction({
      account: { id: 'a-lama', name: 'Kas Lama' },
      category: { id: 'c-lama', name: 'Bahan Lama' },
      permissions: { canEdit: true },
    })
    const { wrapper } = await mountForm(old)

    expect(optionLabels(wrapper, 'tx-account')).toContain('Kas Lama')
    expect(optionLabels(wrapper, 'tx-category')).toContain('Bahan Lama')
  })

  it('starts clean when reopened after an error', async () => {
    vi.mocked(transactionsApi.updateTransaction).mockRejectedValue(new ApiError(409, 'Transaksi tidak bisa diubah pada status ini'))
    // Tanpa Toast dan ConfirmDialog, supaya props dialognya bisa diubah langsung.
    const { wrapper } = await mountForm(RECORDED, false)
    await fill(wrapper, '#tx-amount', '90000')
    await submitForm(wrapper)
    expect(wrapper.text()).toContain('Transaksi tidak bisa diubah pada status ini')

    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    await flushPromises()

    expect(wrapper.text()).not.toContain('Transaksi tidak bisa diubah pada status ini')
    expect((wrapper.get('#tx-amount').element as HTMLInputElement).value).toBe('150.000')
  })
})

describe('TransactionFormDialog: installments', () => {
  const MOTOR = makeInstallment()
  const HP = makeInstallment({ id: 'i-hp', name: 'HP', monthlyAmount: '300000', paid: 1, months: 1, status: 'PAID_OFF' })

  beforeEach(() => {
    vi.mocked(categoriesApi.listCategories).mockResolvedValue([MATERIAL, KREDIT, TERMIN])
    vi.mocked(installmentsApi.listInstallments).mockResolvedValue(installmentList([MOTOR, HP]))
  })

  it('asks which installment is paid once an installment category is chosen, listing unpaid ones', async () => {
    const { wrapper } = await mountForm()
    expect(wrapper.find('#tx-installment-label').exists()).toBe(false)
    await choose(wrapper, 'tx-category', KREDIT.id)
    expect(optionLabels(wrapper, 'tx-installment')).toEqual(['Motor · Rp 1.500.000 · 1/3'])
  })

  it('picks the only unpaid installment by itself and fills the amount while it is empty', async () => {
    const { wrapper } = await mountForm()
    await choose(wrapper, 'tx-category', KREDIT.id)
    expect(select(wrapper, 'tx-installment').props('modelValue')).toBe('i-motor')
    expect((wrapper.get('#tx-amount').element as HTMLInputElement).value).toBe('1.500.000')
  })

  it('keeps an amount already typed when an installment is picked', async () => {
    const { wrapper } = await mountForm()
    await fill(wrapper, '#tx-amount', '1400000')
    await choose(wrapper, 'tx-category', KREDIT.id)
    expect((wrapper.get('#tx-amount').element as HTMLInputElement).value).toBe('1.400.000')
  })

  it('sends the installment it pays', async () => {
    const { wrapper } = await mountForm()
    await fill(wrapper, '#tx-amount', '150000')
    await choose(wrapper, 'tx-account', KAS.id)
    await choose(wrapper, 'tx-category', KREDIT.id)
    await fill(wrapper, '#tx-description', 'Bayar motor')
    await submitForm(wrapper)
    expect(transactionsApi.createTransaction).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryId: KREDIT.id, installmentId: 'i-motor' }),
    )
  })

  it('drops the installment when the category changes away', async () => {
    const { wrapper } = await mountForm()
    await fill(wrapper, '#tx-amount', '150000')
    await choose(wrapper, 'tx-account', KAS.id)
    await choose(wrapper, 'tx-category', KREDIT.id)
    await choose(wrapper, 'tx-category', MATERIAL.id)
    expect(wrapper.find('#tx-installment-label').exists()).toBe(false)
    await fill(wrapper, '#tx-description', 'Beli semen')
    await submitForm(wrapper)
    expect(transactionsApi.createTransaction).toHaveBeenLastCalledWith(expect.objectContaining({ installmentId: null }))
  })

  it('requires an installment when there is more than one to choose from', async () => {
    vi.mocked(installmentsApi.listInstallments).mockResolvedValue(
      installmentList([MOTOR, makeInstallment({ id: 'i-laptop', name: 'Laptop' })]),
    )
    const { wrapper } = await mountForm()
    await fill(wrapper, '#tx-amount', '150000')
    await choose(wrapper, 'tx-account', KAS.id)
    await choose(wrapper, 'tx-category', KREDIT.id)
    expect(select(wrapper, 'tx-installment').props('modelValue')).toBeNull()
    await fill(wrapper, '#tx-description', 'Bayar')
    await submitForm(wrapper)
    expect(errorOf(wrapper, 'tx-installment')).toBe('Cicilan wajib dipilih')
    expect(transactionsApi.createTransaction).not.toHaveBeenCalled()
  })

  it('loads the installments again when it opens, so the progress is current', async () => {
    vi.mocked(installmentsApi.listInstallments)
      .mockResolvedValueOnce(installmentList([MOTOR]))
      .mockResolvedValue(installmentList([{ ...MOTOR, paid: 2 }]))
    const { wrapper } = await mountForm()
    await choose(wrapper, 'tx-category', KREDIT.id)
    expect(installmentsApi.listInstallments).toHaveBeenCalledTimes(2)
    expect(optionLabels(wrapper, 'tx-installment')).toEqual(['Motor · Rp 1.500.000 · 2/3'])
  })

  it('does not pick an installment by itself for an old expense being edited', async () => {
    const old = makeTransaction({ category: { id: KREDIT.id, name: KREDIT.name }, permissions: { canEdit: true } })
    // Seperti di halaman: dialog sudah terpasang tersembunyi, lalu dibuka.
    signIn()
    const options = useTransactionOptions()
    await flushPromises()
    const { wrapper } = await mountView(TransactionFormDialog, {
      props: { visible: false, transaction: old, options, onSaved, 'onUpdate:visible': onVisible },
    })
    await wrapper.setProps({ visible: true })
    await flushPromises()
    expect(select(wrapper, 'tx-installment').props('modelValue')).toBeNull()
    await fill(wrapper, '#tx-description', 'Beli semen lagi')
    await submitForm(wrapper)
    expect(errorOf(wrapper, 'tx-installment')).toBe('Cicilan wajib dipilih')
    expect(transactionsApi.updateTransaction).not.toHaveBeenCalled()
  })

  it('points to the Cicilan page when no installment is left to pay', async () => {
    vi.mocked(installmentsApi.listInstallments).mockResolvedValue(installmentList([HP]))
    const { wrapper } = await mountForm()
    await choose(wrapper, 'tx-category', KREDIT.id)
    const hint = wrapper.get('[data-testid="no-installment"]')
    expect(hint.text()).toContain('Belum ada cicilan yang belum lunas')
    expect(hint.get('a').attributes('href')).toBe('/cicilan')
  })

  it('still offers the paid-off installment a transaction already pays when editing', async () => {
    const linked = makeTransaction({
      category: { id: KREDIT.id, name: KREDIT.name },
      installment: { id: 'i-hp', name: 'HP' },
      permissions: { canEdit: true },
    })
    const { wrapper } = await mountForm(linked)
    expect(optionLabels(wrapper, 'tx-installment')).toEqual(['Motor · Rp 1.500.000 · 1/3', 'HP · Rp 300.000 · 1/1'])
    expect(select(wrapper, 'tx-installment').props('modelValue')).toBe('i-hp')
  })
})
