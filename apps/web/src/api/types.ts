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

export type AccountType = 'CASH' | 'BANK'
export type TxType = 'IN' | 'OUT'
export type ProjectStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED'

/** Nominal (`openingBalance`, `balance`, `contractValue`) selalu string digit. */
export interface Account {
  id: string
  name: string
  type: AccountType
  openingBalance: string
  balance: string
  isActive: boolean
  createdAt: string
}

export interface Category {
  id: string
  name: string
  type: TxType
  isSystem: boolean
  isActive: boolean
}

export interface ProjectMember {
  id: string
  name: string
  email: string
}

/** Tanggal proyek adalah tanggal kalender `YYYY-MM-DD`. */
export interface Project {
  id: string
  code: string
  name: string
  clientName: string
  contractValue: string
  status: ProjectStatus
  startDate: string | null
  endDate: string | null
  notes: string | null
  members: ProjectMember[]
  createdAt: string
  updatedAt: string
}
