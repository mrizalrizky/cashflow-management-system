import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import * as categoriesApi from '@/api/categories'
import { ApiError } from '@/api/http'
import type { Category } from '@/api/types'
import { fill, freshPinia, mountView, submitForm } from '@/test/mount'
import CategoriesTab from '../CategoriesTab.vue'
import CategoryFormDialog from '../CategoryFormDialog.vue'

vi.mock('@/api/categories')

function makeCategory(overrides: Partial<Category> = {}): Category {
  return { id: 'c-material', name: 'Material', type: 'OUT', isSystem: false, isActive: true, ...overrides }
}

const MATERIAL = makeCategory()
const UPAH = makeCategory({ id: 'c-upah', name: 'Upah Tukang' })
const OLD = makeCategory({ id: 'c-lama', name: 'Lama', isActive: false })
const TERMIN = makeCategory({ id: 'c-termin', name: 'Termin Proyek', type: 'IN' })
const TRANSFER = makeCategory({ id: 'c-transfer', name: 'Transfer Masuk', type: 'IN', isSystem: true })

function lastFilters() {
  const calls = vi.mocked(categoriesApi.listCategories).mock.calls
  return calls[calls.length - 1]![0]
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
})

describe('CategoriesTab', () => {
  async function mountTab(categories: Category[] = [TERMIN, TRANSFER, MATERIAL, UPAH]) {
    vi.mocked(categoriesApi.listCategories).mockResolvedValue(categories)
    return mountView(CategoriesTab, { withOverlays: true })
  }

  function group(wrapper: VueWrapper, type: 'IN' | 'OUT') {
    return wrapper.get(`[data-testid="group-${type}"]`)
  }

  it('shows income and expense categories in two groups, active ones only at first', async () => {
    const { wrapper } = await mountTab()

    expect(group(wrapper, 'IN').get('h2').text()).toBe('Pemasukan')
    expect(group(wrapper, 'OUT').get('h2').text()).toBe('Pengeluaran')
    expect(group(wrapper, 'IN').findAll('tbody tr').map((row) => row.text())).toEqual([
      expect.stringContaining('Termin Proyek'),
      expect.stringContaining('Transfer Masuk'),
    ])
    expect(group(wrapper, 'OUT').findAll('tbody tr')).toHaveLength(2)
    expect(lastFilters()).toEqual({ type: undefined, isActive: true })
  })

  it('filters by type and can include inactive categories', async () => {
    const { wrapper } = await mountTab()

    wrapper.findComponent(Select).vm.$emit('update:modelValue', 'OUT')
    await flushPromises()
    expect(lastFilters()).toEqual({ type: 'OUT', isActive: true })

    vi.mocked(categoriesApi.listCategories).mockResolvedValue([MATERIAL, OLD])
    wrapper.findComponent(ToggleSwitch).vm.$emit('update:modelValue', true)
    await flushPromises()

    expect(lastFilters()).toEqual({ type: 'OUT', isActive: undefined })
    expect(group(wrapper, 'OUT').text()).toContain('Nonaktif')
    expect(wrapper.find('[data-testid="group-IN"]').exists()).toBe(false)
  })

  it('marks system categories and offers no way to change them', async () => {
    const { wrapper } = await mountTab()

    const row = wrapper.get('[data-testid="category-c-transfer"]')
    expect(row.text()).toContain('Sistem')
    expect(wrapper.find('[data-testid="edit-c-transfer"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="toggle-c-transfer"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="edit-c-material"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="toggle-c-material"]').exists()).toBe(true)
  })

  it('deactivates after confirmation and reactivates directly', async () => {
    vi.mocked(categoriesApi.updateCategory).mockResolvedValue(MATERIAL)
    const { wrapper } = await mountTab([MATERIAL, OLD])

    await wrapper.get('[data-testid="toggle-c-material"]').trigger('click')
    await flushPromises()
    expect(categoriesApi.updateCategory).not.toHaveBeenCalled()
    document.querySelector<HTMLButtonElement>('.p-confirmdialog-accept-button')!.click()
    await flushPromises()
    expect(categoriesApi.updateCategory).toHaveBeenCalledWith('c-material', { isActive: false })

    await wrapper.get('[data-testid="toggle-c-lama"]').trigger('click')
    await flushPromises()
    expect(categoriesApi.updateCategory).toHaveBeenLastCalledWith('c-lama', { isActive: true })
  })

  it('shows an empty state and recovers from a load failure', async () => {
    const empty = await mountTab([])
    expect(empty.wrapper.text()).toContain('Belum ada kategori')
    empty.wrapper.unmount()

    vi.mocked(categoriesApi.listCategories).mockRejectedValueOnce(new ApiError(0, 'Tidak dapat terhubung ke server'))
    const { wrapper } = await mountView(CategoriesTab, { withOverlays: true })
    expect(wrapper.text()).toContain('Tidak dapat terhubung ke server')
    vi.mocked(categoriesApi.listCategories).mockResolvedValue([MATERIAL])
    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Material')
  })

  it('opens the form to add or rename, and reloads after saving', async () => {
    const { wrapper } = await mountTab()

    await wrapper.get('[data-testid="add-category"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Tambah kategori')
    await wrapper.get('[data-testid="edit-c-material"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Ubah kategori')

    vi.mocked(categoriesApi.listCategories).mockClear()
    wrapper.findComponent(CategoryFormDialog).vm.$emit('saved', MATERIAL)
    await flushPromises()
    expect(categoriesApi.listCategories).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('Material disimpan')
  })
})

