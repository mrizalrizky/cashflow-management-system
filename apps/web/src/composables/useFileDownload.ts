import { ref, type Ref } from 'vue'
import type { DownloadedFile } from '@/api/http'
import { saveBlob } from '@/lib/download'
import { useNotify } from './useNotify'

export interface FileDownload {
  /** True selagi berkas diambil; tombolnya dimatikan. */
  downloading: Ref<boolean>
  /**
   * Mengambil berkas lalu menyimpannya dengan nama dari API, atau `fallbackName` bila API
   * tidak menyebut nama. Mengembalikan false bila gagal (pesannya sudah ditampilkan) atau
   * bila unduhan lain masih berjalan.
   */
  download(fetch: () => Promise<DownloadedFile>, fallbackName: string): Promise<boolean>
}

/** Mengunduh berkas dari API: satu per satu, dengan keadaan sibuk dan pesan bila gagal. */
export function useFileDownload(): FileDownload {
  const notify = useNotify()
  const downloading = ref(false)

  async function download(
    fetch: () => Promise<DownloadedFile>,
    fallbackName: string,
  ): Promise<boolean> {
    if (downloading.value) return false
    downloading.value = true
    try {
      const file = await fetch()
      saveBlob(file.blob, file.fileName ?? fallbackName)
      return true
    } catch (cause) {
      notify.error(cause, 'Gagal mengunduh berkas')
      return false
    } finally {
      downloading.value = false
    }
  }

  return { downloading, download }
}
