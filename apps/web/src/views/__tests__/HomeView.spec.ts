import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import HomeView from '../HomeView.vue'

function mountHome() {
  return mount(HomeView, { global: { plugins: [PrimeVue] } })
}

describe('HomeView', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the loading state before the API answers', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const wrapper = mountHome()
    expect(wrapper.get('[data-testid="health"]').text()).toContain('Memeriksa API')
  })

  it('shows connected when the API is healthy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ status: 'ok' }) }))
    const wrapper = mountHome()
    await flushPromises()
    expect(wrapper.get('[data-testid="health"]').text()).toContain('API terhubung')
  })

  it('shows not connected when the API returns 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({ statusCode: 503 }) }))
    const wrapper = mountHome()
    await flushPromises()
    expect(wrapper.get('[data-testid="health"]').text()).toContain('API tidak terhubung')
  })

  it('shows not connected when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const wrapper = mountHome()
    await flushPromises()
    expect(wrapper.get('[data-testid="health"]').text()).toContain('API tidak terhubung')
  })
})
