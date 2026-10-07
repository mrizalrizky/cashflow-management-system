import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import * as accountsApi from '@/api/accounts'
import * as attachmentsApi from '@/api/attachments'
import * as categoriesApi from '@/api/categories'
import { ApiError } from '@/api/http'
import * as projectsApi from '@/api/projects'
import * as transactionsApi from '@/api/transactions'
import type { Role, Transaction } from '@/api/types'
import ProofList from '@/components/ProofList.vue'
import ProofPicker from '@/components/ProofPicker.vue'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import { signInAs } from '@/test/session'
import { KAS, makeAttachment, makeTransaction, MATERIAL, RUMAH } from '@/test/transactions'
import TransactionDetailView from '../TransactionDetailView.vue'
import TransactionFormDialog from '../TransactionFormDialog.vue'

vi.mock('@/api/transactions')
vi.mock('@/api/attachments')
vi.mock('@/api/accounts')
vi.mock('@/api/projects')
vi.mock('@/api/categories')

const PATH = '/transaksi/t-semen'
const CHANGED = 'Transaksi berubah sejak Anda membukanya. Periksa lagi sebelum memproses.'
const PROCESSED = 'Transaksi sudah diproses pengguna lain'
const ACTIONS = ['edit', 'cancel', 'approve', 'reject', 'void'] as const

const WITH_PROOF = makeTransaction({ attachments: [makeAttachment()] })
const REVIEWABLE = makeTransaction({ attachments: [makeAttachment()], permissions: { canReview: true } })

async function mountDetail(role: Role, transaction: Transaction = WITH_PROOF, path = PATH) {
  signInAs(role)
  vi.mocked(transactionsApi.getTransaction).mockResolvedValue(transaction)
  return mountView(TransactionDetailView, { path, withOverlays: true })
}

function button(wrapper: VueWrapper, action: (typeof ACTIONS)[number]) {
  return wrapper.find(`[data-testid="${action}-transaction"]`)
}

async function click(wrapper: VueWrapper, action: (typeof ACTIONS)[number]): Promise<void> {
  await button(wrapper, action).trigger('click')
  await flushPromises()
}

async function acceptConfirm(): Promise<void> {
  document.querySelector<HTMLButtonElement>('.p-confirmdialog-accept-button')!.click()
  await flushPromises()
}

async function giveReason(wrapper: VueWrapper, reason: string): Promise<void> {
  await fill(wrapper, '#reason-text', reason)
  await submitForm(wrapper)
}

function field(wrapper: VueWrapper, id: string): string {
  return wrapper.get(`[data-testid="tx-${id}"]`).text()
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
  vi.mocked(accountsApi.listAccountOptions).mockResolvedValue([KAS])
  vi.mocked(projectsApi.listProjectOptions).mockResolvedValue([RUMAH])
  vi.mocked(categoriesApi.listCategories).mockResolvedValue([MATERIAL])
})

