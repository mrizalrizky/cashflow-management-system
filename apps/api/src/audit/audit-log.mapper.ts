import type { Prisma } from '../generated/prisma/client.js';

export const AUDIT_LOG_INCLUDE = {
  user: { select: { id: true, name: true } },
} satisfies Prisma.AuditLogInclude;

export type AuditLogWithUser = Prisma.AuditLogGetPayload<{ include: typeof AUDIT_LOG_INCLUDE }>;

export interface AuditLogResponse {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  /** null bila tidak ada pelaku yang dikenal, mis. login gagal dengan email tak terdaftar. */
  user: { id: string; name: string } | null;
  /** Keadaan sebelum dan sesudah, seperti disimpan (sudah tanpa field rahasia). */
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

export function toAuditLogResponse(log: AuditLogWithUser): AuditLogResponse {
  return {
    id: log.id,
    action: log.action,
    entityType: log.entity_type,
    entityId: log.entity_id,
    user: log.user ? { id: log.user.id, name: log.user.name } : null,
    before: log.before ?? null,
    after: log.after ?? null,
    ip: log.ip,
    createdAt: log.created_at.toISOString(),
  };
}
