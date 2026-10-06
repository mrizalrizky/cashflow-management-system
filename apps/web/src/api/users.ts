import { request } from './http'
import type { PageParams, Paginated, Role, User } from './types'

/** `null` diperlakukan sama dengan tidak diisi (nilai dari dropdown yang dikosongkan). */
export interface UserFilters {
  search?: string
  role?: Role | null
  isActive?: boolean | null
}

export interface CreateUserInput {
  name: string
  email: string
  role: Role
  password: string
}

export type UpdateUserInput = Partial<{
  name: string
  email: string
  role: Role
  isActive: boolean
}>

export function listUsers(params: PageParams & UserFilters): Promise<Paginated<User>> {
  return request('/users', { query: { ...params } })
}

export function createUser(input: CreateUserInput): Promise<User> {
  return request('/users', { method: 'POST', body: input })
}

export function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  return request(`/users/${id}`, { method: 'PATCH', body: input })
}

export function resetUserPassword(id: string, newPassword: string): Promise<User> {
  return request(`/users/${id}/reset-password`, { method: 'POST', body: { newPassword } })
}