describe('TransactionDetailView', () => {
  it('shows the transaction with its amount, dates and who recorded it', async () => {
    const { wrapper } = await mountDetail('SUPER_ADMIN')

    expect(transactionsApi.getTransaction).toHaveBeenCalledWith('t-semen')
    expect(wrapper.get('h1').text()).toBe('Beli semen')
    expect(field(wrapper, 'type')).toBe('Pengeluaran')
    expect(field(wrapper, 'amount')).toBe('-Rp 150.000')
    expect(field(wrapper, 'date')).toBe('01 Okt 2026')
    expect(field(wrapper, 'account')).toBe('Kas Kecil')
    expect(field(wrapper, 'category')).toBe('Material')
    expect(field(wrapper, 'project')).toBe('PRJ-2026-001 · Rumah Pak Budi')
    expect(field(wrapper, 'created')).toBe('Sari · 01 Okt 2026')
    expect(wrapper.text()).toContain('Menunggu')
    expect(wrapper.find('[data-testid="tx-reviewed"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="back-to-transactions"]').attributes('href')).toBe('/transaksi')
  })

  it('shows who reviewed it, why it was rejected, and who voided it with the reason', async () => {
    const rejected = makeTransaction({
      status: 'REJECTED',
      reviewedBy: { id: 'u-ani', name: 'Ani' },
      reviewedAt: '2026-10-02T04:00:00.000Z',
      rejectReason: 'Nominal tidak sesuai nota',
    })
    const first = await mountDetail('STAFF', rejected)
    expect(field(first.wrapper, 'reviewed')).toBe('Ani · 02 Okt 2026')
    expect(field(first.wrapper, 'reject-reason')).toBe('Nominal tidak sesuai nota')

    freshPinia()
    const voided = makeTransaction({
      status: 'VOID',
      voidedBy: { id: 'u-dewi', name: 'Dewi' },
      voidedAt: '2026-10-03T04:00:00.000Z',
      voidReason: 'Nota ganda',
    })
    const second = await mountDetail('SUPER_ADMIN', voided)
    expect(field(second.wrapper, 'voided')).toBe('Dewi · 03 Okt 2026')
    expect(field(second.wrapper, 'void-reason')).toBe('Nota ganda')
  })

  it('names overhead, and links the project only for those who can open it', async () => {
    const overhead = await mountDetail('STAFF', makeTransaction({ project: null }))
    expect(field(overhead.wrapper, 'project')).toBe('Overhead')

    freshPinia()
    const staff = await mountDetail('STAFF')
    expect(staff.wrapper.get('[data-testid="tx-project"]').find('a').exists()).toBe(false)

    freshPinia()
    const manager = await mountDetail('PROJECT_MANAGER')
    expect(manager.wrapper.get('[data-testid="tx-project"] a').attributes('href')).toBe('/proyek/p-rumah')
  })

  it.each([404, 400])('shows "tidak ditemukan" for a %i, without an error toast', async (status) => {
    signInAs('PROJECT_MANAGER')
    vi.mocked(transactionsApi.getTransaction).mockRejectedValue(new ApiError(status, 'Transaksi tidak ditemukan'))

    const { wrapper } = await mountView(TransactionDetailView, { path: '/transaksi/bukan-id', withOverlays: true })

    expect(wrapper.text()).toContain('Transaksi tidak ditemukan.')
    expect(wrapper.find('[data-testid="retry"]').exists()).toBe(false)
    expect(document.querySelector('.p-toast-message')).toBeNull()
    expect(wrapper.get('[data-testid="back-to-transactions"]').attributes('href')).toBe('/transaksi')
  })

  it('shows another failure with a retry', async () => {
    signInAs('STAFF')
    vi.mocked(transactionsApi.getTransaction).mockRejectedValueOnce(new ApiError(500, 'Terjadi kesalahan pada server'))
    const { wrapper } = await mountView(TransactionDetailView, { path: PATH, withOverlays: true })
    expect(wrapper.text()).toContain('Terjadi kesalahan pada server')

    vi.mocked(transactionsApi.getTransaction).mockResolvedValue(WITH_PROOF)
    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('Beli semen')
  })

  it('loads the other transaction when the address changes', async () => {
    const { wrapper, router } = await mountDetail('STAFF')
    vi.mocked(transactionsApi.getTransaction).mockResolvedValue(makeTransaction({ id: 't-besi', description: 'Beli besi' }))

    await router.push('/transaksi/t-besi')
    await flushPromises()

    expect(transactionsApi.getTransaction).toHaveBeenLastCalledWith('t-besi')
    expect(wrapper.get('h1').text()).toBe('Beli besi')
  })
})

