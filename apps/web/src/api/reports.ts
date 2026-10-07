import { request } from './http'
import type { CompanyDashboard, Period, ProjectSummary } from './types'

/** Tanpa tanggal, API memakai dua belas bulan terakhir. Hanya untuk SUPER_ADMIN. */
export function getCompanyDashboard(period: Partial<Period> = {}): Promise<CompanyDashboard> {
  return request('/dashboard/company', { query: { ...period } })
}

/** Ringkasan sepanjang umur proyek; untuk admin dan koordinator proyek tersebut. */
export function getProjectSummary(projectId: string): Promise<ProjectSummary> {
  return request(`/projects/${projectId}/summary`)
}
