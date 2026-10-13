import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import * as accountsApi from '@/api/accounts'
import * as attachmentsApi from '@/api/attachments'
import * as categoriesApi from '@/api/categories'
import { ApiError } from '@/api/http'
import * as transactionsApi from '@/api/transactions'
import type { Transaction } from '@/api/types'
import ProofList from '@/components/ProofList.vue'
import ProofPicker from '@/components/ProofPicker.vue'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import { signIn } from '@/test/session'
import { KAS, makeAttachment, makeTransaction, MATERIAL } from '@/test/transactions'
import TransactionDetailView from '../TransactionDetailView.vue'
import TransactionFormDialog from '../TransactionFormDialog.vue'

vi.mock('@/api/transactions')
vi.mock('@/api/attachments')
vi.mock('@/api/accounts')
vi.mock('@/api/categories')

const PATH = '/transaksi/t-semen'
const ACTIONS = ['edit', 'void'] as const

const WITH_PROOF = makeTransaction({ attachments: [makeAttachment()] })
const VOIDABLE = makeTransaction({ attachments: [makeAttachment()], permissions: { canVoid: true } })

async function mountDetail(transaction: Transaction = WITH_PROOF, path = PATH) {
  signIn()
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
  vi.mocked(categoriesApi.listCategories).mockResolvedValue([MATERIAL])
})

