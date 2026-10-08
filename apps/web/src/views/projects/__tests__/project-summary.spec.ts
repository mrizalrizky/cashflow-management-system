import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import * as accountsApi from '@/api/accounts'
import * as categoriesApi from '@/api/categories'
import { ApiError } from '@/api/http'
import * as projectsApi from '@/api/projects'
import * as reportsApi from '@/api/reports'
import * as transactionsApi from '@/api/transactions'
import type { Project, ProjectSummary } from '@/api/types'
import * as usersApi from '@/api/users'
import BarList from '@/components/BarList.vue'
import { freshPinia, mountView } from '@/test/mount'
import { signInAs } from '@/test/session'
import { KAFE, makeTransaction, pageOf, RUMAH } from '@/test/transactions'
import TransactionFormDialog from '@/views/transactions/TransactionFormDialog.vue'
import ProjectDetailView from '../ProjectDetailView.vue'
import ProjectFormDialog from '../ProjectFormDialog.vue'
import ProjectSummaryPanel from '../ProjectSummaryPanel.vue'

vi.mock('@/api/projects')
vi.mock('@/api/users')
vi.mock('@/api/reports')
vi.mock('@/api/transactions')
vi.mock('@/api/accounts')
vi.mock('@/api/categories')

const getSummary = vi.mocked(reportsApi.getProjectSummary)

function makeSummary(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    projectId: RUMAH.id,
    contractValue: '100000000',
    contractValueWithPpn: '100000000',
    received: '30000000',
    outstanding: '70000000',
    receivedPercent: 30,
    cost: '37000000',
    cashDifference: '-7000000',
    costByCategory: [
      { categoryId: 'c1', name: 'Material', amount: '32000000' },
      { categoryId: 'c2', name: 'Upah', amount: '5000000' },
    ],
    pendingCount: 1,
    ...overrides,
  }
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    ...RUMAH,
    clientName: 'Budi Santoso',
    contractValue: '100000000',
    contractValueWithPpn: '100000000',
    status: 'ACTIVE',
    startDate: null,
    endDate: null,
    notes: null,
    members: [],
    createdAt: '2026-10-06T03:00:00.000Z',
    updatedAt: '2026-10-06T03:00:00.000Z',
    ...overrides,
  }
}

function stat(wrapper: VueWrapper, id: string) {
  return wrapper.get(`[data-testid="summary-${id}"]`)
}

function progressWidth(wrapper: VueWrapper): string | null {
  const bar = wrapper.find('[data-testid="received-progress"]')
  return bar.exists() ? (bar.element as HTMLElement).style.width : null
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
  getSummary.mockResolvedValue(makeSummary())
})

