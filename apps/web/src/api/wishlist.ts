import { request } from './http'
import type { WishlistItem, WishlistStatus } from './types'

/** `price` string digit; keempat jawaban teks maksimal 1.000 karakter. */
export interface WishlistInput {
  name: string
  price: string
  reason: string
  similarOwned: string
  valueAdded: string
  usageDuration: string
  includeFinance: boolean
}

export type WishlistChanges = Partial<WishlistInput & { status: WishlistStatus }>

export function listWishlist(filter: { status?: WishlistStatus | null } = {}): Promise<WishlistItem[]> {
  return request('/wishlist', { query: { ...filter } })
}

export function getWishlistItem(id: string): Promise<WishlistItem> {
  return request(`/wishlist/${id}`)
}

export function createWishlistItem(input: WishlistInput): Promise<WishlistItem> {
  return request('/wishlist', { method: 'POST', body: input })
}

export function updateWishlistItem(id: string, changes: WishlistChanges): Promise<WishlistItem> {
  return request(`/wishlist/${id}`, { method: 'PATCH', body: changes })
}

/** "Minta pendapat AI". Bisa makan waktu sampai sekitar satu menit. */
export function reviewWishlistItem(id: string): Promise<WishlistItem> {
  return request(`/wishlist/${id}/review`, { method: 'POST' })
}
