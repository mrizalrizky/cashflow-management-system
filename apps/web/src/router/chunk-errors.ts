import { ref } from 'vue'
import type { Router } from 'vue-router'

const CHUNK_LOAD_FAILURE = /dynamically imported module|importing a module script failed/i
const RELOADED_FOR = 'chunk-reload-path'

/** True bila sebuah halaman tetap gagal dimuat setelah dicoba muat ulang; App.vue menampilkannya. */
export const pageLoadFailed = ref(false)

/**
 * Benar bila sebuah halaman gagal dimuat karena berkas kodenya tidak bisa diambil. Ini terjadi
 * saat aplikasi baru saja diperbarui: tab yang masih terbuka meminta berkas versi lama yang
 * sudah tidak ada di server.
 */
export function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && CHUNK_LOAD_FAILURE.test(error.message)
}

// Catatan "halaman ini sudah dicoba muat ulang" harus bertahan melewati muat ulang, jadi
// disimpan di sessionStorage. Ini bukan data sesi login. Bila storage tidak tersedia,
// dianggap sudah pernah dicoba supaya tidak memuat ulang tanpa henti.
function alreadyReloaded(path: string): boolean {
  try {
    return sessionStorage.getItem(RELOADED_FOR) === path
  } catch {
    return true
  }
}

function remember(path: string | null): void {
  try {
    if (path === null) sessionStorage.removeItem(RELOADED_FOR)
    else sessionStorage.setItem(RELOADED_FOR, path)
  } catch {
    // Tanpa storage tidak ada yang perlu dicatat.
  }
}

/**
 * Memuat ulang halaman tujuan dari server bila berkas kodenya gagal diambil, satu kali saja
 * per halaman. Bila setelah itu masih gagal (mis. berkasnya memang hilang), berhenti dan
 * menandai `pageLoadFailed`.
 */
export function reloadOnChunkError(
  router: Router,
  navigate: (url: string) => void = (url) => window.location.assign(url),
): void {
  router.onError((error, to) => {
    if (!isChunkLoadError(error)) return
    if (alreadyReloaded(to.fullPath)) {
      pageLoadFailed.value = true
      return
    }
    remember(to.fullPath)
    // `href` sudah termasuk base URL aplikasi.
    navigate(router.resolve(to).href)
  })

  // Halaman berhasil dibuka: kegagalan berikutnya boleh dicoba muat ulang lagi.
  router.afterEach((_to, _from, failure) => {
    if (!failure) remember(null)
  })
}
