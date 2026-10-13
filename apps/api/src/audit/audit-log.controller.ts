import { Controller, Get, Query } from '@nestjs/common';
import type { Paginated } from '../common/pagination.js';
import type { AuditLogResponse } from './audit-log.mapper.js';
import { AuditLogService } from './audit-log.service.js';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs.dto.js';

/** Hanya membaca: tidak ada rute untuk menambah, mengubah, atau menghapus log audit. */
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly logs: AuditLogService) {}

  @Get()
  list(@Query() query: ListAuditLogsQueryDto): Promise<Paginated<AuditLogResponse>> {
    return this.logs.list(query);
  }
}
