import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import DataTable from 'primevue/datatable'
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'
import { ApiError } from '@/api/http'
import * as projectsApi from '@/api/projects'
import type { Paginated, Project, User } from '@/api/types'
import * as usersApi from '@/api/users'
import DateField from '@/components/DateField.vue'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import { signInAs } from '@/test/session'
import ProjectDetailView from '../ProjectDetailView.vue'
import ProjectFormDialog from '../ProjectFormDialog.vue'
import ProjectMembersPanel from '../ProjectMembersPanel.vue'
import ProjectsView from '../ProjectsView.vue'

vi.mock('@/api/projects')
vi.mock('@/api/users')
// Tab Ringkasan dibuka lebih dulu; isinya diuji di project-summary.spec.ts.
vi.mock('@/api/reports')

const ANI = { id: 'u-ani', name: 'Ani', email: 'ani@example.com' }
const ZAKI = { id: 'u-zaki', name: 'Zaki', email: 'zaki@example.com' }

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p-rumah',
    code: 'PRJ-2026-001',
    name: 'Rumah Pak Budi',
    clientName: 'Budi Santoso',
    contractValue: '850000000',
    contractValueWithPpn: '943500000',
    status: 'ACTIVE',
    startDate: '2026-10-01',
    endDate: '2027-03-31',
    notes: 'Dua lantai',
    members: [ANI],
    createdAt: '2026-10-06T03:00:00.000Z',
    updatedAt: '2026-10-06T03:00:00.000Z',
    ...overrides,
  }
}

function manager(member: typeof ANI): User {
  return {
    ...member,
    role: 'PROJECT_MANAGER',
    isActive: true,
    mustChangePassword: false,
    createdAt: '2026-10-06T03:00:00.000Z',
    updatedAt: '2026-10-06T03:00:00.000Z',
  }
}

const RUMAH = makeProject()
const KAFE = makeProject({
  id: 'p-kafe',
  code: 'PRJ-2026-002',
  name: 'Interior Kafe',
  clientName: 'PT Kopi',
  contractValue: '0',
  contractValueWithPpn: '0',
  status: 'COMPLETED',
  startDate: null,
  endDate: null,
  notes: null,
  members: [],
})

function pageOf(projects: Project[]): Paginated<Project> {
  return { data: projects, meta: { page: 1, pageSize: 20, total: projects.length } }
}

function lastListParams() {
  const calls = vi.mocked(projectsApi.listProjects).mock.calls
  return calls[calls.length - 1]![0]
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
})

describe('ProjectsView', () => {
  async function mountList(projects: Project[] = [RUMAH, KAFE]) {
    vi.mocked(projectsApi.listProjects).mockResolvedValue(pageOf(projects))
    return mountView(ProjectsView, { path: '/proyek', withOverlays: true })
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists projects with code, client, both contract values, status and coordinators', async () => {
    signInAs('SUPER_ADMIN')
    const { wrapper } = await mountList()

    expect(wrapper.get('h1').text()).toBe('Proyek')
    const rows = wrapper.findAll('tbody tr').map((row) => row.text())
    expect(rows[0]).toContain('PRJ-2026-001')
    expect(rows[0]).toContain('Rumah Pak Budi')
    expect(rows[0]).toContain('Budi Santoso')
    expect(rows[0]).toContain('Rp 850.000.000')
    expect(rows[0]).toContain('Rp 943.500.000')
    expect(wrapper.findAll('thead th').map((th) => th.text())).toEqual(
      expect.arrayContaining(['Nilai kontrak', 'Nilai kontrak + PPN']),
    )
    expect(rows[0]).toContain('Aktif')
    expect(rows[0]).toContain('Ani')
    expect(rows[1]).toContain('Selesai')
  })

  it('links each project to its detail page', async () => {
    signInAs('SUPER_ADMIN')
    const { wrapper } = await mountList()

    const links = wrapper.findAll('tbody a').map((a) => a.attributes('href'))

    expect(links).toContain('/proyek/p-rumah')
    expect(links).toContain('/proyek/p-kafe')
  })

  it('searches after a pause, filters by status and follows the table paging', async () => {
    signInAs('SUPER_ADMIN')
    const { wrapper } = await mountList()

    wrapper.findComponent(Select).vm.$emit('update:modelValue', 'COMPLETED')
    await flushPromises()
    expect(lastListParams()).toMatchObject({ status: 'COMPLETED', page: 1 })

    wrapper.findComponent(DataTable).vm.$emit('page', { page: 2, rows: 20 })
    await flushPromises()
    expect(lastListParams()).toMatchObject({ page: 3, pageSize: 20 })

    vi.useFakeTimers()
    await fill(wrapper, '#project-search', 'rumah')
    await vi.advanceTimersByTimeAsync(300)
    expect(lastListParams()).toMatchObject({ search: 'rumah', page: 1 })
  })

  it('lets an admin add a project and reloads after saving', async () => {
    signInAs('SUPER_ADMIN')
    const { wrapper } = await mountList()

    await wrapper.get('[data-testid="add-project"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Tambah proyek')

    vi.mocked(projectsApi.listProjects).mockClear()
    wrapper.findComponent(ProjectFormDialog).vm.$emit('saved', RUMAH)
    await flushPromises()
    expect(projectsApi.listProjects).toHaveBeenCalledTimes(1)
  })

  it('shows a project manager "Proyek Saya" without any way to add a project', async () => {
    signInAs('PROJECT_MANAGER')
    const { wrapper } = await mountList([RUMAH])

    expect(wrapper.get('h1').text()).toBe('Proyek Saya')
    expect(wrapper.find('[data-testid="add-project"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Rumah Pak Budi')
  })

  it('tells an unassigned project manager why the list is empty', async () => {
    signInAs('PROJECT_MANAGER')
    const { wrapper } = await mountList([])
    expect(wrapper.text()).toContain('Anda belum ditugaskan ke proyek mana pun')
  })
})

