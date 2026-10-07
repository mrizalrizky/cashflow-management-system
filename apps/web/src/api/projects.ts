import { request } from './http'
import type { PageParams, Paginated, Project, ProjectOption, ProjectStatus } from './types'

export interface ProjectFilters {
  search?: string
  status?: ProjectStatus | null
}

export interface CreateProjectInput {
  name: string
  clientName: string
  contractValue?: string
  startDate?: string | null
  endDate?: string | null
  notes?: string | null
}

export type UpdateProjectInput = Partial<CreateProjectInput & { status: ProjectStatus }>

export function listProjects(params: PageParams & ProjectFilters): Promise<Paginated<Project>> {
  return request('/projects', { query: { ...params } })
}

export function getProject(id: string): Promise<Project> {
  return request(`/projects/${id}`)
}

export function createProject(input: CreateProjectInput): Promise<Project> {
  return request('/projects', { method: 'POST', body: input })
}

export function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  return request(`/projects/${id}`, { method: 'PATCH', body: input })
}

/** Mengganti seluruh daftar koordinator proyek. */
export function setProjectMembers(id: string, userIds: string[]): Promise<Project> {
  return request(`/projects/${id}/members`, { method: 'PUT', body: { userIds } })
}

/** Proyek aktif yang boleh dipilih pengguna saat mencatat transaksi. */
export function listProjectOptions(): Promise<ProjectOption[]> {
  return request('/projects/options')
}
