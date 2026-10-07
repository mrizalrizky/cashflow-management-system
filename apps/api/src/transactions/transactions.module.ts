import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { TransactionAccessService } from './transaction-access.service.js';
import { TransactionWorkflowService } from './transaction-workflow.service.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';
import { TransfersService } from './transfers.service.js';

@Module({
  imports: [AccountsModule],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    TransactionWorkflowService,
    TransfersService,
    TransactionAccessService,
  ],
  // Dipakai ulang oleh modul lampiran dan, nanti, ringkasan serta ekspor.
  exports: [TransactionAccessService],
})
export class TransactionsModule {}
