import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import * as installmentsApi from '@/api/installments'
import type { Installment, InstallmentList } from '@/api/types'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import { signIn } from '@/test/session'
import { makeTransaction } from '@/test/transactions'
import InstallmentDetailView from '../InstallmentDetailView.vue'
import InstallmentsView from '../InstallmentsView.vue'

vi.mock('@/api/installments')

function makeInstallment(overrides: Partial<Installment> = {}): Installment {
  return {
    id: 'i-motor',
    name: 'Motor',
    monthlyAmount: '1500000',
    startMonth: '2026-08',
    endMonth: '2026-10',
    months: 3,
    paid: 1,
    due: 3,
    behindMonths: 2,
    status: 'BEHIND',
    notes: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

const LIST: InstallmentList = {
  items: [
    makeInstallment(),
    makeInstallment({ id: 'i-hp', name: 'HP', paid: 1, months: 1, status: 'PAID_OFF', behindMonths: 0 }),
  ],
  summary: {
    month: '2026-10',
    activeMonthlyTotal: '2300000',
    unpaid: [{ id: 'i-motor', name: 'Motor', months: 2, amount: '3000000' }],
    unpaidTotal: '3000000',
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
  signIn()
  vi.mocked(installmentsApi.listInstallments).mockResolvedValue(LIST)
})

describe('InstallmentsView', () => {
  it('shows the monthly total, what is unpaid this month, and each installment with its progress', async () => {
    const { wrapper } = await mountView(InstallmentsView, { path: '/cicilan', withOverlays: true })

    expect(wrapper.get('[data-testid="stat-active-monthly"]').text()).toContain('Rp 2.300.000')
    expect(wrapper.get('[data-testid="stat-unpaid"]').text()).toContain('Rp 3.000.000')
    expect(wrapper.get('[data-testid="unpaid-list"]').text()).toContain('Motor: 2 bulan, Rp 3.000.000')
    const motor = wrapper.get('[data-testid="installment-i-motor"]')
    expect(motor.text()).toContain('Rp 1.500.000')
    expect(motor.text()).toContain('Agu 2026 – Okt 2026')
    expect(motor.text()).toContain('1/3')
    expect(motor.text()).toContain('Tertinggal')
    expect(motor.find('a[href="/cicilan/i-motor"]').text()).toBe('Motor')
  })

  it('says when nothing is behind', async () => {
    vi.mocked(installmentsApi.listInstallments).mockResolvedValue({
      items: [],
      summary: { month: '2026-10', activeMonthlyTotal: '0', unpaid: [], unpaidTotal: '0' },
    })
    const { wrapper } = await mountView(InstallmentsView, { path: '/cicilan', withOverlays: true })
    expect(wrapper.get('[data-testid="stat-unpaid"]').text()).toContain('Semua cicilan sudah dibayar sampai bulan ini')
    expect(wrapper.text()).toContain('Belum ada cicilan')
  })

  it('asks the API for active installments first', async () => {
    await mountView(InstallmentsView, { path: '/cicilan', withOverlays: true })
    expect(installmentsApi.listInstallments).toHaveBeenLastCalledWith({ status: 'ACTIVE' })
  })

  it('creates an installment, showing its end month while typing', async () => {
    vi.mocked(installmentsApi.createInstallment).mockResolvedValue(makeInstallment())
    const { wrapper } = await mountView(InstallmentsView, { path: '/cicilan', withOverlays: true })

    await wrapper.get('[data-testid="add-installment"]').trigger('click')
    await fill(wrapper, '#installment-name', 'Laptop')
    await fill(wrapper, '#installment-amount', '800000')
    wrapper.findComponent({ name: 'MonthField' }).vm.$emit('update:modelValue', '2026-11')
    await fill(wrapper, '#installment-months', '12')
    await flushPromises()
    expect(wrapper.get('[data-testid="installment-end"]').text()).toContain('Okt 2027')

    await submitForm(wrapper)
    expect(installmentsApi.createInstallment).toHaveBeenCalledWith({
      name: 'Laptop',
      monthlyAmount: '800000',
      startMonth: '2026-11',
      months: 12,
      notes: null,
    })
  })

  it('refuses months outside 1 to 120 before sending', async () => {
    const { wrapper } = await mountView(InstallmentsView, { path: '/cicilan', withOverlays: true })
    await wrapper.get('[data-testid="add-installment"]').trigger('click')
    await fill(wrapper, '#installment-months', '121')
    await submitForm(wrapper)
    expect(wrapper.get('#installment-months-error').text()).toBe('Jumlah bulan 1 sampai 120')
    expect(installmentsApi.createInstallment).not.toHaveBeenCalled()
  })
})

describe('InstallmentDetailView', () => {
  it('shows the installment and its linked transactions, and offers delete only without any', async () => {
    vi.mocked(installmentsApi.getInstallment).mockResolvedValue({
      ...makeInstallment(),
      transactions: [makeTransaction({ id: 't-1', description: 'Bayar motor Agu' })],
    })
    const { wrapper } = await mountView(InstallmentDetailView, { path: '/cicilan/i-motor', withOverlays: true })

    expect(installmentsApi.getInstallment).toHaveBeenCalledWith('i-motor')
    expect(wrapper.get('h1').text()).toBe('Motor')
    expect(wrapper.get('a[href="/transaksi/t-1"]').text()).toBe('Bayar motor Agu')
    expect(wrapper.find('[data-testid="delete-installment"]').exists()).toBe(false)
  })

  it('deletes an installment without transactions after confirming', async () => {
    vi.mocked(installmentsApi.getInstallment).mockResolvedValue({ ...makeInstallment({ paid: 0 }), transactions: [] })
    vi.mocked(installmentsApi.deleteInstallment).mockResolvedValue(undefined)
    const { wrapper, router } = await mountView(InstallmentDetailView, { path: '/cicilan/i-motor', withOverlays: true })

    await wrapper.get('[data-testid="delete-installment"]').trigger('click')
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.p-confirmdialog-accept-button')!.click()
    await flushPromises()

    expect(installmentsApi.deleteInstallment).toHaveBeenCalledWith('i-motor')
    expect(router.currentRoute.value.path).toBe('/cicilan')
  })

  it('says when the installment does not exist', async () => {
    const { ApiError } = await import('@/api/http')
    vi.mocked(installmentsApi.getInstallment).mockRejectedValue(new ApiError(404, 'Cicilan tidak ditemukan'))
    const { wrapper } = await mountView(InstallmentDetailView, { path: '/cicilan/i-x', withOverlays: true })
    expect(wrapper.text()).toContain('Cicilan tidak ditemukan')
  })
})
