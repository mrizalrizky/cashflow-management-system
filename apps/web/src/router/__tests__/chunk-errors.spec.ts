import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { isChunkLoadError, pageLoadFailed, reloadOnChunkError } from '../chunk-errors'

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: http://localhost/assets/UsersView-abc.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
  ])('recognises %j', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true)
  })

  it('ignores other errors and non-errors', () => {
    expect(isChunkLoadError(new Error('boom'))).toBe(false)
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
  })
})

describe('reloadOnChunkError', () => {
  beforeEach(() => {
    sessionStorage.clear()
    pageLoadFailed.value = false
  })

  function routerWith(load: () => Promise<never>) {
    return createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/halaman', component: load },
      ],
    })
  }

  it('reloads the destination from the server when its code cannot be fetched', async () => {
    const navigate = vi.fn<(url: string) => void>()
    const router = routerWith(() =>
      Promise.reject(new TypeError('Failed to fetch dynamically imported module: /x.js')),
    )
    reloadOnChunkError(router, navigate)

    await router.push('/halaman?tab=2').catch(() => undefined)

    expect(navigate).toHaveBeenCalledExactlyOnceWith('/halaman?tab=2')
  })

  it('gives up after one reload of the same page, instead of reloading forever', async () => {
    const navigate = vi.fn<(url: string) => void>()
    const broken = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /x.js'))

    // Kunjungan pertama memuat ulang; setelah muat ulang, berkasnya masih tidak ada.
    const first = routerWith(broken)
    reloadOnChunkError(first, navigate)
    await first.push('/halaman').catch(() => undefined)
    const afterReload = routerWith(broken)
    reloadOnChunkError(afterReload, navigate)
    await afterReload.push('/halaman').catch(() => undefined)

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(pageLoadFailed.value).toBe(true)
  })

  it('reloads again later, once some page has opened successfully in between', async () => {
    const navigate = vi.fn<(url: string) => void>()
    const broken = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /x.js'))

    const first = routerWith(broken)
    reloadOnChunkError(first, navigate)
    await first.push('/halaman').catch(() => undefined)
    // Setelah muat ulang, halaman lain terbuka dengan baik.
    await first.push('/')

    const later = routerWith(broken)
    reloadOnChunkError(later, navigate)
    await later.push('/halaman').catch(() => undefined)

    expect(navigate).toHaveBeenCalledTimes(2)
    expect(pageLoadFailed.value).toBe(false)
  })

  it('does not reload for an ordinary navigation error', async () => {
    const navigate = vi.fn<(url: string) => void>()
    const router = routerWith(() => Promise.reject(new Error('boom')))
    reloadOnChunkError(router, navigate)

    await router.push('/halaman').catch(() => undefined)

    expect(navigate).not.toHaveBeenCalled()
  })
})