describe('TransactionDetailView', () => {
  it('shows the transaction with its amount, dates and who recorded it', async () => {
    const { wrapper } = await mountDetail()

    expect(transactionsApi.getTransaction).toHaveBeenCalledWith('t-semen')
    expect(wrapper.get('h1').text()).toBe('Beli semen')
    expect(field(wrapper, 'type')).toBe('Pengeluaran')
    expect(field(wrapper, 'amount')).toBe('-Rp 150.000')
    expect(field(wrapper, 'date')).toBe('01 Okt 2026')
    expect(field(wrapper, 'account')).toBe('Kas Kecil')
    expect(field(wrapper, 'category')).toBe('Material')
    expect(wrapper.find('[data-testid="tx-project"]').exists()).toBe(false)
    expect(field(wrapper, 'created')).toBe('Sari · 01 Okt 2026')
    expect(wrapper.text()).toContain('Tercatat')
    expect(wrapper.get('[data-testid="back-to-transactions"]').attributes('href')).toBe('/transaksi')
  })

  it('shows who voided it, with the reason', async () => {
    const voided = makeTransaction({
      status: 'VOID',
      voidedBy: { id: 'u-dewi', name: 'Dewi' },
      voidedAt: '2026-10-03T04:00:00.000Z',
      voidReason: 'Nota ganda',
    })
    const { wrapper } = await mountDetail(voided)
    expect(field(wrapper, 'voided')).toBe('Dewi · 03 Okt 2026')
    expect(field(wrapper, 'void-reason')).toBe('Nota ganda')
    expect(wrapper.find('[data-testid="tx-reviewed"]').exists()).toBe(false)
  })

  it('links to the history of this transaction', async () => {
    const { wrapper } = await mountDetail()
    expect(wrapper.get('[data-testid="transaction-history"]').attributes('href')).toBe(
      '/pengaturan/audit-log?entityType=transaction&entityId=t-semen',
    )
  })

  it.each([404, 400])('shows "tidak ditemukan" for a %i, without an error toast', async (status) => {
    signIn()
    vi.mocked(transactionsApi.getTransaction).mockRejectedValue(new ApiError(status, 'Transaksi tidak ditemukan'))

    const { wrapper } = await mountView(TransactionDetailView, { path: '/transaksi/bukan-id', withOverlays: true })

    expect(wrapper.text()).toContain('Transaksi tidak ditemukan.')
    expect(wrapper.find('[data-testid="retry"]').exists()).toBe(false)
    expect(document.querySelector('.p-toast-message')).toBeNull()
    expect(wrapper.get('[data-testid="back-to-transactions"]').attributes('href')).toBe('/transaksi')
  })

  it('shows another failure with a retry', async () => {
    signIn()
    vi.mocked(transactionsApi.getTransaction).mockRejectedValueOnce(new ApiError(500, 'Terjadi kesalahan pada server'))
    const { wrapper } = await mountView(TransactionDetailView, { path: PATH, withOverlays: true })
    expect(wrapper.text()).toContain('Terjadi kesalahan pada server')

    vi.mocked(transactionsApi.getTransaction).mockResolvedValue(WITH_PROOF)
    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('Beli semen')
  })

  it('loads the other transaction when the address changes', async () => {
    const { wrapper, router } = await mountDetail()
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
    const { wrapper } = await mountDetail()

    expect(wrapper.findComponent(ProofList).props()).toMatchObject({
      attachments: WITH_PROOF.attachments,
      canRemove: false,
    })
    expect(wrapper.findComponent(ProofPicker).exists()).toBe(false)
  })

  it('lets the owner add proof up to what is left of ten, then shows the new list', async () => {
    const mine = makeTransaction({ attachments: [makeAttachment()], permissions: { canAttach: true } })
    const { wrapper } = await mountDetail(mine)
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
    const { wrapper } = await mountDetail(mine)
    vi.mocked(attachmentsApi.uploadAttachment).mockRejectedValue(new ApiError(400, 'Jenis berkas tidak didukung'))

    wrapper.findComponent(ProofPicker).vm.$emit('update:modelValue', [NOTA])
    await flushPromises()
    await wrapper.get('[data-testid="upload-proof"]').trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('nota.jpg: Jenis berkas tidak didukung')
    expect(wrapper.findComponent(ProofPicker).props('modelValue')).toEqual([NOTA])
  })

  it('says so when the latest version cannot be loaded after a change, and can try again', async () => {
    const mine = makeTransaction({ permissions: { canAttach: true } })
    const { wrapper } = await mountDetail(mine)
    vi.mocked(attachmentsApi.uploadAttachment).mockResolvedValue(makeAttachment())
    vi.mocked(transactionsApi.getTransaction).mockRejectedValueOnce(new ApiError(0, 'Tidak dapat terhubung ke server'))

    wrapper.findComponent(ProofPicker).vm.$emit('update:modelValue', [NOTA])
    await flushPromises()
    await wrapper.get('[data-testid="upload-proof"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('Beli semen')
    expect(wrapper.text()).toContain('Data terbaru gagal dimuat: Tidak dapat terhubung ke server')

    vi.mocked(transactionsApi.getTransaction).mockResolvedValue({ ...mine, attachments: [makeAttachment()] })
    await wrapper.get('[data-testid="retry-reload"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('Data terbaru gagal dimuat')
    expect(wrapper.findComponent(ProofList).props('attachments')).toHaveLength(1)
  })

  it('reloads after a proof is removed', async () => {
    const mine = makeTransaction({ attachments: [makeAttachment()], permissions: { canAttach: true } })
    const { wrapper } = await mountDetail(mine)
    vi.mocked(transactionsApi.getTransaction).mockClear()

    wrapper.findComponent(ProofList).vm.$emit('removed', 'f-nota')
    await flushPromises()

    expect(transactionsApi.getTransaction).toHaveBeenCalledTimes(1)
  })
})

describe('TransactionDetailView: actions', () => {
  it('offers nothing when the API permits nothing', async () => {
    const { wrapper } = await mountDetail()

    for (const action of ACTIONS) expect(button(wrapper, action).exists()).toBe(false)
  })

  it.each([
    ['canEdit', ['edit']],
    ['canVoid', ['void']],
  ] as const)('offers exactly what %s allows', async (permission, expected) => {
    const { wrapper } = await mountDetail(makeTransaction({ permissions: { [permission]: true } }))

    const offered = ACTIONS.filter((action) => button(wrapper, action).exists())
    expect(offered).toEqual(expected)
  })

  it('opens the form to edit, loading its choices only then, and shows what was saved', async () => {
    const { wrapper } = await mountDetail(makeTransaction({ permissions: { canEdit: true } }))
    expect(button(wrapper, 'edit').text()).toBe('Ubah')
    expect(accountsApi.listAccountOptions).not.toHaveBeenCalled()

    await click(wrapper, 'edit')
    expect(accountsApi.listAccountOptions).toHaveBeenCalledTimes(1)
    expect(wrapper.find('#tx-amount').exists()).toBe(true)

    wrapper.findComponent(TransactionFormDialog).vm.$emit('saved', makeTransaction({ amount: '90000' }))
    await flushPromises()
    expect(field(wrapper, 'amount')).toBe('-Rp 90.000')
  })

  it('voids a recorded transaction with a reason', async () => {
    const approved = makeTransaction({ status: 'APPROVED', permissions: { canVoid: true } })
    vi.mocked(transactionsApi.voidTransaction).mockResolvedValue({ ...WITH_PROOF, status: 'VOID' })
    const { wrapper } = await mountDetail(approved)

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
      isTransfer: true,
      transferGroupId: 'g1',
      permissions: { canVoid: true },
    })
    const { wrapper } = await mountDetail(leg)
    expect(wrapper.text()).toContain('Bagian dari transfer antar akun. Void akan membatalkan kedua sisinya.')
    expect(field(wrapper, 'transfer')).toBe('Transfer antar akun')

    await click(wrapper, 'void')

    expect(wrapper.get('form').text()).toContain('Void akan membatalkan kedua sisinya')
  })

  it('disables every action while one is in flight', async () => {
    vi.mocked(transactionsApi.voidTransaction).mockReturnValue(new Promise(() => undefined))
    const all = makeTransaction({ attachments: [makeAttachment()], permissions: { canEdit: true, canVoid: true } })
    const { wrapper } = await mountDetail(all)

    await click(wrapper, 'void')
    await giveReason(wrapper, 'Nota ganda')

    for (const action of ACTIONS) {
      expect(button(wrapper, action).attributes('disabled')).toBeDefined()
    }
  })
})

