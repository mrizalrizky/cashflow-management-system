import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveBlob } from '../download'

describe('saveBlob', () => {
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:berkas-1')
  const revokeObjectURL = vi.fn<(url: string) => void>()

  beforeEach(() => {
    vi.useFakeTimers()
    // jsdom tidak punya URL blob.
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('offers the blob as a download under the given name, then releases it', () => {
    const clicked: { href: string; download: string }[] = []
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({ href: this.href, download: this.download })
      })
    const blob = new Blob(['isi'], { type: 'application/pdf' })

    saveBlob(blob, 'nota toko.pdf')

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(clicked).toEqual([{ href: 'blob:berkas-1', download: 'nota toko.pdf' }])
    expect(document.querySelector('a[download]')).toBeNull()

    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:berkas-1')
    click.mockRestore()
  })
})
