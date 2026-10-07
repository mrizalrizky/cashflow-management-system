import { ref, type Ref } from 'vue'
import { uploadAttachment } from '@/api/attachments'
import { errorMessage } from '@/lib/errors'

export interface FailedUpload {
  file: File
  message: string
}

export interface ProofUpload {
  uploading: Ref<boolean>
  /** Tidak pernah melempar: berkas yang gagal dilaporkan, sisanya tetap dicoba. */
  upload(transactionId: string, files: File[]): Promise<{ failed: FailedUpload[] }>
}

/** Satu baris per berkas yang gagal, untuk ditampilkan kepada pengguna. */
export function describeFailedUploads(failed: FailedUpload[]): string {
  return failed.map(({ file, message }) => `${file.name}: ${message}`).join('; ')
}

/** Mengunggah bukti ke sebuah transaksi satu per satu, sesuai urutan yang dipilih pengguna. */
export function useProofUpload(): ProofUpload {
  const uploading = ref(false)

  async function upload(transactionId: string, files: File[]): Promise<{ failed: FailedUpload[] }> {
    const failed: FailedUpload[] = []
    uploading.value = true
    try {
      for (const file of files) {
        try {
          await uploadAttachment(transactionId, file)
        } catch (cause) {
          failed.push({ file, message: errorMessage(cause, 'Gagal mengunggah') })
        }
      }
    } finally {
      uploading.value = false
    }
    return { failed }
  }

  return { uploading, upload }
}
