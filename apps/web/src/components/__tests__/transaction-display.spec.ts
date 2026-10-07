import { describe, expect, it } from 'vitest'
import { mountView } from '@/test/mount'
import type { TxStatus } from '@/api/types'
import SignedAmount from '../SignedAmount.vue'
import TransactionStatusTag from '../TransactionStatusTag.vue'

describe('TransactionStatusTag', () => {
  it.each<[TxStatus, string, string]>([
    ['PENDING', 'Menunggu', 'warn'],
    ['APPROVED', 'Disetujui', 'success'],
    ['REJECTED', 'Ditolak', 'danger'],
    ['VOID', 'Dibatalkan', 'secondary'],
  ])('shows %s as "%s"', async (status, label, severity) => {
    const { wrapper } = await mountView(TransactionStatusTag, { props: { status } })

    expect(wrapper.text()).toBe(label)
    expect(wrapper.get('.p-tag').classes()).toContain(`p-tag-${severity}`)
  })
})

describe('SignedAmount', () => {
  it('shows income with a plus sign, in green', async () => {
    const { wrapper } = await mountView(SignedAmount, { props: { type: 'IN', amount: '500000' } })

    expect(wrapper.text()).toBe('+Rp 500.000')
    expect(wrapper.get('span').classes()).toContain('text-green-700')
  })

  it('shows an expense with a minus sign, in red', async () => {
    const { wrapper } = await mountView(SignedAmount, { props: { type: 'OUT', amount: '150000' } })

    expect(wrapper.text()).toBe('-Rp 150.000')
    expect(wrapper.get('span').classes()).toContain('text-red-700')
  })

  it('mutes an amount that is not counted in any balance, and says why', async () => {
    const { wrapper } = await mountView(SignedAmount, {
      props: { type: 'OUT', amount: '150000', counted: false },
    })

    const span = wrapper.get('span')
    expect(span.text()).toBe('-Rp 150.000')
    expect(span.classes()).toContain('text-surface-500')
    expect(span.classes()).not.toContain('text-red-700')
    expect(span.attributes('title')).toBe('Belum dihitung dalam saldo')
  })
})
