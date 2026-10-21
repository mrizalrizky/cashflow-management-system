import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import * as accountsApi from '@/api/accounts'
import { ApiError } from '@/api/http'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import { makeTransaction } from '@/test/transactions'
import ReconcileDialog from '../ReconcileDialog.vue'

vi.mock('@/api/accounts')

const ACCOUNT = { id: 'a-bca', name: 'BCA', balance: '850000' }
const onReconciled = vi.fn<() => void>()

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
})

function mountDialog() {
  return mountView(ReconcileDialog, {
    props: { visible: true, account: ACCOUNT, onReconciled },
    withOverlays: true,
  })
}

describe('ReconcileDialog', () => {
  it('shows the recorded balance and, while typing, what will be recorded', async () => {
    const { wrapper } = await mountDialog()
    expect(wrapper.get('[data-testid="recorded-balance"]').text()).toContain('Rp 850.000')

    await fill(wrapper, '#actual-balance', '700000')
    expect(wrapper.get('[data-testid="reconcile-preview"]').text()).toBe(
      'Selisih -Rp 150.000, dicatat sebagai Selisih keluar.',
    )

    await fill(wrapper, '#actual-balance', '900000')
    expect(wrapper.get('[data-testid="reconcile-preview"]').text()).toBe(
      'Selisih +Rp 50.000, dicatat sebagai Selisih masuk.',
    )

    await fill(wrapper, '#actual-balance', '850000')
    expect(wrapper.get('[data-testid="reconcile-preview"]').text()).toBe('Saldo sudah cocok; tidak ada yang dicatat.')
  })

  it('sends the actual balance and description, then reports the adjustment', async () => {
    const adjustment = makeTransaction({ isAdjustment: true, type: 'OUT', amount: '150000' })
    vi.mocked(accountsApi.reconcileAccount).mockResolvedValue({
      previousBalance: '850000',
      actualBalance: '700000',
      difference: '-150000',
      transaction: adjustment,
    })
    const { wrapper } = await mountDialog()

    await fill(wrapper, '#actual-balance', '700000')
    await fill(wrapper, '#reconcile-description', ' Lupa catat parkir ')
    await submitForm(wrapper)

    expect(accountsApi.reconcileAccount).toHaveBeenCalledWith('a-bca', {
      actualBalance: '700000',
      description: 'Lupa catat parkir',
    })
    expect(onReconciled).toHaveBeenCalledOnce()
    expect(document.body.textContent).toContain('Selisih -Rp 150.000 dicatat. Saldo BCA sekarang Rp 700.000.')
  })

  it('says so when nothing needed recording', async () => {
    vi.mocked(accountsApi.reconcileAccount).mockResolvedValue({
      previousBalance: '850000',
      actualBalance: '850000',
      difference: '0',
      transaction: null,
    })
    const { wrapper } = await mountDialog()
    await fill(wrapper, '#actual-balance', '850000')
    await submitForm(wrapper)
    expect(document.body.textContent).toContain('Saldo BCA sudah cocok.')
  })

  it('accepts a negative balance, and asks for one before sending', async () => {
    const { wrapper } = await mountDialog()
    await submitForm(wrapper)
    expect(wrapper.get('#actual-balance-error').text()).toContain('wajib diisi')
    expect(accountsApi.reconcileAccount).not.toHaveBeenCalled()

    await fill(wrapper, '#actual-balance', '-20000')
    expect(wrapper.get('[data-testid="reconcile-preview"]').text()).toBe(
      'Selisih -Rp 870.000, dicatat sebagai Selisih keluar.',
    )
  })

  it('shows why the API refused', async () => {
    vi.mocked(accountsApi.reconcileAccount).mockRejectedValue(new ApiError(400, 'Akun sudah tidak aktif'))
    const { wrapper } = await mountDialog()
    await fill(wrapper, '#actual-balance', '1')
    await submitForm(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('Akun sudah tidak aktif')
    expect(onReconciled).not.toHaveBeenCalled()
  })
})
