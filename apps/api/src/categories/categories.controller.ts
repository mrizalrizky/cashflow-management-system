import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { CategoriesService } from './categories.service.js';
import { CategoryResponse, toCategoryResponse } from './category.mapper.js';
import {
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from './dto/category.dto.js';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** Semua peran membutuhkannya untuk dropdown input transaksi. */
  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListCategoriesQueryDto,
  ): Promise<CategoryResponse[]> {
    return (await this.categories.list(user, query)).map(toCategoryResponse);
  }

  @Roles('SUPER_ADMIN')
  @Post()
  async create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateCategoryDto,
    @Ip() ip: string,
  ): Promise<CategoryResponse> {
    return toCategoryResponse(await this.categories.create(actor, dto, ip));
  }

  @Roles('SUPER_ADMIN')
  @Patch(':id')
  async update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @Ip() ip: string,
  ): Promise<CategoryResponse> {
    return toCategoryResponse(await this.categories.update(actor, id, dto, ip));
  }
}
