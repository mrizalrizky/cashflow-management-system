import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import type { Paginated } from '../common/pagination.js';
import { CreateTransactionDto, ListTransactionsQueryDto } from './dto/transaction.dto.js';
import type { TransactionResponse } from './transaction.mapper.js';
import { TransactionsService } from './transactions.service.js';

/**
 * Semua peran boleh memanggil rute ini; yang membatasi adalah scope (apa yang terlihat)
 * dan policy (apa yang boleh dilakukan), keduanya di sisi service.
 */
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<Paginated<TransactionResponse>> {
    return this.transactions.list(user, query);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TransactionResponse> {
    return this.transactions.get(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTransactionDto,
    @Ip() ip: string,
  ): Promise<TransactionResponse> {
    return this.transactions.create(user, dto, ip);
  }
}
