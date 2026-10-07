import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { ProjectSummaryService } from './project-summary.service.js';
import type { ProjectSummaryResponse } from './report.mapper.js';

/**
 * Rute ringkasan berada di bawah `/projects`, tetapi dikelola modul laporan: modul proyek
 * tidak perlu bergantung pada modul transaksi.
 */
@Controller('projects')
export class ProjectSummaryController {
  constructor(private readonly summaries: ProjectSummaryService) {}

  @Roles('SUPER_ADMIN', 'PROJECT_MANAGER')
  @Get(':id/summary')
  summary(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProjectSummaryResponse> {
    return this.summaries.summary(user, id);
  }
}
