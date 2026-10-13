import type { InstallmentStatus } from '@/api/types'
import { formatRupiah } from './money'

const STATUS_LABELS: Record<InstallmentStatus, string> = {
  NOT_STARTED: 'Belum mulai',
  ON_TRACK: 'Berjalan',
  BEHIND: 'Tertinggal',
  PAID_OFF: 'Lunas',
}

export function installmentStatusLabel(status: InstallmentStatus): string {
  return STATUS_LABELS[status]
}

export const INSTALLMENT_STATUS_SEVERITY: Record<InstallmentStatus, 'secondary' | 'info' | 'warn' | 'success'> = {
  NOT_STARTED: 'secondary',
  ON_TRACK: 'info',
  BEHIND: 'warn',
  PAID_OFF: 'success',
}

export const MONTHS_MIN = 1
export const MONTHS_MAX = 120

/** Bulan selesai `YYYY-MM`, dihitung seperti API: bulan mulai + jumlah bulan - 1. */
export function endMonthOf(startMonth: string | null, months: number): string | null {
  if (!startMonth || !Number.isInteger(months) || months < MONTHS_MIN) return null
  const index = Number(startMonth.slice(0, 4)) * 12 + Number(startMonth.slice(5, 7)) - 1 + months - 1
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** Kemajuan seperti di catatan pemilik: "2/3". */
export function progressText(installment: { paid: number; months: number }): string {
  return `${installment.paid}/${installment.months}`
}

/** "Nama · nominal · kemajuan", untuk dropdown di form transaksi. */
export function installmentOptionLabel(installment: {
  name: string
  monthlyAmount: string
  paid: number
  months: number
}): string {
  return `${installment.name} · ${formatRupiah(installment.monthlyAmount)} · ${progressText(installment)}`
}
