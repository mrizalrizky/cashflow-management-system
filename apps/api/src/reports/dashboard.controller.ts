import { Controller, Get, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { DashboardService } from './dashboard.service.js';
import { PeriodQueryDto } from './dto/period-query.dto.js';
import type { CompanyDashboardResponse } from './report.mapper.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Saldo dan arus kas seluruh perusahaan; hanya untuk SUPER_ADMIN. */
  @Roles('SUPER_ADMIN')
  @Get('company')
  company(
    @CurrentUser() user: AuthUser,
    @Query() query: PeriodQueryDto,
  ): Promise<CompanyDashboardResponse> {
    return this.dashboard.company(user, query);
  }
}
