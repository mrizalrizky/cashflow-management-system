import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { lockForTransaction, LOCKS } from '../common/advisory-lock.js';
import { equalsText } from '../common/search.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Category, Prisma, TxType } from '../generated/prisma/client.js';
import type {
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from './dto/category.dto.js';

const ENTITY = 'category';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Kategori jumlahnya sedikit, jadi dikembalikan seluruhnya tanpa halaman. */
  list(user: AuthUser, query: ListCategoriesQueryDto): Promise<Category[]> {
    // Hanya SUPER_ADMIN yang mengelola kategori; peran lain cukup melihat yang masih dipakai.
    const isActive = user.role === 'SUPER_ADMIN' ? query.isActive : true;
    return this.prisma.category.findMany({
      where: { type: query.type, is_active: isActive },
      orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  async create(actor: AuthUser, dto: CreateCategoryDto, ip: string | null): Promise<Category> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertNameAvailable(tx, dto.name, dto.type);
      const category = await tx.category.create({ data: { name: dto.name, type: dto.type } });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'CREATE',
        entityType: ENTITY,
        entityId: category.id,
        after: category,
        ip,
      });
      return category;
    });
  }

  async update(
    actor: AuthUser,
    id: string,
    dto: UpdateCategoryDto,
    ip: string | null,
  ): Promise<Category> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.category.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Kategori tidak ditemukan');
      // Kategori sistem (Transfer Masuk/Keluar) dirujuk oleh logika transfer.
      if (before.is_system) throw new BadRequestException('Kategori sistem tidak bisa diubah');
      if (dto.name !== undefined) await this.assertNameAvailable(tx, dto.name, before.type, id);

      const category = await tx.category.update({
        where: { id },
        data: { name: dto.name, is_active: dto.isActive },
      });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'UPDATE',
        entityType: ENTITY,
        entityId: id,
        before,
        after: category,
        ip,
      });
      return category;
    });
  }

  /**
   * Nama unik per tipe, tanpa membedakan huruf besar/kecil. Nama kategori sistem tidak boleh
   * dipakai di tipe mana pun, supaya tidak tertukar dengan kategori transfer yang asli.
   * Kunci mencegah dua request dengan nama yang sama lolos pengecekan bersamaan.
   */
  private async assertNameAvailable(
    tx: Prisma.TransactionClient,
    name: string,
    type: TxType,
    exceptId?: string,
  ): Promise<void> {
    await lockForTransaction(tx, LOCKS.categoryName);
    const taken = await tx.category.findFirst({
      where: {
        name: equalsText(name),
        OR: [{ type }, { is_system: true }],
        id: exceptId ? { not: exceptId } : undefined,
      },
    });
    if (taken) throw new ConflictException('Kategori sudah ada');
  }
}
