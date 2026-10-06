export type Role = 'SUPER_ADMIN' | 'PROJECT_MANAGER' | 'STAFF'

/** User yang sedang login. */
export interface AuthUser {
  id: string
  name: string
  email: string
  role: Role
  mustChangePassword: boolean
}

/** User seperti yang dikembalikan modul pengguna. */
export interface User extends AuthUser {
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Paginated<T> {
  data: T[]
  meta: { page: number; pageSize: number; total: number }
}

export interface PageParams {
  page: number
  pageSize: number
}

export interface FieldError {
  field: string
  messages: string[]
}

export interface SessionResponse {
  accessToken: string
  user: AuthUser
}
