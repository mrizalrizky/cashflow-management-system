import { useConfirm } from 'primevue/useconfirm'
import { useNotify } from './useNotify'

export interface Activatable {
  id: string
  name: string
  isActive: boolean
}

export interface ToggleActiveOptions<T extends Activatable> {
  update: (id: string, isActive: boolean) => Promise<unknown>
  /** Dipanggil setelah perubahan tersimpan, mis. untuk memuat ulang daftar. */
  onChanged: () => void
  /** Kalimat tambahan di konfirmasi, menjelaskan akibat menonaktifkan. */
  describe?: (item: T) => string
}

/**
 * Tombol aktif/nonaktif untuk data master: mengaktifkan langsung dijalankan,
 * menonaktifkan diminta konfirmasinya dulu.
 */
export function useToggleActive<T extends Activatable>(
  options: ToggleActiveOptions<T>,
): (item: T) => void {
  const confirm = useConfirm()
  const notify = useNotify()

  async function setActive(item: T, isActive: boolean): Promise<void> {
    try {
      await options.update(item.id, isActive)
    } catch (cause) {
      notify.error(cause, 'Gagal menyimpan perubahan')
      return
    }
    notify.success(`${item.name} ${isActive ? 'diaktifkan' : 'dinonaktifkan'}`)
    options.onChanged()
  }

  return (item) => {
    if (!item.isActive) {
      void setActive(item, true)
      return
    }
    const detail = options.describe?.(item)
    confirm.require({
      header: 'Nonaktifkan',
      message: `Nonaktifkan ${item.name}?${detail ? ` ${detail}` : ''}`,
      acceptLabel: 'Nonaktifkan',
      rejectLabel: 'Batal',
      acceptProps: { severity: 'danger' },
      rejectProps: { severity: 'secondary', variant: 'text' },
      accept: () => void setActive(item, false),
    })
  }
}
