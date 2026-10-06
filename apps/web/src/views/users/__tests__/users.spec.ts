import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import DataTable from 'primevue/datatable'
import Select from 'primevue/select'
import * as authApi from '@/api/auth'
import { ApiError } from '@/api/http'
import type { Paginated, User } from '@/api/types'
import * as usersApi from '@/api/users'
import { useSessionStore } from '@/stores/session'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import ResetPasswordDialog from '../ResetPasswordDialog.vue'
import UserFormDialog from '../UserFormDialog.vue'
import UsersView from '../UsersView.vue'

vi.mock('@/api/auth')
vi.mock('@/api/users')

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-budi',
    name: 'Budi Santoso',
    email: 'budi@example.com',
    role: 'STAFF',
    isActive: true,
    mustChangePassword: false,
    createdAt: '2026-10-06T03:00:00.000Z',
    updatedAt: '2026-10-06T03:00:00.000Z',
    ...overrides,
  }
}

const ADMIN = makeUser({ id: 'u-admin', name: 'Admin', email: 'admin@example.com', role: 'SUPER_ADMIN' })
const BUDI = makeUser()
const CITRA = makeUser({ id: 'u-citra', name: 'Citra', email: 'citra@example.com', role: 'PROJECT_MANAGER', isActive: false })

function pageOf(users: User[], total = users.length): Paginated<User> {
  return { data: users, meta: { page: 1, pageSize: 20, total } }
}

async function signInAsAdmin(): Promise<void> {
  vi.mocked(authApi.login).mockResolvedValueOnce({ accessToken: 'token', user: ADMIN })
  await useSessionStore().login(ADMIN.email, 'password-123')
}

function lastListParams() {
  const calls = vi.mocked(usersApi.listUsers).mock.calls
  return calls[calls.length - 1]![0]
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
})

describe('UsersView', () => {
  async function mountUsers(users: User[] = [ADMIN, BUDI, CITRA]) {
    vi.mocked(usersApi.listUsers).mockResolvedValue(pageOf(users))
    await signInAsAdmin()
    return mountView(UsersView, { path: '/pengguna', withOverlays: true })
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists users with role, status and creation date', async () => {
    const { wrapper } = await mountUsers()

    const rows = wrapper.findAll('tbody tr').map((row) => row.text())
    expect(rows).toHaveLength(3)
    expect(rows[1]).toContain('Budi Santoso')
    expect(rows[1]).toContain('budi@example.com')
    expect(rows[1]).toContain('Staf')
    expect(rows[1]).toContain('Aktif')
    expect(rows[1]).toContain('06 Okt 2026')
    expect(rows[2]).toContain('Koordinator Proyek')
    expect(rows[2]).toContain('Nonaktif')
    expect(lastListParams()).toMatchObject({ page: 1, pageSize: 20 })
  })

  it('searches after a short pause in typing', async () => {
    const { wrapper } = await mountUsers()
    vi.useFakeTimers()
    vi.mocked(usersApi.listUsers).mockClear()

    await fill(wrapper, '#user-search', 'bu')
    await fill(wrapper, '#user-search', 'budi ')
    expect(usersApi.listUsers).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(300)

    expect(usersApi.listUsers).toHaveBeenCalledTimes(1)
    expect(lastListParams()).toMatchObject({ search: 'budi', page: 1 })
  })

  it('filters by role and status', async () => {
    const { wrapper } = await mountUsers()
    const [role, status] = wrapper.findAllComponents(Select)

    role!.vm.$emit('update:modelValue', 'PROJECT_MANAGER')
    await flushPromises()
    expect(lastListParams()).toMatchObject({ role: 'PROJECT_MANAGER' })

    status!.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(lastListParams()).toMatchObject({ role: 'PROJECT_MANAGER', isActive: false })
  })

  it('asks the API for the page the table requests', async () => {
    const { wrapper } = await mountUsers()

    wrapper.findComponent(DataTable).vm.$emit('page', { page: 2, rows: 50 })
    await flushPromises()

    expect(lastListParams()).toMatchObject({ page: 3, pageSize: 50 })
  })

  it('distinguishes "no users yet" from "nothing matches"', async () => {
    const { wrapper } = await mountUsers([])
    expect(wrapper.text()).toContain('Belum ada pengguna')

    wrapper.findAllComponents(Select)[0]!.vm.$emit('update:modelValue', 'STAFF')
    await flushPromises()
    expect(wrapper.text()).toContain('Tidak ada pengguna yang cocok')
  })

  it('shows a load failure with a retry that works', async () => {
    vi.mocked(usersApi.listUsers).mockRejectedValueOnce(new ApiError(0, 'Tidak dapat terhubung ke server'))
    await signInAsAdmin()
    const { wrapper } = await mountView(UsersView, { path: '/pengguna', withOverlays: true })
    expect(wrapper.text()).toContain('Tidak dapat terhubung ke server')

    vi.mocked(usersApi.listUsers).mockResolvedValue(pageOf([BUDI]))
    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Budi Santoso')
    expect(wrapper.text()).not.toContain('Tidak dapat terhubung ke server')
  })

  it('deactivates a user only after confirmation', async () => {
    vi.mocked(usersApi.updateUser).mockResolvedValue({ ...BUDI, isActive: false })
    const { wrapper } = await mountUsers()

    await wrapper.get('[data-testid="toggle-u-budi"]').trigger('click')
    await flushPromises()
    expect(usersApi.updateUser).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Nonaktifkan Budi Santoso?')

    vi.mocked(usersApi.listUsers).mockClear()
    document.querySelector<HTMLButtonElement>('.p-confirmdialog-accept-button')!.click()
    await flushPromises()

    expect(usersApi.updateUser).toHaveBeenCalledWith('u-budi', { isActive: false })
    expect(usersApi.listUsers).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('Budi Santoso dinonaktifkan')
  })

  it('reactivates an inactive user directly', async () => {
    vi.mocked(usersApi.updateUser).mockResolvedValue({ ...CITRA, isActive: true })
    const { wrapper } = await mountUsers()

    await wrapper.get('[data-testid="toggle-u-citra"]').trigger('click')
    await flushPromises()

    expect(usersApi.updateUser).toHaveBeenCalledWith('u-citra', { isActive: true })
  })

  it('offers no way to deactivate your own account', async () => {
    const { wrapper } = await mountUsers()

    expect(wrapper.find('[data-testid="toggle-u-admin"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="edit-u-admin"]').exists()).toBe(true)
  })

  it('shows the reason when the API refuses a change', async () => {
    vi.mocked(usersApi.updateUser).mockRejectedValue(
      new ApiError(400, 'Harus ada minimal satu SUPER_ADMIN aktif'),
    )
    const { wrapper } = await mountUsers()

    await wrapper.get('[data-testid="toggle-u-citra"]').trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('Harus ada minimal satu SUPER_ADMIN aktif')
  })

  it('opens the form for a new user and reloads after saving', async () => {
    vi.mocked(usersApi.createUser).mockResolvedValue(BUDI)
    const { wrapper } = await mountUsers()

    await wrapper.get('[data-testid="add-user"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Tambah pengguna')

    vi.mocked(usersApi.listUsers).mockClear()
    wrapper.findComponent(UserFormDialog).vm.$emit('saved', BUDI)
    await flushPromises()

    expect(usersApi.listUsers).toHaveBeenCalledTimes(1)
  })
})

