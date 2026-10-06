import { ref, type Ref } from 'vue'
import { ApiError } from '@/api/http'
import { errorMessage } from '@/lib/errors'

export interface FormSubmitOptions {
  /** Status HTTP yang pesannya ditampilkan di bawah field tertentu, mis. `{ 409: 'email' }`. */
  fieldForStatus?: Record<number, string>
}

export type SubmitResult<T> = { ok: true; value: T } | { ok: false }

export interface FormSubmit<T> {
  submitting: Ref<boolean>
  /** Pesan per field, dari validasi di browser atau dari API. */
  fieldErrors: Ref<Record<string, string>>
  /** Pesan yang tidak terkait field tertentu. */
  formError: Ref<string | null>
  /** Menjalankan aksi kecuali `clientErrors` (hasil validasi di browser) berisi sesuatu. */
  submit(clientErrors?: Record<string, string>): Promise<SubmitResult<T>>
  /** Menghapus semua pesan error, mis. saat dialog dibuka lagi. */
  reset(): void
}

const FAILED: SubmitResult<never> = { ok: false }
const UNEXPECTED = 'Terjadi kesalahan. Silakan coba lagi.'

/** Alur kirim formulir yang sama untuk semua halaman: status, error per field, error umum. */
export function useFormSubmit<T>(
  action: () => Promise<T>,
  options: FormSubmitOptions = {},
): FormSubmit<T> {
  const submitting = ref(false)
  const fieldErrors = ref<Record<string, string>>({})
  const formError = ref<string | null>(null)

  function reset(): void {
    fieldErrors.value = {}
    formError.value = null
  }

  function showError(error: unknown): void {
    if (error instanceof ApiError && error.fieldErrors.length > 0) {
      fieldErrors.value = Object.fromEntries(
        error.fieldErrors.map(({ field, messages }) => [field, messages[0] ?? error.message]),
      )
      return
    }
    const message = errorMessage(error, UNEXPECTED)
    const field = error instanceof ApiError ? options.fieldForStatus?.[error.statusCode] : undefined
    if (field) fieldErrors.value = { [field]: message }
    else formError.value = message
  }

  async function submit(clientErrors: Record<string, string> = {}): Promise<SubmitResult<T>> {
    if (submitting.value) return FAILED
    reset()
    if (Object.keys(clientErrors).length > 0) {
      fieldErrors.value = clientErrors
      return FAILED
    }

    submitting.value = true
    try {
      return { ok: true, value: await action() }
    } catch (error) {
      showError(error)
      return FAILED
    } finally {
      submitting.value = false
    }
  }

  return { submitting, fieldErrors, formError, submit, reset }
}
