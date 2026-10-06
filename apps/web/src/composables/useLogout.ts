import { useRouter } from 'vue-router'
import { PATHS } from '@/router/paths'
import { useSessionStore } from '@/stores/session'

/** Keluar lalu kembali ke halaman login. */
export function useLogout(): () => Promise<void> {
  const session = useSessionStore()
  const router = useRouter()

  return async () => {
    await session.logout()
    await router.replace(PATHS.login)
  }
}
