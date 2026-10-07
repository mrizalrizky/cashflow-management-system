import { once } from 'node:events';
import type { Writable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { formatCalendarDate, formatJakartaTimestamp } from '../common/calendar-date.js';
import { CSV_BOM, toCsvRow } from '../common/csv.js';
import { fromMoney } from '../common/money.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, TxStatus, TxType } from '../generated/prisma/client.js';
import type { TransactionFiltersDto } from './dto/transaction.dto.js';
import { TransactionAccessService } from './transaction-access.service.js';
import { TRANSACTION_LIST_ORDER, toTransactionWhere } from './transaction-filters.js';
import { TRANSACTION_ENTITY } from './transaction-guards.js';

/** Jumlah baris yang dibaca dari database dalam satu kali ambil. */
export const EXPORT_BATCH_SIZE = 1_000;

const TYPE_LABELS: Record<TxType, string> = { IN: 'Masuk', OUT: 'Keluar' };
const STATUS_LABELS: Record<TxStatus, string> = {
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  VOID: 'Dibatalkan',
};

const HEADER = [
  'Tanggal',
  'Tipe',
  'Jumlah',
  'Keterangan',
  'Akun',
  'Kategori',
  'Kode Proyek',
  'Proyek',
  'Status',
  'Transfer',
  'Dicatat oleh',
  'Ditinjau oleh',
  'Alasan penolakan',
  'Alasan pembatalan',
  'Jumlah bukti',
  'Dicatat pada',
];

/** Hanya kolom yang ditulis ke berkas. */
const EXPORT_SELECT = {
  id: true,
  transaction_date: true,
  type: true,
  amount: true,
  description: true,
  status: true,
  transfer_group_id: true,
  reject_reason: true,
  void_reason: true,
  created_at: true,
  account: { select: { name: true } },
  category: { select: { name: true } },
  project: { select: { code: true, name: true } },
  created_by: { select: { name: true } },
  reviewed_by: { select: { name: true } },
  _count: { select: { attachments: true } },
} satisfies Prisma.TransactionSelect;

type ExportRow = Prisma.TransactionGetPayload<{ select: typeof EXPORT_SELECT }>;

function toCells(row: ExportRow): (string | null)[] {
  return [
    formatCalendarDate(row.transaction_date),
    TYPE_LABELS[row.type],
    fromMoney(row.amount),
    row.description,
    row.account.name,
    row.category.name,
    row.project?.code ?? null,
    row.project?.name ?? null,
    STATUS_LABELS[row.status],
    row.transfer_group_id ? 'Ya' : 'Tidak',
    row.created_by.name,
    row.reviewed_by?.name ?? null,
    row.reject_reason,
    row.void_reason,
    String(row._count.attachments),
    formatJakartaTimestamp(row.created_at),
  ];
}

/** Sebuah ekspor yang sudah lolos pemeriksaan dan siap ditulis. */
export interface PreparedExport {
  fileName: string;
  /** Menulis seluruh berkas ke `out` dan mengembalikan jumlah barisnya. */
  writeTo(out: Writable): Promise<number>;
}

/**
 * Ekspor transaksi ke CSV. Isinya persis daftar transaksi pengguna itu dengan filter yang
 * sama (scope dan filter yang sama, urutan yang sama). Baris dibaca per kelompok dan langsung
 * dialirkan, jadi memori tidak bertambah seiring jumlah baris.
 */
@Injectable()
export class TransactionExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TransactionAccessService,
    private readonly audit: AuditService,
  ) {}

  /** Memeriksa filter dan hak lebih dulu, supaya kesalahan dijawab sebelum berkas mulai dikirim. */
  async prepare(
    user: AuthUser,
    filters: TransactionFiltersDto,
    ip: string | null,
  ): Promise<PreparedExport> {
    const actor = await this.access.actorFor(this.prisma, user);
    const where: Prisma.TransactionWhereInput = {
      AND: [this.access.scope(actor), toTransactionWhere(filters)],
    };
    const stamp = formatJakartaTimestamp(new Date()).replace(/[-:]/g, '').replace(' ', '-');

    return {
      fileName: `transaksi-${stamp}.csv`,
      writeTo: async (out) => {
        const rows = await this.stream(where, out);
        await this.audit.log(this.prisma, {
          userId: user.id,
          action: 'EXPORT',
          entityType: TRANSACTION_ENTITY,
          entityId: 'export',
          after: { filters, rows },
          ip,
        });
        return rows;
      },
    };
  }

  private async stream(where: Prisma.TransactionWhereInput, out: Writable): Promise<number> {
    let rows = 0;
    let lastId: string | undefined;
    await write(out, CSV_BOM + toCsvRow(HEADER));

    for (;;) {
      const batch: ExportRow[] = await this.prisma.transaction.findMany({
        where,
        select: EXPORT_SELECT,
        orderBy: TRANSACTION_LIST_ORDER,
        take: EXPORT_BATCH_SIZE,
        // Lanjut tepat setelah baris terakhir kelompok sebelumnya, menurut urutan yang sama.
        ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {}),
      });
      if (batch.length === 0) break;

      await write(out, batch.map((row) => toCsvRow(toCells(row))).join(''));
      rows += batch.length;
      lastId = batch[batch.length - 1]!.id;
      if (batch.length < EXPORT_BATCH_SIZE) break;
    }
    return rows;
  }
}

/** Menulis dan, bila penerimanya lambat, menunggu sampai ia siap lagi. */
async function write(out: Writable, chunk: string): Promise<void> {
  if (!out.write(chunk)) await once(out, 'drain');
}
