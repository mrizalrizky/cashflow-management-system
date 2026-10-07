import type { Router } from 'vue-router'

const CHUNK_LOAD_FAILURE = /dynamically imported module|importing a module script failed/i

/**
 * Benar bila sebuah halaman gagal dimuat karena berkas kodenya tidak bisa diambil. Ini terjadi
 * saat aplikasi baru saja diperbarui: tab yang masih terbuka meminta berkas versi lama yang
 * sudah tidak ada di server.
 */
export function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && CHUNK_LOAD_FAILURE.test(error.message)
}

/** Memuat ulang halaman tujuan dari server bila berkas kodenya gagal diambil. */
export function reloadOnChunkError(
  router: Router,
  navigate: (url: string) => void = (url) => window.location.assign(url),
): void {
  router.onError((error, to) => {
    if (isChunkLoadError(error)) navigate(to.fullPath)
  })
}