describe('ProjectFormDialog', () => {
  function mountForm(project: Project | null = null) {
    return mountView(ProjectFormDialog, { props: { visible: true, project } })
  }

  function pickDate(wrapper: VueWrapper, index: number, value: string | null) {
    wrapper.findAllComponents(DateField)[index]!.vm.$emit('update:modelValue', value)
    return flushPromises()
  }

  it('requires a name and a client', async () => {
    const { wrapper } = await mountForm()

    await submitForm(wrapper)

    expect(wrapper.text()).toContain('Nama proyek wajib diisi')
    expect(wrapper.text()).toContain('Nama klien wajib diisi')
    expect(projectsApi.createProject).not.toHaveBeenCalled()
  })

  it('creates a project without a status, with money as digits and empty fields as null', async () => {
    vi.mocked(projectsApi.createProject).mockResolvedValue(RUMAH)
    const { wrapper } = await mountForm()
    expect(wrapper.find('#project-status').exists()).toBe(false)

    await fill(wrapper, '#project-name', 'Rumah Pak Budi')
    await fill(wrapper, '#project-client', 'Budi Santoso')
    await fill(wrapper, '#project-contract', '850.000.000')
    await fill(wrapper, '#project-contract-ppn', '943.500.000')
    await pickDate(wrapper, 0, '2026-10-01')
    await submitForm(wrapper)

    expect(projectsApi.createProject).toHaveBeenCalledWith({
      name: 'Rumah Pak Budi',
      clientName: 'Budi Santoso',
      contractValue: '850000000',
      contractValueWithPpn: '943500000',
      startDate: '2026-10-01',
      endDate: null,
      notes: null,
    })
    expect(wrapper.emitted('saved')?.[0]).toEqual([RUMAH])
  })

  it('labels the two contract values separately and sends blank ones as 0', async () => {
    vi.mocked(projectsApi.createProject).mockResolvedValue(KAFE)
    const { wrapper } = await mountForm()
    expect(wrapper.get('label[for="project-contract"]').text()).toBe('Nilai kontrak (Rp)')
    expect(wrapper.get('label[for="project-contract-ppn"]').text()).toBe('Nilai kontrak + PPN (Rp)')

    await fill(wrapper, '#project-name', 'Interior Kafe')
    await fill(wrapper, '#project-client', 'PT Kopi')
    await submitForm(wrapper)

    expect(projectsApi.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ contractValue: '0', contractValueWithPpn: '0' }),
    )
  })

  it('catches a value with PPN below the contract value in the browser', async () => {
    const { wrapper } = await mountForm()

    await fill(wrapper, '#project-name', 'Rumah')
    await fill(wrapper, '#project-client', 'Budi')
    await fill(wrapper, '#project-contract', '850.000.000')
    await fill(wrapper, '#project-contract-ppn', '800.000.000')
    await submitForm(wrapper)

    expect(wrapper.get('#project-contract-ppn-error').text()).toBe(
      'Nilai kontrak + PPN tidak boleh lebih kecil dari nilai kontrak',
    )
    expect(projectsApi.createProject).not.toHaveBeenCalled()
  })

  it('sends only the value with PPN when that is all that changed', async () => {
    vi.mocked(projectsApi.updateProject).mockResolvedValue(RUMAH)
    const { wrapper } = await mountForm(RUMAH)
    expect((wrapper.get('#project-contract-ppn').element as HTMLInputElement).value).toBe('943.500.000')

    await fill(wrapper, '#project-contract-ppn', '952.000.000')
    await submitForm(wrapper)

    expect(projectsApi.updateProject).toHaveBeenCalledWith('p-rumah', { contractValueWithPpn: '952000000' })
  })

  it('catches an end date before the start date in the browser', async () => {
    const { wrapper } = await mountForm()

    await fill(wrapper, '#project-name', 'Rumah')
    await fill(wrapper, '#project-client', 'Budi')
    await pickDate(wrapper, 0, '2026-10-01')
    await pickDate(wrapper, 1, '2026-09-30')
    await submitForm(wrapper)

    expect(wrapper.get('#project-end-error').text()).toBe(
      'Tanggal selesai tidak boleh sebelum tanggal mulai',
    )
    expect(projectsApi.createProject).not.toHaveBeenCalled()
  })

  it('shows the same error from the API under the end date', async () => {
    vi.mocked(projectsApi.updateProject).mockRejectedValue(
      new ApiError(400, 'Validasi gagal', [
        { field: 'endDate', messages: ['Tanggal selesai tidak boleh sebelum tanggal mulai'] },
      ]),
    )
    const { wrapper } = await mountForm(RUMAH)

    await fill(wrapper, '#project-name', 'Nama Lain')
    await submitForm(wrapper)

    expect(wrapper.get('#project-end-error').text()).toContain('Tanggal selesai')
  })

  it('edits with a status field, sending only what changed and null for what was cleared', async () => {
    vi.mocked(projectsApi.updateProject).mockResolvedValue(RUMAH)
    const { wrapper } = await mountForm(RUMAH)
    expect((wrapper.get('#project-contract').element as HTMLInputElement).value).toBe('850.000.000')

    wrapper.findComponent(Select).vm.$emit('update:modelValue', 'COMPLETED')
    await pickDate(wrapper, 1, null)
    await fill(wrapper, '#project-notes', '')
    await submitForm(wrapper)

    expect(projectsApi.updateProject).toHaveBeenCalledWith('p-rumah', {
      status: 'COMPLETED',
      endDate: null,
      notes: null,
    })
  })
})

