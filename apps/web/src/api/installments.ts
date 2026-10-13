import { request } from './http'
import type { Installment, InstallmentDetail, InstallmentList } from './types'

export type InstallmentFilter = 'ACTIVE' | 'PAID_OFF'

/** `monthlyAmount` string digit; `startMonth` bulan `YYYY-MM`. */
export interface InstallmentInput {
  name: string
  monthlyAmount: string
  startMonth: string
  months: number
  notes: string | null
}

/** Ringkasan di atas halaman selalu atas semua cicilan, apa pun filternya. */
export function listInstallments(filter: { status?: InstallmentFilter | null } = {}): Promise<InstallmentList> {
  return request('/installments', { query: { ...filter } })
}

export function getInstallment(id: string): Promise<InstallmentDetail> {
  return request(`/installments/${id}`)
}

export function createInstallment(input: InstallmentInput): Promise<Installment> {
  return request('/installments', { method: 'POST', body: input })
}

export function updateInstallment(id: string, input: Partial<InstallmentInput>): Promise<Installment> {
  return request(`/installments/${id}`, { method: 'PATCH', body: input })
}

export function deleteInstallment(id: string): Promise<void> {
  return request(`/installments/${id}`, { method: 'DELETE' })
}
