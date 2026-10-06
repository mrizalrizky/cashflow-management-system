import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { toMoney } from '../common/money.js';
import { Paginated, paginated, toSkipTake } from '../common/pagination.js';
import { containsText, equalsText } from '../common/search.js';
import type { Db } from '../database/db.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Account, Prisma } from '../generated/prisma/client.js';
import { AccountBalanceService } from './account-balance.service.js';
import type { AccountWithBalance } from './account.mapper.js';
import type { CreateAccountDto, ListAccountsQueryDto, UpdateAccountDto } from './dto/account.dto.js';

const ENTITY = 'account';

function toWhere(query: ListAccountsQueryDto): Prisma.AccountWhereInput {
  const where: Prisma.AccountWhereInput = {};
  if (query.type) where.type = query.type;
  if (query.isActive !== undefined) where.is_active = query.isActive;
  if (query.search) where.name = containsText(query.search);
  return where;
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: AccountBalanceService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListAccountsQueryDto): Promise<Paginated<AccountWithBalance>> {
    const where = toWhere(query);
    const [accounts, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.account.count({ where }),
    ]);
    const balances = await this.balances.balancesOf(this.prisma, accounts);
    const items = accounts.map((account) => ({ account, balance: balances.get(account.id)! }));
    return paginated(items, total, query);
  }

  /** Akun aktif untuk dropdown input transaksi. */
  options(): Promise<Pick<Account, 'id' | 'name' | 'type'>[]> {
    return this.prisma.account.findMany({
      where: { is_active: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, type: true },
    });
  }

  async create(actor: AuthUser, dto: CreateAccountDto, ip: string | null): Promise<AccountWithBalance> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertNameAvailable(tx, dto.name);
      const account = await tx.account.create({
        data: {
          name: dto.name,
          type: dto.type,
          opening_balance: toMoney(dto.openingBalance ?? '0'),
        },
      });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'CREATE',
        entityType: ENTITY,
        entityId: account.id,
        after: account,
        ip,
      });
      return { account, balance: account.opening_balance };
    });
  }

  async update(
    actor: AuthUser,
    id: string,
    dto: UpdateAccountDto,
    ip: string | null,
  ): Promise<AccountWithBalance> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.account.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Akun tidak ditemukan');
      if (dto.name !== undefined) await this.assertNameAvailable(tx, dto.name, id);

      const account = await tx.account.update({
        where: { id },
        data: {
          name: dto.name,
          type: dto.type,
          opening_balance: dto.openingBalance === undefined ? undefined : toMoney(dto.openingBalance),
          is_active: dto.isActive,
        },
      });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'UPDATE',
        entityType: ENTITY,
        entityId: id,
        before,
        after: account,
        ip,
      });
      return { account, balance: await this.balances.balanceOf(tx, account) };
    });
  }

  /** Nama akun unik tanpa membedakan huruf besar/kecil. `exceptId` adalah akun yang sedang diubah. */
  private async assertNameAvailable(db: Db, name: string, exceptId?: string): Promise<void> {
    const taken = await db.account.findFirst({
      where: { name: equalsText(name), id: exceptId ? { not: exceptId } : undefined },
    });
    if (taken) throw new ConflictException('Nama akun sudah dipakai');
  }
}
