import { ref, type Ref } from 'vue'
import { ApiError } from '@/api/http'

export interface FormSubmitOptions {
  /** Status HTTP yang pesannya ditampilkan di bawah field tertentu, mis. `{ 409: 'email' }`. */
  fieldForStatus?: Record<number, string>
}

export interface FormSubmit {
  submitting: Ref<boolean>
  /** Pesan per field, dari validasi di browser atau dari API. */
  fieldErrors: Ref<Record<string, string>>
  /** Pesan yang tidak terkait field tertentu. */
  formError: Ref<string | null>
  /** Mengembalikan true bila aksi berhasil. Beri `clientErrors` hasil validasi di browser. */
  submit(clientErrors?: Record<string, string>): Promise<boolean>
}

const UNEXPECTED = 'Terjadi kesalahan. Silakan coba lagi.'

/** Alur kirim formulir yang sama untuk semua halaman: status, error per field, error umum. */
export function useFormSubmit(
  action: () => Promise<unknown>,
  options: FormSubmitOptions = {},
): FormSubmit {
  const submitting = ref(false)
  const fieldErrors = ref<Record<string, string>>({})
  const formError = ref<string | null>(null)

  function showError(error: unknown): void {
    if (!(error instanceof ApiError)) {
      formError.value = UNEXPECTED
      return
    }
    if (error.fieldErrors.length > 0) {
      fieldErrors.value = Object.fromEntries(
        error.fieldErrors.map(({ field, messages }) => [field, messages[0] ?? error.message]),
      )
      return
    }
    const field = options.fieldForStatus?.[error.statusCode]
    if (field) fieldErrors.value = { [field]: error.message }
    else formError.value = error.message
  }

  async function submit(clientErrors: Record<string, string> = {}): Promise<boolean> {
    if (submitting.value) return false
    fieldErrors.value = clientErrors
    formError.value = null
    if (Object.keys(clientErrors).length > 0) return false

    submitting.value = true
    try {
      await action()
      return true
    } catch (error) {
      showError(error)
      return false
    } finally {
      submitting.value = false
    }
  }

  return { submitting, fieldErrors, formError, submit }
}
