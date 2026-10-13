import type { AiVerdict, WishlistStatus } from '@/api/types'
import type { Option } from './labels'

const STATUS_LABELS: Record<WishlistStatus, string> = {
  WAITING: 'Menunggu',
  BOUGHT: 'Dibeli',
  CANCELLED: 'Batal',
}

export function wishlistStatusLabel(status: WishlistStatus): string {
  return STATUS_LABELS[status]
}

export const WISHLIST_STATUS_OPTIONS: Option<WishlistStatus>[] = (
  Object.keys(STATUS_LABELS) as WishlistStatus[]
).map((value) => ({ value, label: STATUS_LABELS[value] }))

export const WISHLIST_STATUS_SEVERITY: Record<WishlistStatus, 'info' | 'success' | 'secondary'> = {
  WAITING: 'info',
  BOUGHT: 'success',
  CANCELLED: 'secondary',
}

const VERDICT_LABELS: Record<AiVerdict, string> = {
  IMPULSIVE: 'Impulsif',
  NEEDS_THOUGHT: 'Perlu dipikirkan',
  PLANNED: 'Terencana',
}

export function verdictLabel(verdict: AiVerdict): string {
  return VERDICT_LABELS[verdict]
}

export const VERDICT_SEVERITY: Record<AiVerdict, 'danger' | 'warn' | 'success'> = {
  IMPULSIVE: 'danger',
  NEEDS_THOUGHT: 'warn',
  PLANNED: 'success',
}

/** Batas tiap jawaban, sama dengan API. */
export const ANSWER_MAX = 1000
