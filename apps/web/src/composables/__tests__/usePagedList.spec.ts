import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ApiError } from '@/api/http'
import type { PageParams, Paginated } from '@/api/types'
import { usePagedList } from '../usePagedList'

interface Filters {
  search?: string
}
type Params = PageParams & Filters
type Fetch = (params: Params) => Promise<Paginated<string>>

function page(data: string[], total = data.length): Paginated<string> {
  return { data, meta: { page: 1, pageSize: 20, total } }
}

describe('usePagedList', () => {
  it('loads the first page with the initial filters', async () => {
    const fetchPage = vi.fn<Fetch>().mockResolvedValue(page(['a', 'b'], 7))
    const list = usePagedList(fetchPage, { search: undefined })

    await list.reload()

    expect(fetchPage).toHaveBeenCalledWith({ search: undefined, page: 1, pageSize: 20 })
    expect(list.items.value).toEqual(['a', 'b'])
    expect(list.total.value).toBe(7)
    expect(list.loading.value).toBe(false)
  })

  it('reloads when the page changes', async () => {
    const fetchPage = vi.fn<Fetch>().mockResolvedValue(page([]))
    const list = usePagedList(fetchPage, {})
    await list.reload()

    list.setPage(3, 50)
    await flushPromises()

    expect(fetchPage).toHaveBeenLastCalledWith({ page: 3, pageSize: 50 })
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('goes back to page 1 and reloads once when a filter changes', async () => {
    const fetchPage = vi.fn<Fetch>().mockResolvedValue(page([]))
    const list = usePagedList<string, Filters>(fetchPage, {})
    list.setPage(4, 20)
    await flushPromises()
    fetchPage.mockClear()

    list.filters.search = 'budi'
    await flushPromises()

    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(fetchPage).toHaveBeenCalledWith({ search: 'budi', page: 1, pageSize: 20 })
  })

  it('never lets a slow earlier response overwrite a newer one', async () => {
    let resolveSlow!: (value: Paginated<string>) => void
    const fetchPage = vi
      .fn<Fetch>()
      .mockReturnValueOnce(new Promise((resolve) => (resolveSlow = resolve)))
      .mockResolvedValueOnce(page(['baru']))
    const list = usePagedList<string, Filters>(fetchPage, {})

    const first = list.reload()
    await list.reload()
    resolveSlow(page(['lama']))
    await first

    expect(list.items.value).toEqual(['baru'])
    expect(list.loading.value).toBe(false)
  })

  it('steps back to the last page that has rows when the current page became empty', async () => {
    const fetchPage = vi.fn<Fetch>(({ page: requested }) =>
      Promise.resolve(requested === 3 ? page([], 40) : page(['x'], 40)),
    )
    const list = usePagedList(fetchPage, {})

    list.setPage(3, 20)
    await flushPromises()

    expect(list.page.value).toBe(2)
    expect(list.items.value).toEqual(['x'])
    expect(fetchPage).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 })
  })

  it('stays on an empty first page', async () => {
    const fetchPage = vi.fn<Fetch>().mockResolvedValue(page([], 0))
    const list = usePagedList(fetchPage, {})

    await list.reload()

    expect(list.page.value).toBe(1)
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('reports an error and keeps what was already shown', async () => {
    const fetchPage = vi
      .fn<Fetch>()
      .mockResolvedValueOnce(page(['a']))
      .mockRejectedValueOnce(new ApiError(0, 'Tidak dapat terhubung ke server'))
      .mockResolvedValueOnce(page(['b']))
    const list = usePagedList(fetchPage, {})
    await list.reload()

    await list.reload()
    expect(list.error.value).toBe('Tidak dapat terhubung ke server')
    expect(list.items.value).toEqual(['a'])

    await list.reload()
    expect(list.error.value).toBeNull()
    expect(list.items.value).toEqual(['b'])
  })
})
