import './assets/main.css'

import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { installPrimeVue } from './plugins/primevue'
import router from './router'
import { PATHS } from './router/paths'
import { reconcileRoute } from './router/reconcile'
import { useSessionStore } from './stores/session'

const app = createApp(App)

app.use(createPinia())
app.use(router)
installPrimeVue(app)

const session = useSessionStore()

// Sesi berakhir sendiri (refresh gagal): kembali ke login dan ingat halaman yang sedang dibuka.
session.onExpired(() => {
  void router.push({
    path: PATHS.login,
    query: { redirect: router.currentRoute.value.fullPath },
  })
})

// Data user berubah di tengah sesi (bukan login atau logout, yang mengatur navigasinya
// sendiri): pastikan halaman yang sedang dibuka masih boleh dibukanya.
watch(
  () => session.user,
  (now, before) => {
    if (now && before) void reconcileRoute(router, now)
  },
)

app.mount('#app')
