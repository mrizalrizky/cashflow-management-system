import { request } from './http'
import type { CompanyDashboard, Period } from './types'

/** Tanpa tanggal, API memakai dua belas bulan terakhir. Hanya untuk SUPER_ADMIN. */
export function getCompanyDashboard(period: Partial<Period> = {}): Promise<CompanyDashboard> {
  return request('/dashboard/company', { query: { ...period } })
}