describe('ProjectDetailView', () => {
  const PATH = '/proyek/p-rumah'

  function mountDetail(path = PATH) {
    return mountView(ProjectDetailView, { path, withOverlays: true })
  }

  it('shows the project with its amounts and dates formatted', async () => {
    signInAs('SUPER_ADMIN')
    vi.mocked(projectsApi.getProject).mockResolvedValue(RUMAH)
    vi.mocked(usersApi.listAssignableManagers).mockResolvedValue([manager(ANI)])

    const { wrapper } = await mountDetail()

    expect(projectsApi.getProject).toHaveBeenCalledWith('p-rumah')
    const text = wrapper.text()
    for (const expected of [
      'PRJ-2026-001',
      'Rumah Pak Budi',
      'Budi Santoso',
      'Rp 850.000.000',
      'Rp 943.500.000',
      'Aktif',
      '01 Okt 2026',
      '31 Mar 2027',
      'Dua lantai',
    ]) {
      expect(text).toContain(expected)
    }
    expect(wrapper.get('[data-testid="project-contract-ppn"]').text()).toBe('Rp 943.500.000')
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual(['Ringkasan', 'Transaksi', 'Anggota'])
    expect(wrapper.get('[data-testid="back-to-projects"]').attributes('href')).toBe('/proyek')
  })

  it('shows dashes for dates and notes that are not set', async () => {
    signInAs('PROJECT_MANAGER')
    vi.mocked(projectsApi.getProject).mockResolvedValue(KAFE)

    const { wrapper } = await mountDetail('/proyek/p-kafe')

    expect(wrapper.get('[data-testid="project-start"]').text()).toBe('-')
    expect(wrapper.get('[data-testid="project-notes"]').text()).toBe('-')
  })

  it('says the project was not found, without an error toast, for a 404', async () => {
    signInAs('PROJECT_MANAGER')
    vi.mocked(projectsApi.getProject).mockRejectedValue(new ApiError(404, 'Proyek tidak ditemukan'))

    const { wrapper } = await mountDetail()

    expect(wrapper.text()).toContain('Proyek tidak ditemukan')
    expect(wrapper.find('[data-testid="retry"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="back-to-projects"]').attributes('href')).toBe('/proyek')
    expect(document.querySelector('.p-toast-message')).toBeNull()
  })

  it('treats an address with a malformed id as not found too', async () => {
    signInAs('PROJECT_MANAGER')
    vi.mocked(projectsApi.getProject).mockRejectedValue(
      new ApiError(400, 'Validation failed (uuid is expected)'),
    )

    const { wrapper } = await mountDetail('/proyek/abc')

    expect(wrapper.text()).toContain('Proyek tidak ditemukan')
    expect(wrapper.text()).not.toContain('uuid')
    expect(wrapper.find('[data-testid="retry"]').exists()).toBe(false)
  })

  it('offers a retry for any other failure', async () => {
    signInAs('SUPER_ADMIN')
    vi.mocked(usersApi.listAssignableManagers).mockResolvedValue([])
    vi.mocked(projectsApi.getProject).mockRejectedValueOnce(new ApiError(0, 'Tidak dapat terhubung ke server'))
    const { wrapper } = await mountDetail()
    expect(wrapper.text()).toContain('Tidak dapat terhubung ke server')

    vi.mocked(projectsApi.getProject).mockResolvedValue(RUMAH)
    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Rumah Pak Budi')
  })

  it('loads the other project when the address changes', async () => {
    signInAs('PROJECT_MANAGER')
    vi.mocked(projectsApi.getProject).mockImplementation((id) =>
      Promise.resolve(id === 'p-kafe' ? KAFE : RUMAH),
    )
    const { wrapper, router } = await mountDetail()

    await router.push('/proyek/p-kafe')
    await flushPromises()

    expect(projectsApi.getProject).toHaveBeenLastCalledWith('p-kafe')
    expect(wrapper.text()).toContain('Interior Kafe')
  })

  it('lets only an admin edit the project, refreshing the page after saving', async () => {
    signInAs('PROJECT_MANAGER')
    vi.mocked(projectsApi.getProject).mockResolvedValue(RUMAH)
    const asManager = await mountDetail()
    expect(asManager.wrapper.find('[data-testid="edit-project"]').exists()).toBe(false)
    asManager.wrapper.unmount()

    freshPinia()
    signInAs('SUPER_ADMIN')
    vi.mocked(usersApi.listAssignableManagers).mockResolvedValue([manager(ANI)])
    const { wrapper } = await mountDetail()
    await wrapper.get('[data-testid="edit-project"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Ubah proyek')

    wrapper.findComponent(ProjectFormDialog).vm.$emit('saved', { ...RUMAH, name: 'Rumah Bu Ani' })
    await flushPromises()
    expect(wrapper.get('h1').text()).toContain('Rumah Bu Ani')
  })
})

