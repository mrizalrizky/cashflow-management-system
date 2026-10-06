import { Module } from '@nestjs/common';
import { AccountBalanceService } from './account-balance.service.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService, AccountBalanceService],
  exports: [AccountBalanceService],
})
export class AccountsModule {}
