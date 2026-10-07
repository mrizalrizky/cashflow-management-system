import { Module } from '@nestjs/common';
import { TransactionAccessService } from './transaction-access.service.js';
import { TransactionWorkflowService } from './transaction-workflow.service.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionWorkflowService, TransactionAccessService],
  // Dipakai ulang oleh modul lampiran dan, nanti, ringkasan serta ekspor.
  exports: [TransactionAccessService],
})
export class TransactionsModule {}
