import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as authApi from '@/api/auth'
import { onSessionExpired, refreshSession, setAccessToken } from '@/api/http'
import type { AuthUser, Role, SessionResponse } from '@/api/types'

/** Siapa yang sedang login. Access token sendiri disimpan klien HTTP, bukan di sini. */
export const useSessionStore = defineStore('session', () => {
  const user = ref<AuthUser | null>(null)
  /** True setelah percobaan memulihkan sesi selesai, berhasil ataupun tidak. */
  const ready = ref(false)

  const isAuthenticated = computed(() => user.value !== null)
  const role = computed<Role | null>(() => user.value?.role ?? null)

  let restoring: Promise<void> | null = null
  let expiredListener: (() => void) | null = null

  function apply(session: SessionResponse): void {
    setAccessToken(session.accessToken)
    user.value = session.user
  }

  function clear(): void {
    setAccessToken(null)
    user.value = null
  }

  /** Memulihkan sesi dari cookie refresh saat aplikasi dibuka. Aman dipanggil berulang. */
  function restore(): Promise<void> {
    restoring ??= (async () => {
      try {
        const session = await refreshSession()
        if (session) user.value = session.user
      } catch {
        // Gagal memulihkan sama artinya dengan belum login.
      } finally {
        ready.value = true
      }
    })()
    return restoring
  }

  async function login(email: string, password: string): Promise<void> {
    apply(await authApi.login(email, password))
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    apply(await authApi.changePassword(currentPassword, newPassword))
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } catch {
      // Sesi lokal tetap diakhiri walau server tidak terjangkau.
    } finally {
      clear()
    }
  }

  /** Mendaftarkan reaksi saat sesi berakhir sendiri (mis. arahkan ke halaman login). */
  function onExpired(listener: () => void): void {
    expiredListener = listener
  }

  onSessionExpired(() => {
    clear()
    expiredListener?.()
  })

  return { user, ready, isAuthenticated, role, restore, login, changePassword, logout, onExpired }
})
