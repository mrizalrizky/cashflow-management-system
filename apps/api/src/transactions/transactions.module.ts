import { Module } from '@nestjs/common';
import { TransactionAccessService } from './transaction-access.service.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionAccessService],
  // Dipakai ulang oleh modul lampiran dan, nanti, ringkasan serta ekspor.
  exports: [TransactionAccessService],
})
export class TransactionsModule {}
