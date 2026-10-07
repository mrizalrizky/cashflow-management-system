import { Injectable } from '@nestjs/common';
import { endOfJakartaDay, startOfJakartaDay } from '../common/calendar-date.js';
import { Paginated, paginated, toSkipTake } from '../common/pagination.js';
import { validationFailed } from '../common/validation.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AUDIT_LOG_INCLUDE, AuditLogResponse, toAuditLogResponse } from './audit-log.mapper.js';
import type { ListAuditLogsQueryDto } from './dto/list-audit-logs.dto.js';

function toWhere(query: ListAuditLogsQueryDto): Prisma.AuditLogWhereInput {
  // Tanggal kalender `YYYY-MM-DD` bisa dibandingkan langsung sebagai teks.
  if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
    throw validationFailed([
      { field: 'dateFrom', messages: ['Tanggal awal tidak boleh setelah tanggal akhir'] },
    ]);
  }

  const where: Prisma.AuditLogWhereInput = {};
  if (query.entityType) where.entity_type = query.entityType;
  if (query.entityId) where.entity_id = query.entityId;
  if (query.userId) where.user_id = query.userId;
  if (query.action) where.action = query.action;
  if (query.dateFrom || query.dateTo) {
    where.created_at = {
      gte: query.dateFrom ? startOfJakartaDay(query.dateFrom) : undefined,
      lt: query.dateTo ? endOfJakartaDay(query.dateTo) : undefined,
    };
  }
  return where;
}

/** Membaca log audit. Log hanya bertambah lewat `AuditService`; tidak ada yang mengubah atau menghapusnya. */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAuditLogsQueryDto): Promise<Paginated<AuditLogResponse>> {
    const where = toWhere(query);
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: AUDIT_LOG_INCLUDE,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        ...toSkipTake(query),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(logs.map(toAuditLogResponse), total, query);
  }
}
