import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { Paginated } from '../common/pagination.js';
import {
  CreateTransactionDto,
  ListTransactionsQueryDto,
  ReasonDto,
  RejectDto,
  ReviewDto,
  TransferDto,
  UpdateTransactionDto,
} from './dto/transaction.dto.js';
import type { TransactionResponse } from './transaction.mapper.js';
import { ApprovalResponse, TransactionWorkflowService } from './transaction-workflow.service.js';
import { TransactionsService } from './transactions.service.js';
import { TransfersService } from './transfers.service.js';

/**
 * Semua peran boleh memanggil rute ini; yang membatasi adalah scope (apa yang terlihat)
 * dan policy (apa yang boleh dilakukan), keduanya di sisi service.
 */
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly workflow: TransactionWorkflowService,
    private readonly transfers: TransfersService,
  ) {}

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

  /** Transfer antar akun menyentuh saldo, jadi hanya untuk SUPER_ADMIN. */
  @Roles('SUPER_ADMIN')
  @Post('transfer')
  transfer(
    @CurrentUser() user: AuthUser,
    @Body() dto: TransferDto,
    @Ip() ip: string,
  ): Promise<TransactionResponse[]> {
    return this.transfers.create(user, dto, ip);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
    @Ip() ip: string,
  ): Promise<TransactionResponse> {
    return this.transactions.update(user, id, dto, ip);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
    @Ip() ip: string,
  ): Promise<TransactionResponse> {
    return this.workflow.cancel(user, id, dto.reason, ip);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
    @Ip() ip: string,
  ): Promise<ApprovalResponse> {
    return this.workflow.approve(user, id, ip, dto.expectedUpdatedAt);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectDto,
    @Ip() ip: string,
  ): Promise<TransactionResponse> {
    return this.workflow.reject(user, id, dto.reason, ip, dto.expectedUpdatedAt);
  }

  @Post(':id/void')
  @HttpCode(200)
  void(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
    @Ip() ip: string,
  ): Promise<TransactionResponse> {
    return this.workflow.void(user, id, dto.reason, ip);
  }
}
