import { request } from './http'
import type { Category, TxType } from './types'

export interface CategoryFilters {
  type?: TxType | null
  isActive?: boolean | null
}

export interface CreateCategoryInput {
  name: string
  type: TxType
}

/** Tipe kategori tidak bisa diubah. */
export type UpdateCategoryInput = Partial<{ name: string; isActive: boolean }>

export function listCategories(filters: CategoryFilters = {}): Promise<Category[]> {
  return request('/categories', { query: { ...filters } })
}

export function createCategory(input: CreateCategoryInput): Promise<Category> {
  return request('/categories', { method: 'POST', body: input })
}

export function updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
  return request(`/categories/${id}`, { method: 'PATCH', body: input })
}
