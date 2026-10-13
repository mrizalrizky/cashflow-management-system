import {
  Body,
  Controller,
  Delete,
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
import { CurrentUser } from '../auth/decorators.js';
import { CreateInstallmentDto, ListInstallmentsQueryDto, UpdateInstallmentDto } from './dto/installment.dto.js';
import type {
  InstallmentDetailResponse,
  InstallmentListResponse,
  InstallmentResponse,
} from './installment.mapper.js';
import { InstallmentsService } from './installments.service.js';

@Controller('installments')
export class InstallmentsController {
  constructor(private readonly installments: InstallmentsService) {}

  @Get()
  list(@Query() query: ListInstallmentsQueryDto): Promise<InstallmentListResponse> {
    return this.installments.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<InstallmentDetailResponse> {
    return this.installments.get(id);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateInstallmentDto,
    @Ip() ip: string,
  ): Promise<InstallmentResponse> {
    return this.installments.create(actor, dto, ip);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInstallmentDto,
    @Ip() ip: string,
  ): Promise<InstallmentResponse> {
    return this.installments.update(actor, id, dto, ip);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<void> {
    return this.installments.delete(actor, id, ip);
  }
}
