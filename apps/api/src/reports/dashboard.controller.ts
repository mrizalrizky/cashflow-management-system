import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service.js';
import { PeriodQueryDto } from './dto/period-query.dto.js';
import type { CompanyDashboardResponse } from './report.mapper.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Saldo dan arus kas pada sebuah periode. */
  @Get('company')
  company(@Query() query: PeriodQueryDto): Promise<CompanyDashboardResponse> {
    return this.dashboard.company(query);
  }
}
