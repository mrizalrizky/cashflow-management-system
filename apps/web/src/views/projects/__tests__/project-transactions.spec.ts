import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import Select from 'primevue/select'
import * as accountsApi from '@/api/accounts'
import * as categoriesApi from '@/api/categories'
import * as projectsApi from '@/api/projects'
import * as transactionsApi from '@/api/transactions'
import type { Project, Role } from '@/api/types'
import * as usersApi from '@/api/users'
import { freshPinia, mountView } from '@/test/mount'
import { signInAs } from '@/test/session'
import { KAFE, KAS, makeTransaction, MATERIAL, pageOf, RUMAH } from '@/test/transactions'
import TransactionFormDialog from '@/views/transactions/TransactionFormDialog.vue'
import ProjectDetailView from '../ProjectDetailView.vue'

vi.mock('@/api/projects')
vi.mock('@/api/users')
vi.mock('@/api/reports')
vi.mock('@/api/transactions')
vi.mock('@/api/accounts')
vi.mock('@/api/categories')

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    ...RUMAH,
    clientName: 'Budi Santoso',
    contractValue: '850000000',
    contractValueWithPpn: '943500000',
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

function lastListParams() {
  const calls = vi.mocked(transactionsApi.listTransactions).mock.calls
  return calls[calls.length - 1]![0]
}

async function openTransactionsTab(wrapper: VueWrapper): Promise<void> {
  const tab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Transaksi')!
  await tab.trigger('click')
  await flushPromises()
}

async function mountProject(role: Role, project: Project = makeProject()) {
  signInAs(role)
  vi.mocked(projectsApi.getProject).mockResolvedValue(project)
  const mounted = await mountView(ProjectDetailView, { path: `/proyek/${project.id}`, withOverlays: true })
  await openTransactionsTab(mounted.wrapper)
  return mounted
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
  vi.mocked(usersApi.listAssignableManagers).mockResolvedValue([])
  vi.mocked(transactionsApi.listTransactions).mockResolvedValue(pageOf([makeTransaction()]))
  vi.mocked(accountsApi.listAccountOptions).mockResolvedValue([KAS])
  vi.mocked(projectsApi.listProjectOptions).mockResolvedValue([RUMAH, KAFE])
  vi.mocked(categoriesApi.listCategories).mockResolvedValue([MATERIAL])
})

describe('ProjectDetailView: Transaksi tab', () => {
  it('lists the transactions of this project, without a project column', async () => {
    const { wrapper } = await mountProject('PROJECT_MANAGER')

    expect(lastListParams()).toMatchObject({ projectId: RUMAH.id, page: 1 })
    expect(wrapper.get('tbody tr').text()).toContain('Beli semen')
    expect(wrapper.get('tbody a').attributes('href')).toBe('/transaksi/t-semen')
    expect(wrapper.findAll('thead th').map((th) => th.text())).not.toContain('Proyek')
    expect(wrapper.text()).not.toContain('fase berikutnya')
  })

  it('records a transaction with this project already chosen, then reloads the list', async () => {
    const { wrapper } = await mountProject('PROJECT_MANAGER')

    await wrapper.get('[data-testid="add-project-transaction"]').trigger('click')
    await flushPromises()

    const project = wrapper.findAllComponents(Select).find((s) => s.props('ariaLabelledby') === 'tx-project-label')!
    expect(project.props('modelValue')).toBe(RUMAH.id)

    vi.mocked(transactionsApi.listTransactions).mockClear()
    wrapper.findComponent(TransactionFormDialog).vm.$emit('saved', makeTransaction())
    await flushPromises()
    expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1)
  })

  it('does not offer recording on a finished project, except to an admin', async () => {
    const finished = makeProject({ status: 'COMPLETED' })
    const manager = await mountProject('PROJECT_MANAGER', finished)
    expect(manager.wrapper.find('[data-testid="add-project-transaction"]').exists()).toBe(false)

    freshPinia()
    document.body.innerHTML = ''
    vi.mocked(projectsApi.listProjectOptions).mockResolvedValue([KAFE])
    const admin = await mountProject('SUPER_ADMIN', finished)
    await admin.wrapper.get('[data-testid="add-project-transaction"]').trigger('click')
    await flushPromises()

    // Proyek yang sudah selesai tidak ada di daftar pilihan, tetapi tetap ditawarkan di sini.
    const project = admin.wrapper
      .findAllComponents(Select)
      .find((s) => s.props('ariaLabelledby') === 'tx-project-label')!
    expect(project.props('modelValue')).toBe(RUMAH.id)
    expect((project.props('options') as { label: string }[]).map((o) => o.label)).toContain(
      'PRJ-2026-001 · Rumah Pak Budi',
    )
  })

  it('shows the other project’s transactions when the address changes', async () => {
    const { wrapper, router } = await mountProject('SUPER_ADMIN')
    vi.mocked(projectsApi.getProject).mockResolvedValue(makeProject({ ...KAFE }))

    await router.push(`/proyek/${KAFE.id}`)
    await flushPromises()
    await openTransactionsTab(wrapper)

    expect(lastListParams()).toMatchObject({ projectId: KAFE.id })
  })
})
