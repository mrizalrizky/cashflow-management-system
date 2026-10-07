/** Batas dan jenis berkas bukti; sama dengan yang diterapkan API. */
export const MAX_PROOF_BYTES = 10 * 1024 * 1024
export const MAX_PROOFS = 10
export const PROOF_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
export const TOO_MANY_PROOFS = `Maksimal ${MAX_PROOFS} bukti per transaksi`

const ACCEPTED_TYPES = new Set(PROOF_ACCEPT.split(','))
const PREVIEWABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const HEIC = /(^image\/hei[cf]$)|(\.hei[cf]$)/i
const KB = 1024
const MB = KB * KB

const UNSUPPORTED = 'Jenis berkas tidak didukung. Gunakan foto (JPG, PNG, WebP) atau PDF'

/**
 * Memeriksa berkas sebelum diunggah, supaya pengguna tidak menunggu unggahan yang pasti
 * ditolak. Mengembalikan alasan penolakan, atau null bila berkas bisa diunggah.
 */
export function checkProofFile(file: { name: string; type: string; size: number }): string | null {
  if (HEIC.test(file.type) || HEIC.test(file.name)) {
    // Format bawaan kamera iPhone; pemiliknya perlu tahu cara menggantinya.
    return `${UNSUPPORTED}. Di iPhone, atur format kamera ke "Paling Kompatibel" supaya foto berupa JPG`
  }
  if (!ACCEPTED_TYPES.has(file.type)) return UNSUPPORTED
  if (file.size === 0) return 'Berkas kosong'
  if (file.size > MAX_PROOF_BYTES) return `Berkas terlalu besar (maksimal ${MAX_PROOF_BYTES / MB} MB)`
  return null
}

/** Gambar yang aman ditampilkan langsung; jenis lain hanya diunduh. */
export function isImageType(mimeType: string): boolean {
  return PREVIEWABLE_TYPES.has(mimeType)
}

export function formatFileSize(bytes: number): string {
  if (bytes < KB) return `${bytes} B`
  if (bytes < MB) return `${Math.round(bytes / KB)} KB`
  return `${(bytes / MB).toFixed(1).replace('.', ',')} MB`
}
