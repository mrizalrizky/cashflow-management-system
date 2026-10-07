import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as authApi from '@/api/auth'
import { bindSessionEvents, refreshSession, setAccessToken } from '@/api/http'
import type { AuthUser, Role, SessionResponse } from '@/api/types'

/** Siapa yang sedang login. Access token sendiri disimpan klien HTTP, bukan di sini. */
export const useSessionStore = defineStore('session', () => {
  const user = ref<AuthUser | null>(null)
  /** True setelah percobaan memulihkan sesi selesai, berhasil ataupun tidak. */
  const ready = ref(false)

  const isAuthenticated = computed(() => user.value !== null)
  const role = computed<Role | null>(() => user.value?.role ?? null)
  /** Untuk memutuskan apa yang ditawarkan di layar; yang membatasi tetap API. */
  const isAdmin = computed(() => role.value === 'SUPER_ADMIN')

  let restoring: Promise<void> | null = null
  let resyncing: Promise<void> | null = null
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

  /**
   * Membaca ulang data user dari server. Dipanggil saat API menolak sebuah request, karena
   * itu bisa berarti password baru direset atau peran baru diganti. Request yang ditolak
   * bersamaan menunggu satu pembacaan yang sama.
   */
  function resync(): Promise<void> {
    resyncing ??= (async () => {
      try {
        const current = (await authApi.me()).user
        // Bila user sudah logout selagi menunggu, jawaban ini tidak berlaku lagi.
        if (user.value !== null) user.value = current
      } catch {
        // Tidak bisa memastikan; biarkan data yang ada.
      } finally {
        resyncing = null
      }
    })()
    return resyncing
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

  bindSessionEvents({
    // Cookie dipakai bersama semua tab: bila tab lain login sebagai orang lain,
    // perpanjangan sesi di tab ini mengembalikan user itu, dan tampilan harus mengikutinya.
    onRefreshed: (session) => {
      user.value = session.user
    },
    onExpired: () => {
      clear()
      expiredListener?.()
    },
    onForbidden: () => void resync(),
  })

  return {
    user,
    ready,
    isAuthenticated,
    role,
    isAdmin,
    restore,
    resync,
    login,
    changePassword,
    logout,
    onExpired,
  }
})
