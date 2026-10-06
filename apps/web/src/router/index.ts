import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { resolveNavigation } from './guards'
import { routes } from './routes'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  // Menunggu pemulihan sesi supaya halaman login tidak sempat tampil saat halaman dimuat ulang.
  await session.restore()
  return resolveNavigation({ user: session.user, to })
})

export default router
