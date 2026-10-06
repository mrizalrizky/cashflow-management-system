import { defineComponent, h, type Component } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ConfirmDialog from 'primevue/confirmdialog'
import Toast from 'primevue/toast'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { installPrimeVue } from '@/plugins/primevue'
import { PATHS, PROJECT_DETAIL_ROUTE } from '@/router/paths'

export interface MountedView {
  wrapper: VueWrapper
  router: Router
}

export interface MountViewOptions {
  path?: string
  props?: Record<string, unknown>
  /** Ikut memasang Toast dan ConfirmDialog, seperti yang dilakukan App.vue. */
  withOverlays?: boolean
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

/** Router dengan semua alamat aplikasi tetapi tanpa guard, supaya test bisa melihat ke mana halaman berpindah. */
export function createTestRouter(): Router {
  const blank = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [...Object.values(PATHS), PROJECT_DETAIL_ROUTE].map((path) => ({
      path,
      component: blank,
    })),
  })
}

function withOverlays(component: Component, props?: Record<string, unknown>): Component {
  return defineComponent({
    render: () => [h(component, props), h(Toast), h(ConfirmDialog)],
  })
}

/**
 * Memasang sebuah halaman dengan Pinia, PrimeVue dan router sungguhan. Store yang sudah
 * disiapkan test (setelah `freshPinia()`) terbawa ke halaman.
 */
export async function mountView(
  component: Component,
  options: MountViewOptions = {},
): Promise<MountedView> {
  const router = createTestRouter()
  await router.push(options.path ?? PATHS.root)
  await router.isReady()

  const target = options.withOverlays ? withOverlays(component, options.props) : component
  const wrapper = mount(target, {
    props: options.withOverlays ? undefined : options.props,
    attachTo: document.body,
    global: {
      plugins: [
        (app) => {
          app.use(activePinia())
          installPrimeVue(app)
        },
        router,
      ],
      // Dialog dan laci dirender di tempat, supaya isinya bisa dicari lewat wrapper.
      stubs: { teleport: true },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

/** Mengisi sebuah input seperti yang dilakukan pengguna. */
export async function fill(wrapper: VueWrapper, selector: string, value: string): Promise<void> {
  await wrapper.get(selector).setValue(value)
}

export async function submitForm(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}
