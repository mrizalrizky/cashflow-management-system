import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { toMoney } from '../common/money.js';
import { PrismaService } from '../database/prisma.service.js';
import type { WishlistItem } from '../generated/prisma/client.js';
import type {
  CreateWishlistItemDto,
  ListWishlistQueryDto,
  UpdateWishlistItemDto,
} from './dto/wishlist.dto.js';
import {
  toWishlistAnswers,
  toWishlistItemResponse,
  toWishlistSnapshot,
  WishlistAnswers,
  WishlistItemResponse,
} from './wishlist.mapper.js';

export const WISHLIST_ENTITY = 'wishlist_item';

const ANSWER_FIELDS: (keyof WishlistAnswers)[] = [
  'name',
  'price',
  'reason',
  'similarOwned',
  'valueAdded',
  'usageDuration',
];

export function wishlistItemNotFound(): NotFoundException {
  return new NotFoundException('Barang tidak ditemukan');
}

/** Jawaban atau harga yang benar-benar berubah; status dan pilihan ringkasan tidak dihitung. */
function answersChanged(before: WishlistItem, dto: UpdateWishlistItemDto): boolean {
  const current = toWishlistAnswers(before);
  return ANSWER_FIELDS.some((field) => dto[field] !== undefined && dto[field] !== current[field]);
}

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Barang jumlahnya sedikit, jadi dikembalikan seluruhnya, terbaru dulu. */
  async list(query: ListWishlistQueryDto): Promise<WishlistItemResponse[]> {
    const items = await this.prisma.wishlistItem.findMany({
      where: { status: query.status },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    return items.map(toWishlistItemResponse);
  }

  async get(id: string): Promise<WishlistItemResponse> {
    const item = await this.prisma.wishlistItem.findUnique({ where: { id } });
    if (!item) throw wishlistItemNotFound();
    return toWishlistItemResponse(item);
  }

  /** Menyimpan barang tidak memanggil AI. */
  create(actor: AuthUser, dto: CreateWishlistItemDto, ip: string | null): Promise<WishlistItemResponse> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.wishlistItem.create({
        data: {
          name: dto.name,
          price: toMoney(dto.price),
          reason: dto.reason,
          similar_owned: dto.similarOwned,
          value_added: dto.valueAdded,
          usage_duration: dto.usageDuration,
          include_finance: dto.includeFinance ?? true,
        },
      });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'CREATE',
        entityType: WISHLIST_ENTITY,
        entityId: item.id,
        after: toWishlistSnapshot(item),
        ip,
      });
      return toWishlistItemResponse(item);
    });
  }

  update(
    actor: AuthUser,
    id: string,
    dto: UpdateWishlistItemDto,
    ip: string | null,
  ): Promise<WishlistItemResponse> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.wishlistItem.findUnique({ where: { id } });
      if (!before) throw wishlistItemNotFound();
      const item = await tx.wishlistItem.update({
        where: { id },
        data: {
          name: dto.name,
          price: dto.price === undefined ? undefined : toMoney(dto.price),
          reason: dto.reason,
          similar_owned: dto.similarOwned,
          value_added: dto.valueAdded,
          usage_duration: dto.usageDuration,
          include_finance: dto.includeFinance,
          status: dto.status,
          // Penilaian yang sudah ada ditandai "Jawaban sudah diubah".
          answers_changed_at: before.ai_reviewed_at && answersChanged(before, dto) ? new Date() : undefined,
        },
      });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'UPDATE',
        entityType: WISHLIST_ENTITY,
        entityId: id,
        before: toWishlistSnapshot(before),
        after: toWishlistSnapshot(item),
        ip,
      });
      return toWishlistItemResponse(item);
    });
  }
}
