import { ApiError } from '@/api/http'

/** Pesan yang layak ditampilkan: pesan dari API bila ada, selain itu `fallback`. */
export function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback
}
