import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { isChunkLoadError, reloadOnChunkError } from '../chunk-errors'

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

  it('does not reload for an ordinary navigation error', async () => {
    const navigate = vi.fn<(url: string) => void>()
    const router = routerWith(() => Promise.reject(new Error('boom')))
    reloadOnChunkError(router, navigate)

    await router.push('/halaman').catch(() => undefined)

    expect(navigate).not.toHaveBeenCalled()
  })
})