describe('ProjectSummaryPanel', () => {
  async function mountPanel(summary: ProjectSummary = makeSummary()) {
    getSummary.mockResolvedValue(summary)
    const { wrapper } = await mountView(ProjectSummaryPanel, { props: { projectId: RUMAH.id } })
    return wrapper
  }

  it('shows what was contracted, received, spent and left', async () => {
    const wrapper = await mountPanel()

    expect(getSummary).toHaveBeenCalledExactlyOnceWith(RUMAH.id)
    expect(stat(wrapper, 'contract').text()).toContain('Rp 100.000.000')
    expect(stat(wrapper, 'received').text()).toContain('Rp 30.000.000')
    expect(stat(wrapper, 'received').text()).toContain('30% dari nilai kontrak + PPN')
    expect(progressWidth(wrapper)).toBe('30%')
    expect(stat(wrapper, 'outstanding').text()).toContain('Rp 70.000.000')
    expect(stat(wrapper, 'cost').text()).toContain('Rp 37.000.000')
    expect(wrapper.text()).toContain('1 transaksi menunggu ditinjau')
  })

  it('shows the contract value and the value with PPN as separate figures', async () => {
    const wrapper = await mountPanel(
      makeSummary({ contractValueWithPpn: '111000000', outstanding: '81000000', receivedPercent: 27.02 }),
    )

    expect(stat(wrapper, 'contract').text()).toContain('Nilai kontrak')
    expect(stat(wrapper, 'contract').text()).toContain('Rp 100.000.000')
    expect(stat(wrapper, 'contract-ppn').text()).toContain('Nilai kontrak + PPN')
    expect(stat(wrapper, 'contract-ppn').text()).toContain('Rp 111.000.000')
    expect(stat(wrapper, 'received').text()).toContain('27,02% dari nilai kontrak + PPN')
    expect(stat(wrapper, 'outstanding').text()).toContain('Rp 81.000.000')
  })

  it('says the value with PPN is not filled in, even when the contract value is', async () => {
    const wrapper = await mountPanel(
      makeSummary({ contractValueWithPpn: '0', outstanding: '-30000000', receivedPercent: null }),
    )

    expect(stat(wrapper, 'contract-ppn').text()).toContain('Belum diisi')
    expect(stat(wrapper, 'received').text()).toContain('Nilai kontrak + PPN belum diisi')
    expect(stat(wrapper, 'outstanding').text()).not.toContain('melebihi')
  })

  it('shows a negative cash difference in red with its minus sign', async () => {
    const difference = stat(await mountPanel(), 'difference')

    expect(difference.text()).toContain('-Rp 7.000.000')
    expect(difference.find('.text-red-600').exists()).toBe(true)
  })

  it('lists cost by category', async () => {
    const wrapper = await mountPanel()

    expect(wrapper.findComponent(BarList).props()).toMatchObject({
      items: [
        { id: 'c1', name: 'Material', amount: '32000000' },
        { id: 'c2', name: 'Upah', amount: '5000000' },
      ],
      emptyText: 'Belum ada biaya yang disetujui',
    })
  })

  it('shows an overpaid contract as more than 100 percent, a full bar and a negative remainder', async () => {
    const wrapper = await mountPanel(
      makeSummary({ received: '25000000', contractValue: '20000000', outstanding: '-5000000', receivedPercent: 125 }),
    )

    expect(stat(wrapper, 'received').text()).toContain('125% dari nilai kontrak + PPN')
    expect(progressWidth(wrapper)).toBe('100%')
    const outstanding = stat(wrapper, 'outstanding')
    expect(outstanding.text()).toContain('-Rp 5.000.000')
    expect(outstanding.text()).toContain('Diterima melebihi nilai kontrak + PPN')
    expect(outstanding.find('.text-red-600').exists()).toBe(true)
  })

  it('writes a fractional percentage the Indonesian way', async () => {
    const wrapper = await mountPanel(makeSummary({ receivedPercent: 33.33 }))

    expect(stat(wrapper, 'received').text()).toContain('33,33% dari nilai kontrak + PPN')
    expect(progressWidth(wrapper)).toBe('33.33%')
  })

  it('shows a dash and no progress bar when there is no contract value', async () => {
    const wrapper = await mountPanel(
      makeSummary({ contractValue: '0', contractValueWithPpn: '0', outstanding: '-30000000', receivedPercent: null }),
    )

    expect(stat(wrapper, 'received').text()).toContain('Nilai kontrak + PPN belum diisi')
    expect(progressWidth(wrapper)).toBeNull()
    // Tanpa nilai kontrak, yang diterima bukan "melebihi kontrak".
    expect(stat(wrapper, 'outstanding').text()).not.toContain('melebihi')
    expect(wrapper.text()).not.toMatch(/NaN|null|Infinity/)
  })

  it('shows zeros and a short note for a project without transactions', async () => {
    const wrapper = await mountPanel(
      makeSummary({
        received: '0',
        outstanding: '100000000',
        receivedPercent: 0,
        cost: '0',
        cashDifference: '0',
        costByCategory: [],
        pendingCount: 0,
      }),
    )

    expect(stat(wrapper, 'received').text()).toContain('Rp 0')
    expect(stat(wrapper, 'received').text()).toContain('0% dari nilai kontrak + PPN')
    expect(progressWidth(wrapper)).toBeNull()
    expect(stat(wrapper, 'difference').text()).toContain('Rp 0')
    expect(wrapper.text()).toContain('Belum ada biaya yang disetujui')
    expect(wrapper.text()).not.toContain('menunggu ditinjau')
  })

  it('shows its own error with a retry', async () => {
    getSummary.mockRejectedValueOnce(new ApiError(500, 'Terjadi kesalahan pada server'))
    const { wrapper } = await mountView(ProjectSummaryPanel, { props: { projectId: RUMAH.id } })
    expect(wrapper.text()).toContain('Terjadi kesalahan pada server')

    getSummary.mockResolvedValue(makeSummary())
    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()

    expect(stat(wrapper, 'contract').text()).toContain('Rp 100.000.000')
  })

  it('loads the other project when its project changes', async () => {
    const wrapper = await mountPanel()

    await wrapper.setProps({ projectId: KAFE.id })
    await flushPromises()

    expect(getSummary).toHaveBeenLastCalledWith(KAFE.id)
  })
})

