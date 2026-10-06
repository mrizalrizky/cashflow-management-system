import { useToast } from 'primevue/usetoast'
import { errorMessage } from '@/lib/errors'

const LIFE_MS = 4000

export interface Notify {
  success(message: string): void
  /** Menampilkan pesan dari API bila ada; selain itu `fallback`. */
  error(cause: unknown, fallback: string): void
}

/** Pemberitahuan singkat di atas layar, seragam di semua halaman. */
export function useNotify(): Notify {
  const toast = useToast()
  return {
    success: (message) => toast.add({ severity: 'success', summary: message, life: LIFE_MS }),
    error: (cause, fallback) =>
      toast.add({ severity: 'error', summary: errorMessage(cause, fallback), life: LIFE_MS }),
  }
}
