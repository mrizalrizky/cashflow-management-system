import { reactive, ref, watch, type Ref, type UnwrapNestedRefs } from 'vue'
import { ApiError } from '@/api/http'
import type { PageParams, Paginated } from '@/api/types'

export const DEFAULT_PAGE_SIZE = 20

export interface PagedList<T, F extends object> {
  items: Ref<T[]>
  total: Ref<number>
  page: Ref<number>
  pageSize: Ref<number>
  /** Ubah langsung; daftar kembali ke halaman 1 dan dimuat ulang. */
  filters: UnwrapNestedRefs<F>
  loading: Ref<boolean>
  error: Ref<string | null>
  setPage(page: number, pageSize?: number): void
  reload(): Promise<void>
}

/** Daftar berhalaman dengan filter, dipakai semua halaman tabel. */
export function usePagedList<T, F extends object>(
  fetchPage: (params: PageParams & F) => Promise<Paginated<T>>,
  initialFilters: F,
): PagedList<T, F> {
  const items = ref([]) as Ref<T[]>
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(DEFAULT_PAGE_SIZE)
  const filters = reactive({ ...initialFilters }) as UnwrapNestedRefs<F>
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Hanya jawaban dari permintaan terakhir yang dipakai; jawaban lama yang datang terlambat dibuang.
  let latestRequest = 0

  async function reload(): Promise<void> {
    const request = ++latestRequest
    loading.value = true
    error.value = null
    try {
      const params = { ...(filters as F), page: page.value, pageSize: pageSize.value }
      const result = await fetchPage(params)
      if (request !== latestRequest) return
      items.value = result.data
      total.value = result.meta.total
    } catch (cause) {
      if (request !== latestRequest) return
      error.value = cause instanceof ApiError ? cause.message : 'Gagal memuat data'
    } finally {
      if (request === latestRequest) loading.value = false
    }
  }

  function setPage(nextPage: number, nextPageSize: number = pageSize.value): void {
    page.value = nextPage
    pageSize.value = nextPageSize
  }

  watch([page, pageSize], () => void reload())
  watch(filters, () => {
    // Mengubah halaman sudah memicu muat ulang; bila sudah di halaman 1, muat ulang langsung.
    if (page.value === 1) void reload()
    else page.value = 1
  })

  return { items, total, page, pageSize, filters, loading, error, setPage, reload }
}