describe('CategoryFormDialog', () => {
  function mountForm(category: Category | null = null) {
    return mountView(CategoryFormDialog, { props: { visible: true, category } })
  }

  it('requires a name and a type when creating', async () => {
    const { wrapper } = await mountForm()

    await submitForm(wrapper)

    expect(wrapper.text()).toContain('Nama wajib diisi')
    expect(wrapper.text()).toContain('Tipe wajib diisi')
    expect(categoriesApi.createCategory).not.toHaveBeenCalled()
  })

  it('creates a category', async () => {
    vi.mocked(categoriesApi.createCategory).mockResolvedValue(MATERIAL)
    const { wrapper } = await mountForm()

    await fill(wrapper, '#category-name', ' Material ')
    wrapper.findComponent(Select).vm.$emit('update:modelValue', 'OUT')
    await flushPromises()
    await submitForm(wrapper)

    expect(categoriesApi.createCategory).toHaveBeenCalledWith({ name: 'Material', type: 'OUT' })
    expect(wrapper.emitted('saved')?.[0]).toEqual([MATERIAL])
  })

  it('shows a duplicate under the name field', async () => {
    vi.mocked(categoriesApi.createCategory).mockRejectedValue(new ApiError(409, 'Kategori sudah ada'))
    const { wrapper } = await mountForm()

    await fill(wrapper, '#category-name', 'Material')
    wrapper.findComponent(Select).vm.$emit('update:modelValue', 'OUT')
    await flushPromises()
    await submitForm(wrapper)

    expect(wrapper.get('#category-name-error').text()).toBe('Kategori sudah ada')
  })

  it('renames without offering to change the type', async () => {
    vi.mocked(categoriesApi.updateCategory).mockResolvedValue({ ...MATERIAL, name: 'Bahan' })
    const { wrapper } = await mountForm(MATERIAL)

    expect(wrapper.findComponent(Select).exists()).toBe(false)
    expect(wrapper.text()).toContain('Pengeluaran')
    expect(wrapper.text()).toContain('Tipe kategori tidak bisa diubah')

    await fill(wrapper, '#category-name', 'Bahan')
    await submitForm(wrapper)

    expect(categoriesApi.updateCategory).toHaveBeenCalledWith('c-material', { name: 'Bahan' })
  })
})
