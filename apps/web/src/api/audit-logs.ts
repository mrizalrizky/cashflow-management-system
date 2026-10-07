import { request } from './http'
import type { AuditLog, PageParams, Paginated } from './types'

/** `null` diperlakukan sama dengan tidak diisi (nilai dari dropdown yang dikosongkan). */
export interface AuditLogFilters {
  /** Jenis data, mis. `transaction`. */
  entityType?: string | null
  entityId?: string | null
  userId?: string | null
  /** Mis. `APPROVE`. */
  action?: string | null
  /** Hari kalender Jakarta, kedua ujungnya ikut dihitung. */
  dateFrom?: string | null
  dateTo?: string | null
}

/** Hanya untuk SUPER_ADMIN. Log audit hanya bisa dibaca. */
export function listAuditLogs(params: PageParams & AuditLogFilters): Promise<Paginated<AuditLog>> {
  return request('/audit-logs', { query: { ...params } })
}
