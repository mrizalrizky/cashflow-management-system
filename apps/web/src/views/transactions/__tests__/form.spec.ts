import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import * as accountsApi from '@/api/accounts'
import * as attachmentsApi from '@/api/attachments'
import * as categoriesApi from '@/api/categories'
import { ApiError } from '@/api/http'
import * as projectsApi from '@/api/projects'
import * as transactionsApi from '@/api/transactions'
import type { Role, Transaction } from '@/api/types'
import DateField from '@/components/DateField.vue'
import ProofPicker from '@/components/ProofPicker.vue'
import { useTransactionOptions } from '@/composables/useTransactionOptions'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import { signInAs } from '@/test/session'
import {
  BANK,
  KAFE,
  KAS,
  makeAttachment,
  makeTransaction,
  MATERIAL,
  RUMAH,
  TERMIN,
  TRANSFER_KELUAR,
  UPAH,
} from '@/test/transactions'
import TransactionFormDialog from '../TransactionFormDialog.vue'

vi.mock('@/api/transactions')
vi.mock('@/api/attachments')
vi.mock('@/api/accounts')
vi.mock('@/api/projects')
vi.mock('@/api/categories')
vi.mock('@/lib/calendar', () => ({ todayInJakarta: () => '2026-10-07' }))

const NOTA = new File(['x'], 'nota.jpg', { type: 'image/jpeg' })
const CREATED = makeTransaction({ id: 't-baru' })

const onSaved = vi.fn<(tx: Transaction) => void>()
const onVisible = vi.fn<(visible: boolean) => void>()

async function mountForm(role: Role, transaction: Transaction | null = null, withOverlays = true) {
  signInAs(role)
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

/** Mengisi pengeluaran yang sah di proyek Rumah; tipe dan tanggal memakai bawaannya. */
async function fillExpense(wrapper: VueWrapper): Promise<void> {
  await fill(wrapper, '#tx-amount', '150000')
  await choose(wrapper, 'tx-account', KAS.id)
  await choose(wrapper, 'tx-category', MATERIAL.id)
  await choose(wrapper, 'tx-project', RUMAH.id)
  await fill(wrapper, '#tx-description', ' Beli semen ')
}

function acceptConfirm(): void {
  document.querySelector<HTMLButtonElement>('.p-confirmdialog-accept-button')!.click()
}

function errorOf(wrapper: VueWrapper, id: string): string {
  return wrapper.get(`#${id}-error`).text()
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
  vi.mocked(accountsApi.listAccountOptions).mockResolvedValue([KAS, BANK])
  vi.mocked(projectsApi.listProjectOptions).mockResolvedValue([RUMAH, KAFE])
  vi.mocked(categoriesApi.listCategories).mockResolvedValue([MATERIAL, UPAH, TERMIN, TRANSFER_KELUAR])
  vi.mocked(transactionsApi.createTransaction).mockResolvedValue(CREATED)
  vi.mocked(attachmentsApi.uploadAttachment).mockResolvedValue(makeAttachment())
})

