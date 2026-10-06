import { ref, type Ref } from 'vue'
import { ApiError } from '@/api/http'
import { errorMessage } from '@/lib/errors'

export interface AsyncData<T> {
  data: Ref<T | null>
  loading: Ref<boolean>
  /** Pesan untuk ditampilkan; null bila tidak ada kegagalan. */
  error: Ref<string | null>
  /** Status HTTP dari kegagalan terakhir, mis. 404 untuk "tidak ditemukan". */
  errorStatus: Ref<number | null>
  reload(): Promise<void>
}

/** Memuat satu data (bukan daftar berhalaman) dengan keadaan memuat dan gagal yang seragam. */
export function useAsyncData<T>(load: () => Promise<T>): AsyncData<T> {
  const data = ref(null) as Ref<T | null>
  const loading = ref(false)
  const error = ref<string | null>(null)
  const errorStatus = ref<number | null>(null)

  // Hanya jawaban dari permintaan terakhir yang dipakai.
  let latestRequest = 0

  async function reload(): Promise<void> {
    const request = ++latestRequest
    loading.value = true
    error.value = null
    errorStatus.value = null
    try {
      const result = await load()
      if (request === latestRequest) data.value = result
    } catch (cause) {
      if (request !== latestRequest) return
      error.value = errorMessage(cause, 'Gagal memuat data')
      errorStatus.value = cause instanceof ApiError ? cause.statusCode : null
    } finally {
      if (request === latestRequest) loading.value = false
    }
  }

  return { data, loading, error, errorStatus, reload }
}