describe('ProjectMembersPanel', () => {
  function mountPanel(project: Project = RUMAH) {
    return mountView(ProjectMembersPanel, { props: { project }, withOverlays: true })
  }

  function panelOf(wrapper: VueWrapper): VueWrapper {
    return wrapper.findComponent(ProjectMembersPanel) as unknown as VueWrapper
  }

  async function select(wrapper: VueWrapper, ids: string[]) {
    wrapper.findComponent(MultiSelect).vm.$emit('update:modelValue', ids)
    await flushPromises()
  }

  function saveButton(wrapper: VueWrapper) {
    return wrapper.get('[data-testid="save-members"]')
  }

  it('shows a project manager a read-only list and asks for nothing else', async () => {
    signInAs('PROJECT_MANAGER')

    const { wrapper } = await mountPanel(makeProject({ members: [ANI, ZAKI] }))

    expect(wrapper.findAll('[data-testid="member"]').map((m) => m.text())).toEqual([
      expect.stringContaining('ani@example.com'),
      expect.stringContaining('zaki@example.com'),
    ])
    expect(wrapper.findComponent(MultiSelect).exists()).toBe(false)
    expect(usersApi.listAssignableManagers).not.toHaveBeenCalled()
  })

  it('says so when nobody is assigned', async () => {
    signInAs('PROJECT_MANAGER')
    const { wrapper } = await mountPanel(makeProject({ members: [] }))
    expect(wrapper.text()).toContain('Belum ada koordinator')
  })

  it('offers the active managers to an admin, with the current members selected', async () => {
    signInAs('SUPER_ADMIN')
    vi.mocked(usersApi.listAssignableManagers).mockResolvedValue([manager(ANI), manager(ZAKI)])

    const { wrapper } = await mountPanel()

    const picker = wrapper.findComponent(MultiSelect)
    expect(picker.props('modelValue')).toEqual(['u-ani'])
    expect((picker.props('options') as { label: string }[]).map((o) => o.label)).toEqual(['Ani', 'Zaki'])
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('keeps a current member who is no longer active, marked as such', async () => {
    signInAs('SUPER_ADMIN')
    vi.mocked(usersApi.listAssignableManagers).mockResolvedValue([manager(ZAKI)])

    const { wrapper } = await mountPanel()

    const picker = wrapper.findComponent(MultiSelect)
    expect((picker.props('options') as { label: string }[]).map((o) => o.label)).toEqual([
      'Ani (nonaktif)',
      'Zaki',
    ])
    expect(picker.props('modelValue')).toEqual(['u-ani'])
  })

  it('does not call anyone inactive while the manager list is still loading', async () => {
    signInAs('SUPER_ADMIN')
    vi.mocked(usersApi.listAssignableManagers).mockReturnValue(new Promise(() => {}))

    const { wrapper } = await mountPanel()

    const labels = (wrapper.findComponent(MultiSelect).props('options') as { label: string }[]).map(
      (o) => o.label,
    )
    expect(labels).toEqual(['Ani'])
  })

  it('saves a changed selection and reports the updated project', async () => {
    signInAs('SUPER_ADMIN')
    const updated = makeProject({ members: [ANI, ZAKI] })
    vi.mocked(usersApi.listAssignableManagers).mockResolvedValue([manager(ANI), manager(ZAKI)])
    vi.mocked(projectsApi.setProjectMembers).mockResolvedValue(updated)
    const { wrapper } = await mountPanel()

    await select(wrapper, ['u-ani', 'u-zaki'])
    expect(saveButton(wrapper).attributes('disabled')).toBeUndefined()
    await saveButton(wrapper).trigger('click')
    await flushPromises()

    expect(projectsApi.setProjectMembers).toHaveBeenCalledWith('p-rumah', ['u-ani', 'u-zaki'])
    expect(panelOf(wrapper).emitted('updated')?.[0]).toEqual([updated])
    expect(document.body.textContent).toContain('Koordinator proyek disimpan')
  })

  it('asks before removing everyone', async () => {
    signInAs('SUPER_ADMIN')
    vi.mocked(usersApi.listAssignableManagers).mockResolvedValue([manager(ANI)])
    vi.mocked(projectsApi.setProjectMembers).mockResolvedValue(makeProject({ members: [] }))
    const { wrapper } = await mountPanel()

    await select(wrapper, [])
    await saveButton(wrapper).trigger('click')
    await flushPromises()
    expect(projectsApi.setProjectMembers).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Hapus semua koordinator dari proyek ini?')

    document.querySelector<HTMLButtonElement>('.p-confirmdialog-accept-button')!.click()
    await flushPromises()
    expect(projectsApi.setProjectMembers).toHaveBeenCalledWith('p-rumah', [])
  })

  it('shows the API refusal under the field and keeps the selection', async () => {
    signInAs('SUPER_ADMIN')
    vi.mocked(usersApi.listAssignableManagers).mockResolvedValue([manager(ANI), manager(ZAKI)])
    vi.mocked(projectsApi.setProjectMembers).mockRejectedValue(
      new ApiError(400, 'Validasi gagal', [
        { field: 'userIds', messages: ['Pengguna yang baru ditugaskan harus koordinator proyek yang aktif'] },
      ]),
    )
    const { wrapper } = await mountPanel()

    await select(wrapper, ['u-ani', 'u-zaki'])
    await saveButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.get('#project-members-error').text()).toContain('koordinator proyek yang aktif')
    expect(wrapper.findComponent(MultiSelect).props('modelValue')).toEqual(['u-ani', 'u-zaki'])
    expect(panelOf(wrapper).emitted('updated')).toBeUndefined()
  })

  it('lets the admin retry when the manager list cannot be loaded', async () => {
    signInAs('SUPER_ADMIN')
    vi.mocked(usersApi.listAssignableManagers).mockRejectedValueOnce(new ApiError(0, 'Tidak dapat terhubung ke server'))
    const { wrapper } = await mountPanel()
    expect(wrapper.text()).toContain('Tidak dapat terhubung ke server')

    vi.mocked(usersApi.listAssignableManagers).mockResolvedValue([manager(ANI)])
    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(MultiSelect).exists()).toBe(true)
  })
})
