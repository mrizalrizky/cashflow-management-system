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
  CreateUserDto,
  ListUsersQueryDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './dto/user.dto.js';
import { toUserResponse, UserResponse } from './user.mapper.js';
import { UsersService } from './users.service.js';

@Roles('SUPER_ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(@Query() query: ListUsersQueryDto): Promise<Paginated<UserResponse>> {
    const page = await this.users.list(query);
    return { ...page, data: page.data.map(toUserResponse) };
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponse> {
    return toUserResponse(await this.users.get(id));
  }

  @Post()
  async create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateUserDto,
    @Ip() ip: string,
  ): Promise<UserResponse> {
    return toUserResponse(await this.users.create(actor, dto, ip));
  }

  @Patch(':id')
  async update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Ip() ip: string,
  ): Promise<UserResponse> {
    return toUserResponse(await this.users.update(actor, id, dto, ip));
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  async resetPassword(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @Ip() ip: string,
  ): Promise<UserResponse> {
    return toUserResponse(await this.users.resetPassword(actor, id, dto.newPassword, ip));
  }
}