describe('TransactionDetailView: proof', () => {
  const NOTA = new File(['x'], 'nota.jpg', { type: 'image/jpeg' })

  it('lists the proof read-only when it can no longer be changed', async () => {
    const { wrapper } = await mountDetail('STAFF')

    expect(wrapper.findComponent(ProofList).props()).toMatchObject({
      attachments: WITH_PROOF.attachments,
      canRemove: false,
    })
    expect(wrapper.findComponent(ProofPicker).exists()).toBe(false)
  })

  it('warns that a pending expense without proof cannot be approved', async () => {
    const { wrapper } = await mountDetail('STAFF', makeTransaction())
    expect(wrapper.text()).toContain('Pengeluaran ini belum punya bukti dan belum bisa disetujui')

    freshPinia()
    const income = await mountDetail('STAFF', makeTransaction({ type: 'IN' }))
    expect(income.wrapper.text()).not.toContain('belum bisa disetujui')
  })

  it('lets the owner add proof up to what is left of ten, then shows the new list', async () => {
    const mine = makeTransaction({ attachments: [makeAttachment()], permissions: { canAttach: true } })
    const { wrapper } = await mountDetail('STAFF', mine)
    expect(wrapper.findComponent(ProofList).props('canRemove')).toBe(true)
    expect(wrapper.findComponent(ProofPicker).props('max')).toBe(9)
    expect(wrapper.get('[data-testid="upload-proof"]').attributes('disabled')).toBeDefined()

    vi.mocked(attachmentsApi.uploadAttachment).mockResolvedValue(makeAttachment({ id: 'f-dua' }))
    const after = { ...mine, attachments: [makeAttachment(), makeAttachment({ id: 'f-dua', fileName: 'dua.jpg' })] }
    vi.mocked(transactionsApi.getTransaction).mockResolvedValue(after)
    wrapper.findComponent(ProofPicker).vm.$emit('update:modelValue', [NOTA])
    await flushPromises()
    await wrapper.get('[data-testid="upload-proof"]').trigger('click')
    await flushPromises()

    expect(attachmentsApi.uploadAttachment).toHaveBeenCalledExactlyOnceWith('t-semen', NOTA)
    expect(wrapper.findComponent(ProofList).props('attachments')).toHaveLength(2)
    expect(wrapper.findComponent(ProofPicker).props('modelValue')).toEqual([])
    expect(document.body.textContent).toContain('Bukti diunggah')
  })

  it('keeps a file that failed to upload in the picker and says why', async () => {
    const mine = makeTransaction({ permissions: { canAttach: true } })
    const { wrapper } = await mountDetail('STAFF', mine)
    vi.mocked(attachmentsApi.uploadAttachment).mockRejectedValue(new ApiError(400, 'Jenis berkas tidak didukung'))

    wrapper.findComponent(ProofPicker).vm.$emit('update:modelValue', [NOTA])
    await flushPromises()
    await wrapper.get('[data-testid="upload-proof"]').trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('nota.jpg: Jenis berkas tidak didukung')
    expect(wrapper.findComponent(ProofPicker).props('modelValue')).toEqual([NOTA])
  })

  it('reloads after a proof is removed', async () => {
    const mine = makeTransaction({ attachments: [makeAttachment()], permissions: { canAttach: true } })
    const { wrapper } = await mountDetail('STAFF', mine)
    vi.mocked(transactionsApi.getTransaction).mockClear()

    wrapper.findComponent(ProofList).vm.$emit('removed', 'f-nota')
    await flushPromises()

    expect(transactionsApi.getTransaction).toHaveBeenCalledTimes(1)
  })
})

