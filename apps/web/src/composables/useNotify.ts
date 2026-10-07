import { useToast } from 'primevue/usetoast'
import { errorMessage } from '@/lib/errors'

const LIFE_MS = 4000
/** Peringatan memuat hal yang perlu ditindaklanjuti, jadi tampil lebih lama. */
const WARN_LIFE_MS = 12000

export interface Notify {
  success(message: string): void
  /** Berhasil, tetapi ada yang perlu diperhatikan pengguna. */
  warn(message: string): void
  /** Menampilkan pesan dari API bila ada; selain itu `fallback`. */
  error(cause: unknown, fallback: string): void
}

/** Pemberitahuan singkat di atas layar, seragam di semua halaman. */
export function useNotify(): Notify {
  const toast = useToast()
  return {
    success: (message) => toast.add({ severity: 'success', summary: message, life: LIFE_MS }),
    warn: (message) => toast.add({ severity: 'warn', summary: message, life: WARN_LIFE_MS }),
    error: (cause, fallback) =>
      toast.add({ severity: 'error', summary: errorMessage(cause, fallback), life: LIFE_MS }),
  }
}
