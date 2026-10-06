import type { App } from 'vue'
import Aura from '@primeuix/themes/aura'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import { id } from 'primelocale/js/id.js'

/** Satu tempat untuk konfigurasi PrimeVue; dipakai aplikasi dan test. */
export function installPrimeVue(app: App): void {
  app.use(PrimeVue, {
    locale: id,
    theme: {
      preset: Aura,
      options: {
        darkModeSelector: '.app-dark',
        // Gaya PrimeVue ditaruh di layer sendiri supaya utilitas Tailwind bisa menimpanya.
        cssLayer: { name: 'primevue', order: 'theme, base, primevue' },
      },
    },
  })
  app.use(ToastService)
  app.use(ConfirmationService)
}
