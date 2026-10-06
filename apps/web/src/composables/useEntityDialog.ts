import { computed, reactive, watch, type ComputedRef, type Ref, type UnwrapNestedRefs } from 'vue'
import { pickChanged } from '@/lib/changes'
import { useFormSubmit, type FormSubmit } from './useFormSubmit'

export interface EntityDialogOptions<E, F extends object, I extends object> {
  /** `v-model:visible` milik dialog. */
  visible: Ref<boolean>
  /** Data yang sedang diubah; null berarti membuat baru. */
  entity: () => E | null
  /** Isi formulir untuk data baru. */
  blank: () => F
  fromEntity: (entity: E) => F
  /** Isi formulir menjadi bentuk yang dikirim ke API (sudah dirapikan). */
  toInput: (form: F) => I
  /** Pesan kesalahan per field; objek kosong bila semua sah. */
  validate: (form: F, editing: boolean) => Record<string, string>
  create: (input: I) => Promise<E>
  /** Hanya menerima field yang berubah. */
  update: (entity: E, changes: Partial<I>) => Promise<E>
  onSaved: (entity: E) => void
  fieldForStatus?: Record<number, string>
}

export interface EntityDialog<F extends object> extends Pick<
  FormSubmit<unknown>,
  'submitting' | 'fieldErrors' | 'formError'
> {
  form: UnwrapNestedRefs<F>
  editing: ComputedRef<boolean>
  onSubmit(): Promise<void>
}

/**
 * Perilaku bersama semua dialog tambah/ubah data: formulir diisi ulang tiap dialog dibuka,
 * validasi di browser, hanya field yang berubah yang dikirim saat mengubah, dan dialog
 * ditutup setelah berhasil.
 */
export function useEntityDialog<E, F extends object, I extends object>(
  options: EntityDialogOptions<E, F, I>,
): EntityDialog<F> {
  const form = reactive(options.blank()) as UnwrapNestedRefs<F>
  const editing = computed(() => options.entity() !== null)

  /** Mengembalikan data yang tersimpan, atau null bila tidak ada yang berubah. */
  async function save(): Promise<E | null> {
    const entity = options.entity()
    const input = options.toInput(form as F)
    if (entity === null) return options.create(input)

    const changes = pickChanged(input, options.toInput(options.fromEntity(entity)))
    return Object.keys(changes).length > 0 ? options.update(entity, changes) : null
  }

  const { submitting, fieldErrors, formError, submit, reset } = useFormSubmit(save, {
    fieldForStatus: options.fieldForStatus,
  })

  watch(
    options.visible,
    (open) => {
      if (!open) return
      const entity = options.entity()
      Object.assign(form, entity === null ? options.blank() : options.fromEntity(entity))
      reset()
    },
    { immediate: true },
  )

  async function onSubmit(): Promise<void> {
    const result = await submit(options.validate(form as F, editing.value))
    if (!result.ok) return
    if (result.value !== null) options.onSaved(result.value)
    options.visible.value = false
  }

  return { form, editing, submitting, fieldErrors, formError, onSubmit }
}
