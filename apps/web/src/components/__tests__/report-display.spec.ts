import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as http from '@/api/http'
import { getCompanyDashboard, getProjectSummary } from '@/api/reports'
import { mountView } from '@/test/mount'
import BarList from '../BarList.vue'
import MoneyText from '../MoneyText.vue'
import StatCard from '../StatCard.vue'

vi.mock('@/api/http')

const RED = 'text-red-600'

describe('report API module', () => {
  const request = vi.mocked(http.request)

  beforeEach(() => {
    vi.resetAllMocks()
    request.mockResolvedValue({})
  })

  it('asks for the dashboard with whatever part of the period is given', async () => {
    await getCompanyDashboard()
    await getCompanyDashboard({ from: '2026-10-01', to: '2026-10-07' })
    await getCompanyDashboard({ to: '2026-10-07' })

    expect(request.mock.calls).toEqual([
      ['/dashboard/company', { query: {} }],
      ['/dashboard/company', { query: { from: '2026-10-01', to: '2026-10-07' } }],
      ['/dashboard/company', { query: { to: '2026-10-07' } }],
    ])
  })

  it('asks for the summary of one project', async () => {
    await getProjectSummary('p1')

    expect(request).toHaveBeenCalledExactlyOnceWith('/projects/p1/summary')
  })
})

describe('MoneyText', () => {
  async function render(props: { amount: string; signed?: boolean }) {
    const { wrapper } = await mountView(MoneyText, { props })
    return wrapper.get('span')
  }

  it('shows a positive amount plainly', async () => {
    const span = await render({ amount: '1250000' })

    expect(span.text()).toBe('Rp 1.250.000')
    expect(span.classes()).not.toContain(RED)
  })

  it('shows a negative amount with its minus sign, in red', async () => {
    const span = await render({ amount: '-500000' })

    expect(span.text()).toBe('-Rp 500.000')
    expect(span.classes()).toContain(RED)
  })

  it('shows zero plainly', async () => {
    const span = await render({ amount: '0' })

    expect(span.text()).toBe('Rp 0')
    expect(span.classes()).not.toContain(RED)
  })

  it('can mark a gain with a plus sign', async () => {
    expect((await render({ amount: '500000', signed: true })).text()).toBe('+Rp 500.000')
    expect((await render({ amount: '-500000', signed: true })).text()).toBe('-Rp 500.000')
    expect((await render({ amount: '0', signed: true })).text()).toBe('Rp 0')
  })
})

describe('StatCard', () => {
  it('shows its label, amount and hint', async () => {
    const { wrapper } = await mountView(StatCard, {
      props: { label: 'Total saldo', amount: '14000000', hint: 'Semua akun' },
    })

    expect(wrapper.text()).toContain('Total saldo')
    expect(wrapper.text()).toContain('Rp 14.000.000')
    expect(wrapper.text()).toContain('Semua akun')
  })

  it.each([
    ['income', 'text-green-700'],
    ['expense', 'text-red-700'],
  ] as const)('colours a positive %s amount', async (tone, colour) => {
    const { wrapper } = await mountView(StatCard, { props: { label: 'x', amount: '5', tone } })

    expect(wrapper.get('[data-testid="stat-amount"]').classes()).toContain(colour)
  })

  it('shows a negative amount in red whatever its tone', async () => {
    const { wrapper } = await mountView(StatCard, { props: { label: 'Selisih', amount: '-7000000', tone: 'income' } })

    const amount = wrapper.get('[data-testid="stat-amount"]')
    expect(amount.text()).toBe('-Rp 7.000.000')
    expect(amount.classes()).not.toContain('text-green-700')
    expect(amount.get('span').classes()).toContain(RED)
  })
})

describe('BarList', () => {
  const ITEMS = [
    { id: 'c1', name: 'Material', amount: '40000000' },
    { id: 'c2', name: 'Upah', amount: '10000000' },
    { id: 'c3', name: 'Parkir', amount: '2000' },
    { id: 'c4', name: 'Lain-lain', amount: '0' },
  ]

  async function render(items = ITEMS) {
    const { wrapper } = await mountView(BarList, { props: { items, emptyText: 'Belum ada pengeluaran' } })
    return wrapper
  }

  function widths(wrapper: Awaited<ReturnType<typeof render>>): (string | null)[] {
    return wrapper.findAll('li').map((li) => {
      const bar = li.find('[data-testid="bar"]')
      return bar.exists() ? (bar.element as HTMLElement).style.width : null
    })
  }

  it('lists the items in the given order with their amounts', async () => {
    const wrapper = await render()

    const rows = wrapper.findAll('li').map((li) => li.text())
    expect(rows[0]).toContain('Material')
    expect(rows[0]).toContain('Rp 40.000.000')
    expect(rows[1]).toContain('Upah')
    expect(rows[3]).toContain('Rp 0')
  })

  it('sizes each bar against the largest, keeps a sliver for a tiny amount, and draws none for zero', async () => {
    const wrapper = await render()

    expect(widths(wrapper)).toEqual(['100%', '25%', '1%', null])
    expect(wrapper.get('[data-testid="bar"]').attributes('aria-hidden')).toBe('true')
  })

  it('labels amounts beyond 2^53 exactly', async () => {
    const wrapper = await render([
      { id: 'a', name: 'Besar', amount: '18014398509481986' },
      { id: 'b', name: 'Separuh', amount: '9007199254740993' },
    ])

    expect(wrapper.text()).toContain('Rp 18.014.398.509.481.986')
    expect(widths(wrapper)).toEqual(['100%', '50%'])
  })

  it('says so when there is nothing to list', async () => {
    const wrapper = await render([])

    expect(wrapper.text()).toBe('Belum ada pengeluaran')
    expect(wrapper.find('li').exists()).toBe(false)
  })
})