describe('ReasonDialog, through the void action', () => {
  async function openVoid() {
    const { wrapper } = await mountDetail(VOIDABLE)
    await click(wrapper, 'void')
    return wrapper
  }

  it('requires a reason of at most 500 characters, with a counter', async () => {
    const wrapper = await openVoid()

    await giveReason(wrapper, '   ')
    expect(wrapper.get('#reason-text-error').text()).toBe('Alasan void wajib diisi')

    await fill(wrapper, '#reason-text', 'x'.repeat(501))
    expect(wrapper.text()).toContain('501/500')
    await submitForm(wrapper)
    expect(wrapper.get('#reason-text-error').text()).toBe('Alasan void maksimal 500 karakter')
    expect(transactionsApi.voidTransaction).not.toHaveBeenCalled()
  })

  it('shows an API error inside the dialog and keeps the text', async () => {
    vi.mocked(transactionsApi.voidTransaction).mockRejectedValue(new ApiError(500, 'Terjadi kesalahan pada server'))
    const wrapper = await openVoid()

    await giveReason(wrapper, 'Nota buram')
    await flushPromises()

    expect(wrapper.get('form').text()).toContain('Terjadi kesalahan pada server')
    expect((wrapper.get('#reason-text').element as HTMLTextAreaElement).value).toBe('Nota buram')
  })

  it('sends one request however often it is submitted, and starts empty next time', async () => {
    let finish!: (tx: Transaction) => void
    vi.mocked(transactionsApi.voidTransaction).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const wrapper = await openVoid()

    await giveReason(wrapper, 'Nota buram')
    await submitForm(wrapper)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    finish(VOIDABLE)
    await flushPromises()
    expect(transactionsApi.voidTransaction).toHaveBeenCalledTimes(1)

    await click(wrapper, 'void')
    expect((wrapper.get('#reason-text').element as HTMLTextAreaElement).value).toBe('')
  })
})
