import { Body, Controller, Get, HttpCode, Ip, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { AiReviewService } from './ai/ai-review.service.js';
import { CreateWishlistItemDto, ListWishlistQueryDto, UpdateWishlistItemDto } from './dto/wishlist.dto.js';
import type { WishlistItemResponse } from './wishlist.mapper.js';
import { WishlistService } from './wishlist.service.js';

@Controller('wishlist')
export class WishlistController {
  constructor(
    private readonly wishlist: WishlistService,
    private readonly reviews: AiReviewService,
  ) {}

  @Get()
  list(@Query() query: ListWishlistQueryDto): Promise<WishlistItemResponse[]> {
    return this.wishlist.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<WishlistItemResponse> {
    return this.wishlist.get(id);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateWishlistItemDto,
    @Ip() ip: string,
  ): Promise<WishlistItemResponse> {
    return this.wishlist.create(actor, dto, ip);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWishlistItemDto,
    @Ip() ip: string,
  ): Promise<WishlistItemResponse> {
    return this.wishlist.update(actor, id, dto, ip);
  }

  /** "Minta pendapat AI": satu-satunya rute yang memanggil Claude. */
  @Post(':id/review')
  @HttpCode(200)
  review(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<WishlistItemResponse> {
    return this.reviews.review(actor, id, ip);
  }
}
