import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { FinanceSummaryService } from './finance-summary.service.js';
import { WishlistController } from './wishlist.controller.js';
import { WishlistService } from './wishlist.service.js';

@Module({
  imports: [AccountsModule, ReportsModule],
  controllers: [WishlistController],
  providers: [WishlistService, FinanceSummaryService],
})
export class WishlistModule {}