describe('UserFormDialog', () => {
  function mountForm(user: User | null = null) {
    return mountView(UserFormDialog, { props: { visible: true, user } })
  }

  async function chooseRole(wrapper: VueWrapper, role: string) {
    wrapper.findComponent(Select).vm.$emit('update:modelValue', role)
    await flushPromises()
  }

  it('requires every field when creating', async () => {
    const { wrapper } = await mountForm()

    await submitForm(wrapper)

    const text = wrapper.text()
    expect(text).toContain('Nama wajib diisi')
    expect(text).toContain('Email wajib diisi')
    expect(text).toContain('Peran wajib diisi')
    expect(text).toContain('Password sementara wajib diisi')
    expect(usersApi.createUser).not.toHaveBeenCalled()
  })

  it('creates a user and reports it', async () => {
    vi.mocked(usersApi.createUser).mockResolvedValue(BUDI)
    const { wrapper } = await mountForm()

    await fill(wrapper, '#user-name', 'Budi Santoso')
    await fill(wrapper, '#user-email', 'budi@example.com')
    await chooseRole(wrapper, 'STAFF')
    await fill(wrapper, '#user-password', 'sementara-1')
    await submitForm(wrapper)

    expect(usersApi.createUser).toHaveBeenCalledWith({
      name: 'Budi Santoso',
      email: 'budi@example.com',
      role: 'STAFF',
      password: 'sementara-1',
    })
    expect(wrapper.emitted('saved')?.[0]).toEqual([BUDI])
    expect(wrapper.emitted('update:visible')?.[0]).toEqual([false])
  })

  it('shows a duplicate email under the email field', async () => {
    vi.mocked(usersApi.createUser).mockRejectedValue(new ApiError(409, 'Email sudah dipakai'))
    const { wrapper } = await mountForm()

    await fill(wrapper, '#user-name', 'Budi')
    await fill(wrapper, '#user-email', 'budi@example.com')
    await chooseRole(wrapper, 'STAFF')
    await fill(wrapper, '#user-password', 'sementara-1')
    await submitForm(wrapper)

    expect(wrapper.get('#user-email-error').text()).toBe('Email sudah dipakai')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('edits without a password field and sends only what changed', async () => {
    vi.mocked(usersApi.updateUser).mockResolvedValue({ ...BUDI, name: 'Budi S.' })
    const { wrapper } = await mountForm(BUDI)

    expect(wrapper.find('#user-password').exists()).toBe(false)
    expect((wrapper.get('#user-email').element as HTMLInputElement).value).toBe('budi@example.com')

    await fill(wrapper, '#user-name', 'Budi S.')
    await submitForm(wrapper)

    expect(usersApi.updateUser).toHaveBeenCalledWith('u-budi', { name: 'Budi S.' })
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('closes without calling the API when nothing changed', async () => {
    const { wrapper } = await mountForm(BUDI)

    await submitForm(wrapper)

    expect(usersApi.updateUser).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:visible')?.[0]).toEqual([false])
  })
})

describe('ResetPasswordDialog', () => {
  function mountReset() {
    return mountView(ResetPasswordDialog, { props: { visible: true, user: BUDI } })
  }

  it('requires at least 8 characters', async () => {
    const { wrapper } = await mountReset()

    await fill(wrapper, '#reset-password', 'pendek')
    await submitForm(wrapper)

    expect(wrapper.text()).toContain('Password sementara minimal 8 karakter')
    expect(usersApi.resetUserPassword).not.toHaveBeenCalled()
  })

  it('resets the password and says the user must change it', async () => {
    vi.mocked(usersApi.resetUserPassword).mockResolvedValue({ ...BUDI, mustChangePassword: true })
    const { wrapper } = await mountReset()
    expect(wrapper.text()).toContain('wajib menggantinya saat login berikutnya')

    await fill(wrapper, '#reset-password', 'sementara-9')
    await submitForm(wrapper)

    expect(usersApi.resetUserPassword).toHaveBeenCalledWith('u-budi', 'sementara-9')
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:visible')?.[0]).toEqual([false])
  })
})
