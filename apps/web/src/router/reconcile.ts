import type { Router } from 'vue-router'
import type { AuthUser } from '@/api/types'
import { resolveNavigation } from './guards'

/**
 * Memeriksa ulang halaman yang sedang dibuka setelah data user berubah di tengah sesi
 * (mis. password direset atau peran diganti oleh admin), dan memindahkan user bila halaman
 * itu tidak lagi boleh dibukanya.
 */
export async function reconcileRoute(router: Router, user: AuthUser | null): Promise<void> {
  const destination = resolveNavigation({ user, to: router.currentRoute.value })
  if (destination !== true) await router.replace(destination)
}