describe('TransactionDetailView: actions', () => {
  it('offers nothing when the API permits nothing', async () => {
    const { wrapper } = await mountDetail('SUPER_ADMIN')

    for (const action of ACTIONS) expect(button(wrapper, action).exists()).toBe(false)
  })

  it.each([
    ['canEdit', ['edit']],
    ['canCancel', ['cancel']],
    ['canReview', ['approve', 'reject']],
    ['canVoid', ['void']],
  ] as const)('offers exactly what %s allows', async (permission, expected) => {
    const { wrapper } = await mountDetail('STAFF', makeTransaction({ permissions: { [permission]: true } }))

    const offered = ACTIONS.filter((action) => button(wrapper, action).exists())
    expect(offered).toEqual(expected)
  })

  it('opens the form to edit, loading its choices only then, and shows what was saved', async () => {
    const { wrapper } = await mountDetail('STAFF', makeTransaction({ permissions: { canEdit: true } }))
    expect(button(wrapper, 'edit').text()).toBe('Ubah')
    expect(accountsApi.listAccountOptions).not.toHaveBeenCalled()

    await click(wrapper, 'edit')
    expect(accountsApi.listAccountOptions).toHaveBeenCalledTimes(1)
    expect(wrapper.find('#tx-amount').exists()).toBe(true)

    wrapper.findComponent(TransactionFormDialog).vm.$emit('saved', makeTransaction({ amount: '90000' }))
    await flushPromises()
    expect(field(wrapper, 'amount')).toBe('-Rp 90.000')
  })

  it('calls editing a rejected transaction fixing and resubmitting', async () => {
    const rejected = makeTransaction({ status: 'REJECTED', rejectReason: 'Buram', permissions: { canEdit: true } })
    const { wrapper } = await mountDetail('STAFF', rejected)

    expect(button(wrapper, 'edit').text()).toBe('Perbaiki dan ajukan lagi')
  })

  it('approves the version on screen after confirmation', async () => {
    const approved = { ...REVIEWABLE, status: 'APPROVED' as const, permissions: WITH_PROOF.permissions }
    vi.mocked(transactionsApi.approveTransaction).mockResolvedValue(approved)
    const { wrapper } = await mountDetail('PROJECT_MANAGER', REVIEWABLE)

    await click(wrapper, 'approve')
    expect(document.body.textContent).toContain('Setujui pengeluaran Rp 150.000 untuk "Beli semen"?')
    expect(transactionsApi.approveTransaction).not.toHaveBeenCalled()
    await acceptConfirm()

    expect(transactionsApi.approveTransaction).toHaveBeenCalledExactlyOnceWith('t-semen', '2026-10-01T03:00:00.000Z')
    expect(wrapper.text()).toContain('Disetujui')
    expect(button(wrapper, 'approve').exists()).toBe(false)
    expect(document.body.textContent).toContain('Transaksi disetujui')
    expect(document.body.textContent).not.toContain('minus')
  })

  it('warns an admin when the approval leaves the account below zero', async () => {
    vi.mocked(transactionsApi.approveTransaction).mockResolvedValue({
      ...REVIEWABLE,
      status: 'APPROVED',
      accountBalance: '-50000',
    })
    const { wrapper } = await mountDetail('SUPER_ADMIN', REVIEWABLE)

    await click(wrapper, 'approve')
    await acceptConfirm()

    expect(document.body.textContent).toContain('Saldo Kas Kecil sekarang minus: -Rp 50.000')
  })

  it('shows why an approval was refused', async () => {
    vi.mocked(transactionsApi.approveTransaction).mockRejectedValue(
      new ApiError(400, 'Pengeluaran wajib punya bukti sebelum disetujui'),
    )
    const { wrapper } = await mountDetail('PROJECT_MANAGER', REVIEWABLE)

    await click(wrapper, 'approve')
    await acceptConfirm()

    expect(document.body.textContent).toContain('Pengeluaran wajib punya bukti sebelum disetujui')
    expect(wrapper.text()).toContain('Menunggu')
  })

  it('approves nothing when the transaction changed meanwhile, and shows the new version', async () => {
    vi.mocked(transactionsApi.approveTransaction).mockRejectedValue(new ApiError(409, CHANGED))
    const { wrapper } = await mountDetail('PROJECT_MANAGER', REVIEWABLE)
    const edited = { ...REVIEWABLE, amount: '9000000', updatedAt: '2026-10-01T05:00:00.000Z' }
    vi.mocked(transactionsApi.getTransaction).mockResolvedValue(edited)

    await click(wrapper, 'approve')
    await acceptConfirm()

    expect(document.body.textContent).toContain(CHANGED)
    expect(field(wrapper, 'amount')).toBe('-Rp 9.000.000')
    expect(wrapper.text()).toContain('Menunggu')
    expect(button(wrapper, 'approve').exists()).toBe(true)
    expect(document.body.textContent).not.toContain('Transaksi disetujui')
  })

  it('says so when someone else already processed it, and follows the fresh permissions', async () => {
    vi.mocked(transactionsApi.rejectTransaction).mockRejectedValue(
      new ApiError(409, 'Transaksi tidak bisa ditolak pada status ini'),
    )
    const { wrapper } = await mountDetail('PROJECT_MANAGER', REVIEWABLE)
    vi.mocked(transactionsApi.getTransaction).mockResolvedValue({ ...WITH_PROOF, status: 'APPROVED' })

    await click(wrapper, 'reject')
    await giveReason(wrapper, 'Nota buram')
    await flushPromises()

    expect(document.body.textContent).toContain(PROCESSED)
    expect(wrapper.text()).toContain('Disetujui')
    expect(button(wrapper, 'reject').exists()).toBe(false)
    expect(wrapper.find('#reason-text').exists()).toBe(false)
  })

  it('rejects with a reason, for the version on screen', async () => {
    const rejected = { ...WITH_PROOF, status: 'REJECTED' as const, rejectReason: 'Nota buram' }
    vi.mocked(transactionsApi.rejectTransaction).mockResolvedValue(rejected)
    const { wrapper } = await mountDetail('PROJECT_MANAGER', REVIEWABLE)

    await click(wrapper, 'reject')
    expect(wrapper.text()).toContain('Tolak transaksi')
    await giveReason(wrapper, '  Nota buram  ')
    await flushPromises()

    expect(transactionsApi.rejectTransaction).toHaveBeenCalledExactlyOnceWith(
      't-semen',
      'Nota buram',
      '2026-10-01T03:00:00.000Z',
    )
    expect(field(wrapper, 'reject-reason')).toBe('Nota buram')
    expect(document.body.textContent).toContain('Transaksi ditolak')
    expect(wrapper.find('#reason-text').exists()).toBe(false)
  })

  it('cancels a pending transaction with a reason', async () => {
    vi.mocked(transactionsApi.cancelTransaction).mockResolvedValue({ ...WITH_PROOF, status: 'VOID' })
    const { wrapper } = await mountDetail('STAFF', makeTransaction({ permissions: { canCancel: true } }))

    await click(wrapper, 'cancel')
    await giveReason(wrapper, 'Salah input')
    await flushPromises()

    expect(transactionsApi.cancelTransaction).toHaveBeenCalledExactlyOnceWith('t-semen', 'Salah input')
    expect(wrapper.text()).toContain('Dibatalkan')
    expect(document.body.textContent).toContain('Transaksi dibatalkan')
  })

  it('voids an approved transaction with a reason', async () => {
    const approved = makeTransaction({ status: 'APPROVED', permissions: { canVoid: true } })
    vi.mocked(transactionsApi.voidTransaction).mockResolvedValue({ ...WITH_PROOF, status: 'VOID' })
    const { wrapper } = await mountDetail('SUPER_ADMIN', approved)

    await click(wrapper, 'void')
    expect(wrapper.text()).not.toContain('kedua sisinya')
    await giveReason(wrapper, 'Nota ganda')
    await flushPromises()

    expect(transactionsApi.voidTransaction).toHaveBeenCalledExactlyOnceWith('t-semen', 'Nota ganda')
    expect(document.body.textContent).toContain('Transaksi di-void')
  })

  it('explains that voiding a transfer leg voids both sides', async () => {
    const leg = makeTransaction({
      status: 'APPROVED',
      project: null,
      isTransfer: true,
      transferGroupId: 'g1',
      permissions: { canVoid: true },
    })
    const { wrapper } = await mountDetail('SUPER_ADMIN', leg)
    expect(wrapper.text()).toContain('Bagian dari transfer antar akun. Void akan membatalkan kedua sisinya.')
    expect(field(wrapper, 'project')).toBe('Transfer antar akun')

    await click(wrapper, 'void')

    expect(wrapper.get('form').text()).toContain('Void akan membatalkan kedua sisinya')
  })

  it('disables every action while one is in flight', async () => {
    vi.mocked(transactionsApi.approveTransaction).mockReturnValue(new Promise(() => undefined))
    const all = makeTransaction({
      attachments: [makeAttachment()],
      permissions: { canEdit: true, canCancel: true, canReview: true },
    })
    const { wrapper } = await mountDetail('SUPER_ADMIN', all)

    await click(wrapper, 'approve')
    await acceptConfirm()

    for (const action of ['edit', 'cancel', 'approve', 'reject'] as const) {
      expect(button(wrapper, action).attributes('disabled')).toBeDefined()
    }
  })
})

