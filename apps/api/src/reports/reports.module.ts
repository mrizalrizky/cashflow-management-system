import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { CashflowReportService } from './cashflow-report.service.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { ProjectSummaryController } from './project-summary.controller.js';
import { ProjectSummaryService } from './project-summary.service.js';

@Module({
  imports: [AccountsModule, ProjectsModule, TransactionsModule],
  controllers: [DashboardController, ProjectSummaryController],
  providers: [CashflowReportService, DashboardService, ProjectSummaryService],
})
export class ReportsModule {}