describe('TransactionFormDialog: recording', () => {
  it('starts as an expense dated today, and asks for everything else', async () => {
    const { wrapper } = await mountForm('STAFF')
    expect(wrapper.text()).toContain('Catat transaksi')
    expect(select(wrapper, 'tx-type').props('modelValue')).toBe('OUT')
    expect(wrapper.findComponent(DateField).props('modelValue')).toBe('2026-10-07')

    await submitForm(wrapper)

    expect(errorOf(wrapper, 'tx-amount')).toBe('Jumlah wajib diisi')
    expect(errorOf(wrapper, 'tx-account')).toBe('Akun wajib dipilih')
    expect(errorOf(wrapper, 'tx-category')).toBe('Kategori wajib dipilih')
    expect(errorOf(wrapper, 'tx-project')).toBe('Proyek wajib dipilih')
    expect(errorOf(wrapper, 'tx-description')).toBe('Keterangan wajib diisi')
    expect(transactionsApi.createTransaction).not.toHaveBeenCalled()
  })

  it('refuses a zero amount, an amount over 13 digits, and a date in the future', async () => {
    const { wrapper } = await mountForm('STAFF')
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
    const { wrapper } = await mountForm('STAFF')
    expect(optionLabels(wrapper, 'tx-account')).toEqual(['Kas Kecil', 'Bank Utama'])
    expect(optionLabels(wrapper, 'tx-category')).toEqual(['Material', 'Upah Tukang'])

    await choose(wrapper, 'tx-category', MATERIAL.id)
    await choose(wrapper, 'tx-type', 'IN')

    expect(optionLabels(wrapper, 'tx-category')).toEqual(['Termin Klien'])
    expect(select(wrapper, 'tx-category').props('modelValue')).toBeNull()
  })

  it('lets staff and admins choose overhead, but not a project manager', async () => {
    const staff = await mountForm('STAFF')
    expect(optionLabels(staff.wrapper, 'tx-project')[0]).toBe('Tanpa proyek (overhead)')

    freshPinia()
    const manager = await mountForm('PROJECT_MANAGER')
    expect(optionLabels(manager.wrapper, 'tx-project')).toEqual([
      'PRJ-2026-001 · Rumah Pak Budi',
      'PRJ-2026-002 · Interior Kafe',
    ])
  })

  it('creates the transaction, uploads its proof, closes and reports', async () => {
    const { wrapper } = await mountForm('STAFF')
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
      projectId: RUMAH.id,
    })
    expect(attachmentsApi.uploadAttachment).toHaveBeenCalledExactlyOnceWith('t-baru', NOTA)
    expect(transactionsApi.approveTransaction).not.toHaveBeenCalled()
    expect(onVisible).toHaveBeenLastCalledWith(false)
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(CREATED)
    expect(document.body.textContent).toContain('Transaksi dicatat')
  })

  it('sends overhead as a null project', async () => {
    const { wrapper } = await mountForm('STAFF')
    await fillExpense(wrapper)
    await choose(wrapper, 'tx-type', 'IN')
    await choose(wrapper, 'tx-category', TERMIN.id)
    await choose(wrapper, 'tx-project', 'overhead')

    await submitForm(wrapper)

    expect(transactionsApi.createTransaction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'IN', categoryId: TERMIN.id, projectId: null }),
    )
  })

  it('sends nothing more while a save is in flight', async () => {
    let finish!: (tx: Transaction) => void
    vi.mocked(transactionsApi.createTransaction).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { wrapper } = await mountForm('STAFF')
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

  it('keeps the save button busy until the proof is uploaded too', async () => {
    let finishUpload!: () => void
    vi.mocked(attachmentsApi.uploadAttachment).mockReturnValue(
      new Promise((resolve) => (finishUpload = () => resolve(makeAttachment()))),
    )
    const { wrapper } = await mountForm('STAFF')
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
    const { wrapper, router } = await mountForm('STAFF')
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

  it('asks before saving an expense without proof, but not income', async () => {
    const { wrapper } = await mountForm('STAFF')
    await fillExpense(wrapper)

    await submitForm(wrapper)
    expect(document.body.textContent).toContain('Pengeluaran tanpa bukti tidak bisa disetujui')
    expect(transactionsApi.createTransaction).not.toHaveBeenCalled()

    acceptConfirm()
    await flushPromises()
    expect(transactionsApi.createTransaction).toHaveBeenCalledTimes(1)

    freshPinia()
    document.body.innerHTML = ''
    const income = await mountForm('STAFF')
    await fillExpense(income.wrapper)
    await choose(income.wrapper, 'tx-type', 'IN')
    await choose(income.wrapper, 'tx-category', TERMIN.id)
    await submitForm(income.wrapper)

    expect(transactionsApi.createTransaction).toHaveBeenCalledTimes(2)
  })

  it('puts API field errors under their fields and keeps what was typed', async () => {
    vi.mocked(transactionsApi.createTransaction).mockRejectedValue(
      new ApiError(400, 'Validasi gagal', [{ field: 'accountId', messages: ['Akun sudah tidak aktif'] }]),
    )
    const { wrapper } = await mountForm('STAFF')
    await fillExpense(wrapper)
    await pickProof(wrapper, [NOTA])

    await submitForm(wrapper)

    expect(errorOf(wrapper, 'tx-account')).toBe('Akun sudah tidak aktif')
    expect((wrapper.get('#tx-description').element as HTMLTextAreaElement).value).toBe(' Beli semen ')
    expect(onVisible).not.toHaveBeenCalled()
    expect(attachmentsApi.uploadAttachment).not.toHaveBeenCalled()
  })

  it('shows a project that is out of reach under the project field', async () => {
    vi.mocked(transactionsApi.createTransaction).mockRejectedValue(new ApiError(404, 'Proyek tidak ditemukan'))
    const { wrapper } = await mountForm('PROJECT_MANAGER')
    await fillExpense(wrapper)
    await pickProof(wrapper, [NOTA])

    await submitForm(wrapper)

    expect(errorOf(wrapper, 'tx-project')).toBe('Proyek tidak ditemukan')
  })
})

describe('TransactionFormDialog: approving at once', () => {
  const APPROVED = makeTransaction({ id: 't-baru', status: 'APPROVED' })

  async function saveApproved(wrapper: VueWrapper): Promise<void> {
    await fillExpense(wrapper)
    await pickProof(wrapper, [NOTA])
    wrapper.findComponent(Checkbox).vm.$emit('update:modelValue', true)
    await flushPromises()
    await submitForm(wrapper)
    await flushPromises()
  }

  it('is offered to an admin only', async () => {
    const admin = await mountForm('SUPER_ADMIN')
    expect(admin.wrapper.text()).toContain('Langsung setujui')

    freshPinia()
    const staff = await mountForm('STAFF')
    expect(staff.wrapper.findComponent(Checkbox).exists()).toBe(false)
  })

  it('creates, uploads, then approves', async () => {
    const order: string[] = []
    vi.mocked(transactionsApi.createTransaction).mockImplementation(() => (order.push('create'), Promise.resolve(CREATED)))
    vi.mocked(attachmentsApi.uploadAttachment).mockImplementation(
      () => (order.push('upload'), Promise.resolve(makeAttachment())),
    )
    vi.mocked(transactionsApi.approveTransaction).mockImplementation(
      () => (order.push('approve'), Promise.resolve({ ...APPROVED, accountBalance: '850000' })),
    )
    const { wrapper } = await mountForm('SUPER_ADMIN')

    await saveApproved(wrapper)

    expect(order).toEqual(['create', 'upload', 'approve'])
    expect(transactionsApi.approveTransaction).toHaveBeenCalledWith('t-baru')
    expect(document.body.textContent).toContain('Transaksi dicatat dan disetujui')
    expect(document.body.textContent).not.toContain('minus')
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 'APPROVED' }))
  })

  it('warns when the approval leaves the account below zero', async () => {
    vi.mocked(transactionsApi.approveTransaction).mockResolvedValue({ ...APPROVED, accountBalance: '-50000' })
    const { wrapper } = await mountForm('SUPER_ADMIN')

    await saveApproved(wrapper)

    expect(document.body.textContent).toContain('Saldo Kas Kecil sekarang minus: -Rp 50.000')
  })

  it('needs proof for an expense before anything is sent', async () => {
    const { wrapper } = await mountForm('SUPER_ADMIN')
    await fillExpense(wrapper)
    wrapper.findComponent(Checkbox).vm.$emit('update:modelValue', true)
    await flushPromises()

    await submitForm(wrapper)

    expect(errorOf(wrapper, 'tx-proof')).toBe('Pengeluaran perlu bukti untuk langsung disetujui')
    expect(transactionsApi.createTransaction).not.toHaveBeenCalled()
  })

  it('skips the approval when a proof failed, and shows the saved transaction', async () => {
    vi.mocked(attachmentsApi.uploadAttachment).mockRejectedValue(new ApiError(0, 'Tidak dapat terhubung ke server'))
    const { wrapper, router } = await mountForm('SUPER_ADMIN')

    await saveApproved(wrapper)

    expect(transactionsApi.approveTransaction).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/transaksi/t-baru')
  })

  it('shows the saved transaction when the approval itself is refused', async () => {
    vi.mocked(transactionsApi.approveTransaction).mockRejectedValue(new ApiError(500, 'Terjadi kesalahan pada server'))
    const { wrapper, router } = await mountForm('SUPER_ADMIN')

    await saveApproved(wrapper)

    expect(router.currentRoute.value.path).toBe('/transaksi/t-baru')
    expect(document.body.textContent).toContain('Transaksi tersimpan, tetapi belum disetujui: Terjadi kesalahan pada server')
    expect(transactionsApi.createTransaction).toHaveBeenCalledTimes(1)
    expect(onVisible).toHaveBeenLastCalledWith(false)
  })
})

