import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { ApiError } from '@/api/http'
import { pickChanged } from '@/lib/changes'
import { useEntityDialog } from '../useEntityDialog'

interface Thing {
  id: string
  name: string
  note: string | null
}
interface ThingInput {
  name: string
  note: string | null
}

const EXISTING: Thing = { id: 't1', name: 'Lama', note: 'catatan' }

function setup(entity: Thing | null, visibleAtStart = true) {
  const visible = ref(visibleAtStart)
  const current = ref(entity)
  const create = vi.fn<(input: ThingInput) => Promise<Thing>>(async (input) => ({ id: 'baru', ...input }))
  const update = vi.fn<(thing: Thing, changes: Partial<ThingInput>) => Promise<Thing>>(
    async (thing, changes) => ({ ...thing, ...changes }),
  )
  const onSaved = vi.fn<(thing: Thing) => void>()
  const dialog = useEntityDialog<Thing, { name: string; note: string }, ThingInput>({
    visible,
    entity: () => current.value,
    blank: () => ({ name: '', note: '' }),
    fromEntity: (thing) => ({ name: thing.name, note: thing.note ?? '' }),
    toInput: (form) => ({ name: form.name.trim(), note: form.note.trim() || null }),
    validate: (form): Record<string, string> =>
      form.name.trim() ? {} : { name: 'Nama wajib diisi' },
    create,
    update,
    onSaved,
    fieldForStatus: { 409: 'name' },
  })
  return { dialog, visible, current, create, update, onSaved }
}

describe('pickChanged', () => {
  it('keeps only the keys whose value differs', () => {
    expect(pickChanged({ a: 1, b: 'x', c: null }, { a: 1, b: 'y', c: null })).toEqual({ b: 'x' })
    expect(pickChanged({ a: null }, { a: 'x' })).toEqual({ a: null })
    expect(pickChanged({ a: 1 }, { a: 1 })).toEqual({})
  })
})

describe('useEntityDialog', () => {
  it('starts blank for a new entity and creates it', async () => {
    const { dialog, visible, create, onSaved } = setup(null)
    expect(dialog.editing.value).toBe(false)
    expect(dialog.form).toEqual({ name: '', note: '' })

    dialog.form.name = '  Baru  '
    await dialog.onSubmit()

    expect(create).toHaveBeenCalledWith({ name: 'Baru', note: null })
    expect(onSaved).toHaveBeenCalledWith({ id: 'baru', name: 'Baru', note: null })
    expect(visible.value).toBe(false)
  })

  it('fills the form from an existing entity and sends only what changed', async () => {
    const { dialog, update, onSaved } = setup(EXISTING)
    expect(dialog.editing.value).toBe(true)
    expect(dialog.form).toEqual({ name: 'Lama', note: 'catatan' })

    dialog.form.note = ''
    await dialog.onSubmit()

    expect(update).toHaveBeenCalledWith(EXISTING, { note: null })
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('closes without a request or a saved event when nothing changed', async () => {
    const { dialog, visible, update, onSaved } = setup(EXISTING)

    await dialog.onSubmit()

    expect(update).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(visible.value).toBe(false)
  })

  it('shows validation errors and stays open', async () => {
    const { dialog, visible, create } = setup(null)

    await dialog.onSubmit()

    expect(dialog.fieldErrors.value).toEqual({ name: 'Nama wajib diisi' })
    expect(create).not.toHaveBeenCalled()
    expect(visible.value).toBe(true)
  })

  it('maps an API status to a field and stays open', async () => {
    const { dialog, visible, create, onSaved } = setup(null)
    create.mockRejectedValue(new ApiError(409, 'Nama sudah dipakai'))
    dialog.form.name = 'Kembar'

    await dialog.onSubmit()

    expect(dialog.fieldErrors.value).toEqual({ name: 'Nama sudah dipakai' })
    expect(onSaved).not.toHaveBeenCalled()
    expect(visible.value).toBe(true)
  })

  it('starts clean each time it is opened, for whichever entity is current', async () => {
    const { dialog, visible, current } = setup(null)
    await dialog.onSubmit()
    expect(dialog.fieldErrors.value).not.toEqual({})

    visible.value = false
    await nextTick()
    current.value = EXISTING
    visible.value = true
    await nextTick()

    expect(dialog.fieldErrors.value).toEqual({})
    expect(dialog.form).toEqual({ name: 'Lama', note: 'catatan' })
    expect(dialog.editing.value).toBe(true)
  })
})
