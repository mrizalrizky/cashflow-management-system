import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { CashflowReportService } from './cashflow-report.service.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [AccountsModule, TransactionsModule],
  controllers: [DashboardController],
  providers: [CashflowReportService, DashboardService],
})
export class ReportsModule {}