describe('TransactionFormDialog: editing', () => {
  const PENDING = makeTransaction({ permissions: { canEdit: true } })
  const REJECTED = makeTransaction({
    status: 'REJECTED',
    rejectReason: 'Nominal tidak sesuai nota',
    permissions: { canEdit: true },
  })

  it('pre-fills every field and has no proof picker', async () => {
    const { wrapper } = await mountForm('STAFF', PENDING)

    expect(wrapper.text()).toContain('Ubah transaksi')
    expect(select(wrapper, 'tx-type').props('modelValue')).toBe('OUT')
    expect((wrapper.get('#tx-amount').element as HTMLInputElement).value).toBe('150.000')
    expect(wrapper.findComponent(DateField).props('modelValue')).toBe('2026-10-01')
    expect(select(wrapper, 'tx-account').props('modelValue')).toBe(KAS.id)
    expect(select(wrapper, 'tx-category').props('modelValue')).toBe(MATERIAL.id)
    expect(select(wrapper, 'tx-project').props('modelValue')).toBe(RUMAH.id)
    expect((wrapper.get('#tx-description').element as HTMLTextAreaElement).value).toBe('Beli semen')
    expect(wrapper.findComponent(ProofPicker).exists()).toBe(false)
    expect(wrapper.findComponent(Checkbox).exists()).toBe(false)
  })

  it('sends only what changed', async () => {
    const saved = makeTransaction({ amount: '90000' })
    vi.mocked(transactionsApi.updateTransaction).mockResolvedValue(saved)
    const { wrapper } = await mountForm('STAFF', PENDING)

    await fill(wrapper, '#tx-amount', '90000')
    await choose(wrapper, 'tx-project', 'overhead')
    await submitForm(wrapper)

    expect(transactionsApi.updateTransaction).toHaveBeenCalledExactlyOnceWith('t-semen', {
      amount: '90000',
      projectId: null,
    })
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(saved)
    expect(document.body.textContent).toContain('Transaksi disimpan')
  })

  it('closes without a request when a pending transaction was not changed', async () => {
    const { wrapper } = await mountForm('STAFF', PENDING)

    await submitForm(wrapper)

    expect(transactionsApi.updateTransaction).not.toHaveBeenCalled()
    expect(onVisible).toHaveBeenLastCalledWith(false)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('still offers an account, category or project that has since been closed', async () => {
    const old = makeTransaction({
      account: { id: 'a-lama', name: 'Kas Lama' },
      category: { id: 'c-lama', name: 'Bahan Lama' },
      project: { id: 'p-lama', code: 'PRJ-2025-009', name: 'Ruko' },
      permissions: { canEdit: true },
    })
    const { wrapper } = await mountForm('STAFF', old)

    expect(optionLabels(wrapper, 'tx-account')).toContain('Kas Lama')
    expect(optionLabels(wrapper, 'tx-category')).toContain('Bahan Lama')
    expect(optionLabels(wrapper, 'tx-project')).toContain('PRJ-2025-009 · Ruko')
  })

  it('resubmits a rejected transaction even when nothing was changed, showing why it was rejected', async () => {
    const resubmitted = makeTransaction({ status: 'PENDING' })
    vi.mocked(transactionsApi.updateTransaction).mockResolvedValue(resubmitted)
    const { wrapper } = await mountForm('STAFF', REJECTED)
    expect(wrapper.text()).toContain('Perbaiki dan ajukan lagi')
    expect(wrapper.text()).toContain('Nominal tidak sesuai nota')

    await submitForm(wrapper)

    expect(transactionsApi.updateTransaction).toHaveBeenCalledExactlyOnceWith('t-semen', {})
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(resubmitted)
    expect(document.body.textContent).toContain('Transaksi diajukan lagi')
  })

  it('starts clean when reopened after an error', async () => {
    vi.mocked(transactionsApi.updateTransaction).mockRejectedValue(new ApiError(409, 'Transaksi tidak bisa diubah pada status ini'))
    // Tanpa Toast dan ConfirmDialog, supaya props dialognya bisa diubah langsung.
    const { wrapper } = await mountForm('STAFF', PENDING, false)
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