describe('ReasonDialog, through the reject action', () => {
  async function openReject() {
    const { wrapper } = await mountDetail('PROJECT_MANAGER', REVIEWABLE)
    await click(wrapper, 'reject')
    return wrapper
  }

  it('requires a reason of at most 500 characters, with a counter', async () => {
    const wrapper = await openReject()

    await giveReason(wrapper, '   ')
    expect(wrapper.get('#reason-text-error').text()).toBe('Alasan penolakan wajib diisi')

    await fill(wrapper, '#reason-text', 'x'.repeat(501))
    expect(wrapper.text()).toContain('501/500')
    await submitForm(wrapper)
    expect(wrapper.get('#reason-text-error').text()).toBe('Alasan penolakan maksimal 500 karakter')
    expect(transactionsApi.rejectTransaction).not.toHaveBeenCalled()
  })

  it('shows an API error inside the dialog and keeps the text', async () => {
    vi.mocked(transactionsApi.rejectTransaction).mockRejectedValue(new ApiError(500, 'Terjadi kesalahan pada server'))
    const wrapper = await openReject()

    await giveReason(wrapper, 'Nota buram')
    await flushPromises()

    expect(wrapper.get('form').text()).toContain('Terjadi kesalahan pada server')
    expect((wrapper.get('#reason-text').element as HTMLTextAreaElement).value).toBe('Nota buram')
  })

  it('sends one request however often it is submitted, and starts empty next time', async () => {
    let finish!: (tx: Transaction) => void
    vi.mocked(transactionsApi.rejectTransaction).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const wrapper = await openReject()

    await giveReason(wrapper, 'Nota buram')
    await submitForm(wrapper)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    finish({ ...REVIEWABLE, status: 'PENDING' })
    await flushPromises()
    expect(transactionsApi.rejectTransaction).toHaveBeenCalledTimes(1)

    await click(wrapper, 'reject')
    expect((wrapper.get('#reason-text').element as HTMLTextAreaElement).value).toBe('')
  })
})
