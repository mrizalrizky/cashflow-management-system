import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PasswordService } from '../auth/password.service.js';
import { SessionService } from '../auth/session.service.js';
import { Paginated, paginated, toSkipTake } from '../common/pagination.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { containsText } from '../common/search.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import type { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from './dto/user.dto.js';

const ENTITY = 'user';

/** Kunci advisory PostgreSQL yang menyerikan semua perubahan peran dan status aktif. */
const ACCESS_CHANGE_LOCK = 7301;

function notFound(): NotFoundException {
  return new NotFoundException('Pengguna tidak ditemukan');
}

function toWhere(query: ListUsersQueryDto): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  if (query.role) where.role = query.role;
  if (query.isActive !== undefined) where.is_active = query.isActive;
  if (query.search) {
    where.OR = [
      { name: containsText(query.search) },
      { email: containsText(query.search) },
    ];
  }
  return where;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersQueryDto): Promise<Paginated<User>> {
    const where = toWhere(query);
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(users, total, query);
  }

  async get(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound();
    return user;
  }

  async create(actor: AuthUser, dto: CreateUserDto, ip: string | null): Promise<User> {
    const password_hash = await this.passwords.hash(dto.password);

    return this.withUniqueEmail(() =>
      this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: dto.name,
            email: dto.email,
            role: dto.role,
            password_hash,
            must_change_password: true,
          },
        });
        await this.audit.log(tx, {
          userId: actor.id,
          action: 'CREATE',
          entityType: ENTITY,
          entityId: user.id,
          after: user,
          ip,
        });
        return user;
      }),
    );
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto, ip: string | null): Promise<User> {
    return this.withUniqueEmail(() =>
      this.prisma.$transaction(async (tx) => {
        if (dto.role !== undefined || dto.isActive !== undefined) {
          await this.lockAccessChanges(tx);
        }
        const before = await tx.user.findUnique({ where: { id } });
        if (!before) throw notFound();

        const roleChanges = dto.role !== undefined && dto.role !== before.role;
        const deactivates = dto.isActive === false && before.is_active;
        const accessChanges = roleChanges || deactivates;

        if (accessChanges) {
          await this.assertAccessChangeAllowed(tx, actor, before);
        }

        const after = await tx.user.update({
          where: { id },
          data: { name: dto.name, email: dto.email, role: dto.role, is_active: dto.isActive },
        });
        if (accessChanges) {
          await this.sessions.endAll(tx, id);
        }
        await this.audit.log(tx, {
          userId: actor.id,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: id,
          before,
          after,
          ip,
        });
        return after;
      }),
    );
  }

  /** Password sementara dari admin; user wajib menggantinya saat login berikutnya. */
  async resetPassword(
    actor: AuthUser,
    id: string,
    newPassword: string,
    ip: string | null,
  ): Promise<User> {
    const password_hash = await this.passwords.hash(newPassword);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id } });
      if (!existing) throw notFound();

      const user = await tx.user.update({
        where: { id },
        data: { password_hash, must_change_password: true },
      });
      await this.sessions.endAll(tx, id);
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'RESET_PASSWORD',
        entityType: ENTITY,
        entityId: id,
        ip,
      });
      return user;
    });
  }

  /**
   * Tanpa kunci ini dua admin yang saling menurunkan pada saat bersamaan sama-sama lolos
   * pengecekan dan tidak ada SUPER_ADMIN yang tersisa. Kunci dilepas saat transaksi selesai.
   */
  private async lockAccessChanges(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ACCESS_CHANGE_LOCK})`;
  }

  /** Mencegah admin mengunci dirinya sendiri atau menghilangkan SUPER_ADMIN aktif terakhir. */
  private async assertAccessChangeAllowed(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    target: User,
  ): Promise<void> {
    if (actor.id === target.id) {
      throw new BadRequestException('Tidak bisa menonaktifkan atau mengubah peran akun sendiri');
    }
    if (target.role !== 'SUPER_ADMIN' || !target.is_active) return;

    const otherActiveAdmins = await tx.user.count({
      where: { role: 'SUPER_ADMIN', is_active: true, id: { not: target.id } },
    });
    if (otherActiveAdmins === 0) {
      throw new BadRequestException('Harus ada minimal satu SUPER_ADMIN aktif');
    }
  }

  private async withUniqueEmail<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Email sudah dipakai');
      throw error;
    }
  }
}