describe('ProjectDetailView: Ringkasan tab', () => {
  async function openTab(wrapper: VueWrapper, name: string): Promise<void> {
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === name)!.trigger('click')
    await flushPromises()
  }

  async function mountProject(role: 'SUPER_ADMIN' | 'PROJECT_MANAGER' = 'SUPER_ADMIN') {
    signInAs(role)
    vi.mocked(projectsApi.getProject).mockResolvedValue(makeProject())
    vi.mocked(usersApi.listAssignableManagers).mockResolvedValue([])
    vi.mocked(transactionsApi.listTransactions).mockResolvedValue(pageOf([makeTransaction()]))
    vi.mocked(accountsApi.listAccountOptions).mockResolvedValue([])
    vi.mocked(projectsApi.listProjectOptions).mockResolvedValue([RUMAH])
    vi.mocked(categoriesApi.listCategories).mockResolvedValue([])
    return mountView(ProjectDetailView, { path: `/proyek/${RUMAH.id}`, withOverlays: true })
  }

  it('comes first, ahead of Transaksi and Anggota', async () => {
    const { wrapper } = await mountProject('PROJECT_MANAGER')

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual(['Ringkasan', 'Transaksi', 'Anggota'])
    expect(getSummary).toHaveBeenCalledExactlyOnceWith(RUMAH.id)
    expect(stat(wrapper, 'received').text()).toContain('Rp 30.000.000')
  })

  it('keeps the rest of the page working when the summary fails', async () => {
    getSummary.mockRejectedValue(new ApiError(500, 'Terjadi kesalahan pada server'))
    const { wrapper } = await mountProject()

    expect(wrapper.get('h1').text()).toContain('Rumah Pak Budi')
    expect(wrapper.text()).toContain('Terjadi kesalahan pada server')
    expect(wrapper.find('[data-testid="edit-project"]').exists()).toBe(true)

    await openTab(wrapper, 'Transaksi')
    expect(wrapper.get('tbody tr').text()).toContain('Beli semen')
  })

  it('asks for the summary again when the project itself was edited', async () => {
    const { wrapper } = await mountProject()
    getSummary.mockClear()
    getSummary.mockResolvedValue(makeSummary({ contractValue: '200000000', receivedPercent: 15 }))

    wrapper
      .findComponent(ProjectFormDialog)
      .vm.$emit('saved', makeProject({ contractValue: '200000000', updatedAt: '2026-10-07T09:00:00.000Z' }))
    await flushPromises()

    expect(getSummary).toHaveBeenCalledExactlyOnceWith(RUMAH.id)
    expect(stat(wrapper, 'contract').text()).toContain('Rp 200.000.000')
    expect(stat(wrapper, 'received').text()).toContain('15% dari nilai kontrak + PPN')
  })

  it('asks for the summary again after a transaction was recorded', async () => {
    const { wrapper } = await mountProject()
    await openTab(wrapper, 'Transaksi')
    await wrapper.get('[data-testid="add-project-transaction"]').trigger('click')
    await flushPromises()
    wrapper.findComponent(TransactionFormDialog).vm.$emit('saved', makeTransaction())
    await flushPromises()
    getSummary.mockClear()

    await openTab(wrapper, 'Ringkasan')

    expect(getSummary).toHaveBeenCalledExactlyOnceWith(RUMAH.id)
  })

  it('shows the other project’s summary when the address changes', async () => {
    const { router } = await mountProject()
    vi.mocked(projectsApi.getProject).mockResolvedValue(makeProject({ ...KAFE }))

    await router.push(`/proyek/${KAFE.id}`)
    await flushPromises()

    expect(getSummary).toHaveBeenLastCalledWith(KAFE.id)
  })
})
