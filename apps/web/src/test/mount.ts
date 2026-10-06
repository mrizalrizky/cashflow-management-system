import type { Component } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { installPrimeVue } from '@/plugins/primevue'
import { PATHS } from '@/router/paths'

export interface MountedView {
  wrapper: VueWrapper
  router: Router
}

/** Router dengan semua alamat aplikasi tetapi tanpa guard, supaya test bisa melihat ke mana halaman berpindah. */
export function createTestRouter(): Router {
  const blank = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: Object.values(PATHS).map((path) => ({ path, component: blank })),
  })
}

/**
 * Memasang sebuah halaman dengan Pinia, PrimeVue dan router sungguhan.
 * Panggil `setActivePinia` lebih dulu bila test perlu menyiapkan store sebelum halaman dipasang.
 */
export async function mountView(
  component: Component,
  options: { path?: string; props?: Record<string, unknown> } = {},
): Promise<MountedView> {
  const router = createTestRouter()
  await router.push(options.path ?? PATHS.root)
  await router.isReady()

  const wrapper = mount(component, {
    props: options.props,
    attachTo: document.body,
    global: {
      plugins: [
        (app) => {
          // Memakai Pinia yang sudah aktif bila ada, supaya store yang disiapkan test terbawa.
          app.use(activePinia())
          installPrimeVue(app)
        },
        router,
      ],
    },
  })
  await flushPromises()
  return { wrapper, router }
}

let pinia: ReturnType<typeof createPinia> | null = null

/** Pinia baru untuk satu test; panggil di `beforeEach`. */
export function freshPinia(): void {
  pinia = createPinia()
  setActivePinia(pinia)
}

function activePinia(): ReturnType<typeof createPinia> {
  if (!pinia) freshPinia()
  return pinia!
}

/** Mengisi sebuah input seperti yang dilakukan pengguna. */
export async function fill(wrapper: VueWrapper, selector: string, value: string): Promise<void> {
  await wrapper.get(selector).setValue(value)
}

export async function submitForm(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}
