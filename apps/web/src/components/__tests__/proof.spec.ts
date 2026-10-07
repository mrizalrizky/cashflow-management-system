import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import Dialog from 'primevue/dialog'
import * as attachmentsApi from '@/api/attachments'
import { ApiError } from '@/api/http'
import { useProofUpload } from '@/composables/useProofUpload'
import * as download from '@/lib/download'
import { MAX_PROOF_BYTES } from '@/lib/proof-files'
import { freshPinia, mountView } from '@/test/mount'
import { makeAttachment } from '@/test/transactions'
import ProofList from '../ProofList.vue'
import ProofPicker from '../ProofPicker.vue'

vi.mock('@/api/attachments')
vi.mock('@/lib/download')

function file(name: string, type = 'image/jpeg', size = 2048): File {
  const made = new File(['x'], name, { type, lastModified: 1 })
  Object.defineProperty(made, 'size', { value: size })
  return made
}

beforeEach(() => {
  vi.resetAllMocks()
  freshPinia()
  document.body.innerHTML = ''
})

describe('ProofPicker', () => {
  async function mountPicker(props: { modelValue?: File[]; max?: number; disabled?: boolean } = {}) {
    const { wrapper } = await mountView(ProofPicker, {
      props: { modelValue: [], max: 10, ...props },
    })
    return wrapper
  }

  async function choose(wrapper: VueWrapper, files: File[]): Promise<void> {
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: files, configurable: true })
    await input.trigger('change')
  }

  /** Daftar berkas pada pembaruan terakhir. */
  function emitted(wrapper: VueWrapper): string[] {
    const updates = wrapper.emitted('update:modelValue') ?? []
    const last = updates[updates.length - 1]?.[0] as File[] | undefined
    return (last ?? []).map((f) => f.name)
  }

  it('offers a multi-file input limited to photos and PDF', async () => {
    const wrapper = await mountPicker()

    const input = wrapper.get('input[type="file"]')
    expect(input.attributes('accept')).toBe('image/jpeg,image/png,image/webp,application/pdf')
    expect(input.attributes('multiple')).toBeDefined()
  })

  it('adds chosen files to the ones already picked', async () => {
    const wrapper = await mountPicker({ modelValue: [file('lama.jpg')] })

    await choose(wrapper, [file('nota.jpg'), file('kuitansi.pdf', 'application/pdf')])

    expect(emitted(wrapper)).toEqual(['lama.jpg', 'nota.jpg', 'kuitansi.pdf'])
  })

  it('adds dropped files the same way', async () => {
    const wrapper = await mountPicker()

    await wrapper.get('[data-testid="proof-drop"]').trigger('drop', {
      dataTransfer: { files: [file('nota.jpg')] },
    })

    expect(emitted(wrapper)).toEqual(['nota.jpg'])
  })

  it('leaves out a refused file and says why, by name', async () => {
    const wrapper = await mountPicker()

    await choose(wrapper, [
      file('besar.jpg', 'image/jpeg', MAX_PROOF_BYTES + 1),
      file('IMG_1.HEIC', 'image/heic'),
      file('nota.jpg'),
    ])

    expect(emitted(wrapper)).toEqual(['nota.jpg'])
    const problems = wrapper.get('[role="alert"]').text()
    expect(problems).toContain('besar.jpg: Berkas terlalu besar (maksimal 10 MB)')
    expect(problems).toContain('IMG_1.HEIC: Jenis berkas tidak didukung')
  })

  it('keeps only as many files as are still allowed', async () => {
    const wrapper = await mountPicker({ modelValue: [file('satu.jpg')], max: 2 })

    await choose(wrapper, [file('dua.jpg'), file('tiga.jpg')])

    expect(emitted(wrapper)).toEqual(['satu.jpg', 'dua.jpg'])
    expect(wrapper.get('[role="alert"]').text()).toContain('Maksimal 10 bukti per transaksi')
  })

  it('adds the same file only once', async () => {
    const wrapper = await mountPicker({ modelValue: [file('nota.jpg')] })

    await choose(wrapper, [file('nota.jpg'), file('lain.jpg')])

    expect(emitted(wrapper)).toEqual(['nota.jpg', 'lain.jpg'])
  })

  it('lists each picked file with its size and lets it be removed', async () => {
    const wrapper = await mountPicker({ modelValue: [file('nota.jpg', 'image/jpeg', 348_160), file('dua.jpg')] })
    expect(wrapper.text()).toContain('nota.jpg')
    expect(wrapper.text()).toContain('340 KB')

    await wrapper.get('[aria-label="Hapus nota.jpg"]').trigger('click')

    expect(emitted(wrapper)).toEqual(['dua.jpg'])
  })

  it('accepts nothing while disabled', async () => {
    const wrapper = await mountPicker({ disabled: true })
    expect(wrapper.get('input[type="file"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="proof-drop"]').trigger('drop', {
      dataTransfer: { files: [file('nota.jpg')] },
    })

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})

describe('useProofUpload', () => {
  it('uploads the files one at a time, in order', async () => {
    const order: string[] = []
    let finishFirst!: () => void
    vi.mocked(attachmentsApi.uploadAttachment).mockImplementation((_id, f) => {
      order.push(f.name)
      if (f.name === 'satu.jpg') return new Promise((resolve) => (finishFirst = () => resolve(makeAttachment())))
      return Promise.resolve(makeAttachment())
    })
    const proof = useProofUpload()

    const done = proof.upload('t1', [file('satu.jpg'), file('dua.jpg')])
    await flushPromises()
    expect(order).toEqual(['satu.jpg'])
    expect(proof.uploading.value).toBe(true)

    finishFirst()
    expect(await done).toEqual({ failed: [] })
    expect(order).toEqual(['satu.jpg', 'dua.jpg'])
    expect(proof.uploading.value).toBe(false)
    expect(attachmentsApi.uploadAttachment).toHaveBeenCalledWith('t1', expect.objectContaining({ name: 'dua.jpg' }))
  })

  it('reports a refused file and still tries the rest', async () => {
    vi.mocked(attachmentsApi.uploadAttachment)
      .mockRejectedValueOnce(new ApiError(400, 'Jenis berkas tidak didukung'))
      .mockRejectedValueOnce(new Error('putus'))
      .mockResolvedValueOnce(makeAttachment())
    const proof = useProofUpload()
    const files = [file('palsu.jpg'), file('putus.jpg'), file('nota.jpg')]

    const result = await proof.upload('t1', files)

    expect(result.failed).toEqual([
      { file: files[0], message: 'Jenis berkas tidak didukung' },
      { file: files[1], message: 'Gagal mengunggah' },
    ])
    expect(attachmentsApi.uploadAttachment).toHaveBeenCalledTimes(3)
    expect(proof.uploading.value).toBe(false)
  })
})

describe('ProofList', () => {
  const FOTO = makeAttachment()
  const PDF = makeAttachment({ id: 'f-pdf', fileName: 'kuitansi.pdf', mimeType: 'application/pdf', sizeBytes: 1_258_291 })
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:bukti-1')
  const revokeObjectURL = vi.fn<(url: string) => void>()

  beforeEach(() => {
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
  })

  afterEach(() => vi.unstubAllGlobals())

  async function mountList(props: { canRemove?: boolean; attachments?: (typeof FOTO)[] } = {}) {
    const { wrapper } = await mountView(ProofList, {
      props: { attachments: [FOTO, PDF], canRemove: false, ...props },
      withOverlays: true,
    })
    return wrapper
  }

  function accept(): void {
    document.querySelector<HTMLButtonElement>('.p-confirmdialog-accept-button')!.click()
  }

  it('lists each proof with its name, size and upload date', async () => {
    const wrapper = await mountList()

    const items = wrapper.findAll('li').map((li) => li.text())
    expect(items[0]).toContain('nota.jpg')
    expect(items[0]).toContain('340 KB')
    expect(items[0]).toContain('01 Okt 2026')
    expect(items[1]).toContain('kuitansi.pdf')
    expect(items[1]).toContain('1,2 MB')
  })

  it('says so when there is no proof', async () => {
    const wrapper = await mountList({ attachments: [] })

    expect(wrapper.text()).toContain('Belum ada bukti')
  })

  it('downloads a proof under its stored name', async () => {
    const blob = new Blob(['isi'])
    vi.mocked(attachmentsApi.downloadAttachment).mockResolvedValue(blob)
    const wrapper = await mountList()

    await wrapper.get('[data-testid="download-f-pdf"]').trigger('click')
    await flushPromises()

    expect(attachmentsApi.downloadAttachment).toHaveBeenCalledExactlyOnceWith('f-pdf')
    expect(download.saveBlob).toHaveBeenCalledExactlyOnceWith(blob, 'kuitansi.pdf')
  })

  it('shows the API message when a download fails', async () => {
    vi.mocked(attachmentsApi.downloadAttachment).mockRejectedValue(new ApiError(404, 'Bukti tidak ditemukan'))
    const wrapper = await mountList()

    await wrapper.get('[data-testid="download-f-nota"]').trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('Bukti tidak ditemukan')
    expect(download.saveBlob).not.toHaveBeenCalled()
  })

  it('previews an image from a blob URL and releases it when the preview closes', async () => {
    vi.mocked(attachmentsApi.downloadAttachment).mockResolvedValue(new Blob(['isi'], { type: 'image/jpeg' }))
    const wrapper = await mountList()

    await wrapper.get('[data-testid="preview-f-nota"]').trigger('click')
    await flushPromises()

    const image = wrapper.get('img')
    expect(image.attributes('src')).toBe('blob:bukti-1')
    expect(image.attributes('alt')).toBe('nota.jpg')
    expect(revokeObjectURL).not.toHaveBeenCalled()

    wrapper.findComponent(Dialog).vm.$emit('update:visible', false)
    await flushPromises()

    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:bukti-1')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('offers no preview for a PDF', async () => {
    const wrapper = await mountList()

    expect(wrapper.find('[data-testid="preview-f-pdf"]').exists()).toBe(false)
  })

  it('removes a proof after confirmation and tells its parent', async () => {
    vi.mocked(attachmentsApi.removeAttachment).mockResolvedValue()
    const wrapper = await mountList({ canRemove: true })

    await wrapper.get('[data-testid="remove-f-nota"]').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Hapus bukti nota.jpg?')
    expect(attachmentsApi.removeAttachment).not.toHaveBeenCalled()

    accept()
    await flushPromises()

    expect(attachmentsApi.removeAttachment).toHaveBeenCalledExactlyOnceWith('f-nota')
    expect(wrapper.findComponent(ProofList).emitted('removed')).toEqual([['f-nota']])
    expect(document.body.textContent).toContain('Bukti dihapus')
  })

  it('shows the API message and tells nobody when removal is refused', async () => {
    vi.mocked(attachmentsApi.removeAttachment).mockRejectedValue(
      new ApiError(409, 'Transaksi tidak bisa diberi bukti pada status ini'),
    )
    const wrapper = await mountList({ canRemove: true })

    await wrapper.get('[data-testid="remove-f-nota"]').trigger('click')
    await flushPromises()
    accept()
    await flushPromises()

    expect(document.body.textContent).toContain('Transaksi tidak bisa diberi bukti pada status ini')
    expect(wrapper.findComponent(ProofList).emitted('removed')).toBeUndefined()
  })

  it('offers no removal unless it is allowed', async () => {
    const wrapper = await mountList()

    expect(wrapper.find('[data-testid="remove-f-nota"]').exists()).toBe(false)
  })
})
