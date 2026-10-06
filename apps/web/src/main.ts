import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { installPrimeVue } from './plugins/primevue'
import router from './router'
import { PATHS } from './router/paths'
import { useSessionStore } from './stores/session'

const app = createApp(App)

app.use(createPinia())
app.use(router)
installPrimeVue(app)

// Sesi berakhir sendiri (refresh gagal): kembali ke login dan ingat halaman yang sedang dibuka.
useSessionStore().onExpired(() => {
  void router.push({
    path: PATHS.login,
    query: { redirect: router.currentRoute.value.fullPath },
  })
})

app.mount('#app')
