import { Injectable } from '@nestjs/common';
import type { Db } from '../database/db.js';
import type { Prisma } from '../generated/prisma/client.js';

export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'TOKEN_REUSE'
  | 'CHANGE_PASSWORD'
  | 'RESET_PASSWORD'
  | 'CREATE'
  | 'UPDATE';

export interface AuditEntry {
  userId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

const SECRET_FIELDS = new Set([
  'password_hash',
  'token_hash',
  'password',
  'currentPassword',
  'newPassword',
  'refreshToken',
]);

/** Salinan yang aman disimpan sebagai JSON: tanpa field rahasia, bigint dan tanggal jadi string. */
export function sanitizeForAudit(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitizeForAudit);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SECRET_FIELDS.has(key))
        .map(([key, child]) => [key, sanitizeForAudit(child)]),
    );
  }
  return value;
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined || value === null
    ? undefined
    : (sanitizeForAudit(value) as Prisma.InputJsonValue);
}

@Injectable()
export class AuditService {
  async log(db: Db, entry: AuditEntry): Promise<void> {
    await db.auditLog.create({
      data: {
        user_id: entry.userId,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        before: toJson(entry.before),
        after: toJson(entry.after),
        ip: entry.ip ?? null,
      },
    });
  }
}
