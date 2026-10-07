import { describe, expect, it } from 'vitest'
import { checkProofFile, formatFileSize, isImageType, MAX_PROOF_BYTES } from '../proof-files'

const UNSUPPORTED = 'Jenis berkas tidak didukung. Gunakan foto (JPG, PNG, WebP) atau PDF'

describe('checkProofFile', () => {
  it.each([
    ['nota.jpg', 'image/jpeg'],
    ['nota.png', 'image/png'],
    ['nota.webp', 'image/webp'],
    ['nota.pdf', 'application/pdf'],
  ])('accepts %s', (name, type) => {
    expect(checkProofFile({ name, type, size: 1 })).toBeNull()
    expect(checkProofFile({ name, type, size: MAX_PROOF_BYTES })).toBeNull()
  })

  it('refuses a file over 10 MB', () => {
    expect(checkProofFile({ name: 'foto.jpg', type: 'image/jpeg', size: MAX_PROOF_BYTES + 1 })).toBe(
      'Berkas terlalu besar (maksimal 10 MB)',
    )
  })

  it('refuses an empty file', () => {
    expect(checkProofFile({ name: 'foto.jpg', type: 'image/jpeg', size: 0 })).toBe('Berkas kosong')
  })

  it.each([
    ['laporan.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['catatan', ''],
    ['animasi.gif', 'image/gif'],
  ])('refuses %s as an unsupported type', (name, type) => {
    expect(checkProofFile({ name, type, size: 100 })).toBe(UNSUPPORTED)
  })

  it.each([
    ['IMG_0012.HEIC', 'image/heic'],
    ['IMG_0013.heic', ''],
    ['IMG_0014.heif', 'image/heif'],
  ])('tells the owner of %s how to make the phone take JPG photos', (name, type) => {
    const message = checkProofFile({ name, type, size: 100 })

    expect(message).toContain(UNSUPPORTED)
    expect(message).toContain('Paling Kompatibel')
  })
})

describe('formatFileSize', () => {
  it.each([
    [512, '512 B'],
    [348_160, '340 KB'],
    [1_258_291, '1,2 MB'],
    [10 * 1024 * 1024, '10,0 MB'],
  ])('shows %i bytes as %s', (bytes, text) => {
    expect(formatFileSize(bytes)).toBe(text)
  })
})

describe('isImageType', () => {
  it('knows the image types that can be previewed', () => {
    expect(isImageType('image/jpeg')).toBe(true)
    expect(isImageType('image/webp')).toBe(true)
    expect(isImageType('application/pdf')).toBe(false)
    expect(isImageType('image/svg+xml')).toBe(false)
  })
})
