import { describe, expect, it } from 'vitest'
import type { DOMWrapper } from '@vue/test-utils'
import type { Cashflow } from '@/api/types'
import { mountView } from '@/test/mount'
import MonthlyCashflowChart from '../MonthlyCashflowChart.vue'

type Month = Cashflow & { month: string }

const MONTHS: Month[] = [
  { month: '2026-08', income: '30000000', expense: '17000000', net: '13000000' },
  { month: '2026-09', income: '0', expense: '31000000', net: '-31000000' },
  { month: '2026-10', income: '25000000', expense: '3500000', net: '21500000' },
  { month: '2026-11', income: '0', expense: '0', net: '0' },
]

async function render(months: Month[] = MONTHS) {
  const { wrapper } = await mountView(MonthlyCashflowChart, { props: { months } })
  return wrapper
}

function height(column: DOMWrapper<Element>, kind: 'income' | 'expense'): string | null {
  const bar = column.find(`[data-testid="bar-${kind}"]`)
  return bar.exists() ? (bar.element as HTMLElement).style.height : null
}

describe('MonthlyCashflowChart', () => {
  it('draws one labelled column per month, in order', async () => {
    const wrapper = await render()

    expect(wrapper.find('[role="list"]').exists()).toBe(true)
    const labels = wrapper.findAll('[data-testid="month-label"]').map((label) => label.text())
    expect(labels).toEqual(['Agu 2026', 'Sep 2026', 'Okt 2026', 'Nov 2026'])
  })

  it('sizes every bar against the largest single figure in the chart', async () => {
    const columns = (await render()).findAll('li')

    // Yang terbesar adalah pengeluaran September, 31.000.000.
    expect(height(columns[1]!, 'expense')).toBe('100%')
    expect(height(columns[0]!, 'income')).toBe('96.77%')
    expect(height(columns[0]!, 'expense')).toBe('54.83%')
    expect(height(columns[2]!, 'expense')).toBe('11.29%')
  })

  it('draws no bar for a zero figure but keeps the month', async () => {
    const columns = (await render()).findAll('li')

    expect(height(columns[1]!, 'income')).toBeNull()
    expect(height(columns[3]!, 'income')).toBeNull()
    expect(height(columns[3]!, 'expense')).toBeNull()
    expect(columns[3]!.get('[data-testid="month-label"]').text()).toBe('Nov 2026')
  })

  it('states each month in words, and shows the net with its sign', async () => {
    const columns = (await render()).findAll('li')

    expect(columns[0]!.attributes('aria-label')).toBe(
      'Agu 2026: masuk Rp 30.000.000, keluar Rp 17.000.000, selisih Rp 13.000.000',
    )
    expect(columns[0]!.attributes('title')).toBe(columns[0]!.attributes('aria-label'))
    expect(columns[1]!.attributes('aria-label')).toContain('selisih -Rp 31.000.000')

    const net = columns[1]!.get('[data-testid="month-net"]')
    expect(net.text()).toBe('-Rp 31.000.000')
    expect(net.get('span').classes()).toContain('text-red-600')
    expect(columns[0]!.get('[data-testid="month-net"]').text()).toBe('+Rp 13.000.000')
  })

  it('explains the two bars in words', async () => {
    const legend = (await render()).get('[data-testid="legend"]').text()

    expect(legend).toContain('Masuk')
    expect(legend).toContain('Keluar')
  })

  it('says so instead of drawing empty axes when nothing happened', async () => {
    const wrapper = await render([
      { month: '2026-10', income: '0', expense: '0', net: '0' },
      { month: '2026-11', income: '0', expense: '0', net: '0' },
    ])

    expect(wrapper.text()).toBe('Belum ada transaksi yang disetujui pada periode ini')
    expect(wrapper.find('li').exists()).toBe(false)

    expect((await render([])).text()).toBe('Belum ada transaksi yang disetujui pada periode ini')
  })

  it('keeps columns readable for a long period by scrolling inside its own box', async () => {
    const months = Array.from({ length: 24 }, (_unused, i) => ({
      month: `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
      income: '1000',
      expense: '500',
      net: '500',
    }))
    const wrapper = await render(months)

    expect(wrapper.findAll('li')).toHaveLength(24)
    expect(wrapper.get('[data-testid="chart-scroll"]').classes()).toContain('overflow-x-auto')
    expect(wrapper.get('li').classes()).toContain('min-w-20')
  })

  it('stays exact for amounts beyond 2^53', async () => {
    const columns = (
      await render([
        { month: '2026-09', income: '18014398509481986', expense: '0', net: '18014398509481986' },
        { month: '2026-10', income: '9007199254740993', expense: '0', net: '9007199254740993' },
      ])
    ).findAll('li')

    expect(height(columns[0]!, 'income')).toBe('100%')
    expect(height(columns[1]!, 'income')).toBe('50%')
    expect(columns[1]!.attributes('aria-label')).toContain('masuk Rp 9.007.199.254.740.993')
  })
})
