import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { ApiError, type DownloadedFile } from '@/api/http'
import * as download from '@/lib/download'
import { freshPinia, mountView } from '@/test/mount'
import { useFileDownload } from '../useFileDownload'

vi.mock('@/lib/download')

const FILE: DownloadedFile = { blob: new Blob(['isi']), fileName: 'transaksi-20261007-1005.csv' }

/** Menjalankan composable di dalam komponen, bersama Toast seperti di aplikasi. */
async function setup() {
  let result!: ReturnType<typeof useFileDownload>
  const Host = defineComponent({
    setup() {
      result = useFileDownload()
      return () => h('div')
    },
  })
  await mountView(Host, { withOverlays: true })
  return result
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
})

describe('useFileDownload', () => {
  it('saves the file under the name the API gave it', async () => {
    const files = await setup()

    expect(await files.download(() => Promise.resolve(FILE), 'transaksi.csv')).toBe(true)

    expect(download.saveBlob).toHaveBeenCalledExactlyOnceWith(FILE.blob, 'transaksi-20261007-1005.csv')
  })

  it('falls back to a given name when the API sent none', async () => {
    const files = await setup()

    await files.download(() => Promise.resolve({ blob: FILE.blob, fileName: null }), 'transaksi.csv')

    expect(download.saveBlob).toHaveBeenCalledExactlyOnceWith(FILE.blob, 'transaksi.csv')
  })

  it('is busy while the file is fetched, and runs one download at a time', async () => {
    const files = await setup()
    let finish!: (file: DownloadedFile) => void
    const fetch = vi.fn(() => new Promise<DownloadedFile>((resolve) => (finish = resolve)))

    const first = files.download(fetch, 'transaksi.csv')
    expect(files.downloading.value).toBe(true)
    expect(await files.download(fetch, 'transaksi.csv')).toBe(false)
    finish(FILE)
    await first

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(download.saveBlob).toHaveBeenCalledTimes(1)
    expect(files.downloading.value).toBe(false)
  })

  it('shows the API message, saves nothing and frees the button when the download fails', async () => {
    const files = await setup()

    const ok = await files.download(() => Promise.reject(new ApiError(400, 'Validasi gagal')), 'transaksi.csv')
    await flushPromises()

    expect(ok).toBe(false)
    expect(download.saveBlob).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Validasi gagal')
    expect(files.downloading.value).toBe(false)
  })

  it('shows a general message for a failure that is not from the API', async () => {
    const files = await setup()

    await files.download(() => Promise.reject(new Error('boom')), 'transaksi.csv')
    await flushPromises()

    expect(document.body.textContent).toContain('Gagal mengunduh berkas')
  })
})
