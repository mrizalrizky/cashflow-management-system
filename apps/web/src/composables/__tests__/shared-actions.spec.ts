import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { ApiError } from '@/api/http'
import { freshPinia, mountView } from '@/test/mount'
import { useNotify } from '../useNotify'
import { useToggleActive } from '../useToggleActive'

interface Item {
  id: string
  name: string
  isActive: boolean
}

const ACTIVE: Item = { id: 'a1', name: 'Kas Kecil', isActive: true }
const INACTIVE: Item = { id: 'a2', name: 'Kas Lama', isActive: false }

beforeEach(() => {
  freshPinia()
  document.body.innerHTML = ''
})

/** Memasang komponen kecil yang menjalankan `run` di dalam setup, bersama Toast dan ConfirmDialog. */
async function withSetup<T>(run: () => T): Promise<T> {
  let result!: T
  const Host = defineComponent({
    setup() {
      result = run()
      return () => h('div')
    },
  })
  await mountView(Host, { withOverlays: true })
  return result
}

function accept(): void {
  document.querySelector<HTMLButtonElement>('.p-confirmdialog-accept-button')!.click()
}

function reject(): void {
  document.querySelector<HTMLButtonElement>('.p-confirmdialog-reject-button')!.click()
}

describe('useNotify', () => {
  it('shows a success message', async () => {
    const notify = await withSetup(useNotify)
    notify.success('Akun disimpan')
    await flushPromises()
    expect(document.body.textContent).toContain('Akun disimpan')
  })

  it('shows the API message for an API error and the fallback otherwise', async () => {
    const notify = await withSetup(useNotify)

    notify.error(new ApiError(409, 'Nama akun sudah dipakai'), 'Gagal menyimpan')
    notify.error(new Error('boom'), 'Gagal menyimpan')
    await flushPromises()

    expect(document.body.textContent).toContain('Nama akun sudah dipakai')
    expect(document.body.textContent).toContain('Gagal menyimpan')
    expect(document.body.textContent).not.toContain('boom')
  })
})

describe('useToggleActive', () => {
  function setup(update = vi.fn<(id: string, isActive: boolean) => Promise<unknown>>().mockResolvedValue({})) {
    const onChanged = vi.fn<() => void>()
    return withSetup(() => useToggleActive<Item>({ update, onChanged })).then((toggle) => ({
      toggle,
      update,
      onChanged,
    }))
  }

  it('activates at once', async () => {
    const { toggle, update, onChanged } = await setup()

    toggle(INACTIVE)
    await flushPromises()

    expect(update).toHaveBeenCalledWith('a2', true)
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('Kas Lama diaktifkan')
  })

  it('asks before deactivating, naming the item', async () => {
    const { toggle, update, onChanged } = await setup()

    toggle(ACTIVE)
    await flushPromises()
    expect(document.body.textContent).toContain('Nonaktifkan Kas Kecil?')
    expect(update).not.toHaveBeenCalled()

    accept()
    await flushPromises()

    expect(update).toHaveBeenCalledWith('a1', false)
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('Kas Kecil dinonaktifkan')
  })

  it('does nothing when the confirmation is declined', async () => {
    const { toggle, update, onChanged } = await setup()

    toggle(ACTIVE)
    await flushPromises()
    reject()
    await flushPromises()

    expect(update).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('shows why the API refused and reports no change', async () => {
    const refused = vi
      .fn<(id: string, isActive: boolean) => Promise<unknown>>()
      .mockRejectedValue(new ApiError(400, 'Harus ada minimal satu SUPER_ADMIN aktif'))
    const { toggle, onChanged } = await setup(refused)

    toggle(INACTIVE)
    await flushPromises()

    expect(document.body.textContent).toContain('Harus ada minimal satu SUPER_ADMIN aktif')
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('can add a sentence explaining what deactivation means', async () => {
    const toggle = await withSetup(() =>
      useToggleActive<Item>({
        update: () => Promise.resolve(),
        onChanged: () => undefined,
        describe: () => 'Ia langsung keluar dan tidak bisa login lagi.',
      }),
    )

    toggle(ACTIVE)
    await flushPromises()

    expect(document.body.textContent).toContain('Ia langsung keluar dan tidak bisa login lagi.')
  })
})
