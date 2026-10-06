import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { Paginated } from '../common/pagination.js';
import {
  AccountOption,
  AccountResponse,
  toAccountOption,
  toAccountResponse,
} from './account.mapper.js';
import { AccountsService } from './accounts.service.js';
import { CreateAccountDto, ListAccountsQueryDto, UpdateAccountDto } from './dto/account.dto.js';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /** Semua peran boleh memilih akun saat input transaksi, tetapi tanpa melihat saldo. */
  @Get('options')
  async options(): Promise<AccountOption[]> {
    return (await this.accounts.options()).map(toAccountOption);
  }

  @Roles('SUPER_ADMIN')
  @Get()
  async list(@Query() query: ListAccountsQueryDto): Promise<Paginated<AccountResponse>> {
    const page = await this.accounts.list(query);
    return { ...page, data: page.data.map(toAccountResponse) };
  }

  @Roles('SUPER_ADMIN')
  @Post()
  async create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateAccountDto,
    @Ip() ip: string,
  ): Promise<AccountResponse> {
    return toAccountResponse(await this.accounts.create(actor, dto, ip));
  }

  @Roles('SUPER_ADMIN')
  @Patch(':id')
  async update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
    @Ip() ip: string,
  ): Promise<AccountResponse> {
    return toAccountResponse(await this.accounts.update(actor, id, dto, ip));
  }
}
