import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { currentMonthInJakarta, parseCalendarMonth } from '../common/calendar-date.js';
import { fromMoney, toMoney } from '../common/money.js';
import { validationFailed } from '../common/validation.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Installment, Prisma } from '../generated/prisma/client.js';
import { toTransactionResponse, TRANSACTION_INCLUDE } from '../transactions/transaction.mapper.js';
import type {
  CreateInstallmentDto,
  InstallmentFilter,
  ListInstallmentsQueryDto,
  UpdateInstallmentDto,
} from './dto/installment.dto.js';
import { lockInstallment, paidAmount, paidCount } from './installment-lock.js';
import {
  InstallmentDetailResponse,
  InstallmentListResponse,
  InstallmentResponse,
  InstallmentSummary,
  Payments,
  progressFor,
  toInstallmentResponse,
  toInstallmentSnapshot,
} from './installment.mapper.js';

const ENTITY = 'installment';

function notFound(): NotFoundException {
  return new NotFoundException('Cicilan tidak ditemukan');
}

/** Catatan kosong disimpan sebagai null; undefined berarti tidak diubah. */
function notesOf(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === null || value === '' ? null : value;
}

function matchesFilter(item: InstallmentResponse, filter: InstallmentFilter | undefined): boolean {
  if (filter === undefined) return true;
  return filter === 'PAID_OFF' ? item.status === 'PAID_OFF' : item.status !== 'PAID_OFF';
}

@Injectable()
export class InstallmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Cicilan jumlahnya sedikit: semuanya dimuat, dan ringkasan selalu atas semuanya. */
  async list(query: ListInstallmentsQueryDto): Promise<InstallmentListResponse> {
    const month = currentMonthInJakarta();
    const installments = await this.prisma.installment.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }] });
    const payments = await this.payments(installments.map((installment) => installment.id));
    const all = installments.map((installment) => {
      const paid = payments.get(installment.id) ?? { count: 0, amount: 0n };
      return toInstallmentResponse(installment, progressFor(installment, paid.count, month), paid.amount);
    });
    return {
      items: all.filter((item) => matchesFilter(item, query.status)),
      summary: this.summarize(installments, all, month),
    };
  }

  async get(id: string): Promise<InstallmentDetailResponse> {
    const installment = await this.prisma.installment.findUnique({ where: { id } });
    if (!installment) throw notFound();
    const transactions = await this.prisma.transaction.findMany({
      where: { installment_id: id },
      include: TRANSACTION_INCLUDE,
      orderBy: [{ transaction_date: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
    });
    const counted = transactions.filter((transaction) => transaction.status !== 'VOID');
    const amount = counted.reduce((sum, transaction) => sum + transaction.amount, 0n);
    return {
      ...toInstallmentResponse(installment, progressFor(installment, counted.length, currentMonthInJakarta()), amount),
      transactions: transactions.map(toTransactionResponse),
    };
  }

  create(actor: AuthUser, dto: CreateInstallmentDto, ip: string | null): Promise<InstallmentResponse> {
    return this.prisma.$transaction(async (tx) => {
      const installment = await tx.installment.create({
        data: {
          name: dto.name,
          monthly_amount: toMoney(dto.monthlyAmount),
          start_month: parseCalendarMonth(dto.startMonth),
          months: dto.months,
          notes: notesOf(dto.notes) ?? null,
        },
      });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'CREATE',
        entityType: ENTITY,
        entityId: installment.id,
        after: toInstallmentSnapshot(installment),
        ip,
      });
      return this.respond(tx, installment);
    });
  }

  /** Semua isian boleh diubah, kecuali jumlah bulan di bawah pembayaran yang sudah tercatat. */
  update(
    actor: AuthUser,
    id: string,
    dto: UpdateInstallmentDto,
    ip: string | null,
  ): Promise<InstallmentResponse> {
    return this.prisma.$transaction(async (tx) => {
      const before = await lockInstallment(tx, id);
      if (!before) throw notFound();
      if (dto.months !== undefined) {
        const paid = await paidCount(tx, id);
        if (dto.months < paid) {
          throw validationFailed([
            {
              field: 'months',
              messages: [`Jumlah bulan tidak boleh kurang dari ${paid} pembayaran yang sudah tercatat`],
            },
          ]);
        }
      }
      const installment = await tx.installment.update({
        where: { id },
        data: {
          name: dto.name,
          monthly_amount: dto.monthlyAmount === undefined ? undefined : toMoney(dto.monthlyAmount),
          start_month: dto.startMonth === undefined ? undefined : parseCalendarMonth(dto.startMonth),
          months: dto.months,
          notes: notesOf(dto.notes),
        },
      });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'UPDATE',
        entityType: ENTITY,
        entityId: id,
        before: toInstallmentSnapshot(before),
        after: toInstallmentSnapshot(installment),
        ip,
      });
      return this.respond(tx, installment);
    });
  }

  /** Hanya cicilan tanpa transaksi tertaut, termasuk yang VOID, yang boleh dihapus. */
  delete(actor: AuthUser, id: string, ip: string | null): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const before = await lockInstallment(tx, id);
      if (!before) throw notFound();
      if ((await tx.transaction.count({ where: { installment_id: id } })) > 0) {
        throw new ConflictException('Cicilan sudah punya pembayaran tercatat, jadi tidak bisa dihapus');
      }
      await tx.installment.delete({ where: { id } });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'DELETE',
        entityType: ENTITY,
        entityId: id,
        before: toInstallmentSnapshot(before),
        ip,
      });
    });
  }

  private summarize(
    installments: Installment[],
    all: InstallmentResponse[],
    month: string,
  ): InstallmentSummary {
    const unpaid = all
      .filter((item) => item.status === 'BEHIND')
      .map((item) => ({
        id: item.id,
        name: item.name,
        months: item.behindMonths,
        amount: fromMoney(BigInt(item.behindMonths) * toMoney(item.monthlyAmount)),
      }));
    const activeMonthlyTotal = installments
      .filter((installment) => progressFor(installment, 0, month).coversMonth)
      .reduce((sum, installment) => sum + installment.monthly_amount, 0n);
    return {
      month,
      activeMonthlyTotal: fromMoney(activeMonthlyTotal),
      unpaid,
      unpaidTotal: fromMoney(unpaid.reduce((sum, item) => sum + toMoney(item.amount), 0n)),
      remainingTotal: fromMoney(all.reduce((sum, item) => sum + toMoney(item.remainingAmount), 0n)),
    };
  }

  private async respond(tx: Prisma.TransactionClient, installment: Installment): Promise<InstallmentResponse> {
    const paid = await paidCount(tx, installment.id);
    return toInstallmentResponse(
      installment,
      progressFor(installment, paid, currentMonthInJakarta()),
      await paidAmount(tx, installment.id),
    );
  }

  /** Satu query untuk semua cicilan: berapa bulan dan berapa rupiah yang sudah dibayar. */
  private async payments(ids: string[]): Promise<Map<string, Payments>> {
    const groups = await this.prisma.transaction.groupBy({
      by: ['installment_id'],
      where: { installment_id: { in: ids }, status: { not: 'VOID' } },
      _count: { _all: true },
      _sum: { amount: true },
    });
    return new Map(
      groups.map((group) => [group.installment_id!, { count: group._count._all, amount: group._sum.amount ?? 0n }]),
    );
  }
}
