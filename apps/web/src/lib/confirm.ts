import type { ConfirmationOptions } from 'primevue/confirmationoptions'

export interface DangerConfirm {
  header: string
  message: string
  /** Teks tombol yang melanjutkan tindakan. */
  acceptLabel: string
  accept: () => void
}

/** Konfirmasi untuk tindakan yang mengurangi sesuatu, dengan tampilan tombol yang seragam. */
export function dangerConfirm(options: DangerConfirm): ConfirmationOptions {
  return {
    ...options,
    rejectLabel: 'Batal',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', variant: 'text' },
  }
}
