import { request } from './http'
import type { Account, AccountType, PageParams, Paginated } from './types'

/** `null` diperlakukan sama dengan tidak diisi (nilai dari dropdown yang dikosongkan). */
export interface AccountFilters {
  search?: string
  type?: AccountType | null
  isActive?: boolean | null
}

export interface CreateAccountInput {
  name: string
  type: AccountType
  openingBalance?: string
}

export type UpdateAccountInput = Partial<CreateAccountInput & { isActive: boolean }>

export function listAccounts(params: PageParams & AccountFilters): Promise<Paginated<Account>> {
  return request('/accounts', { query: { ...params } })
}

export function createAccount(input: CreateAccountInput): Promise<Account> {
  return request('/accounts', { method: 'POST', body: input })
}

export function updateAccount(id: string, input: UpdateAccountInput): Promise<Account> {
  return request(`/accounts/${id}`, { method: 'PATCH', body: input })
}
