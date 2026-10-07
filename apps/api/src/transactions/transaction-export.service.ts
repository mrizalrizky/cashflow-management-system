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

/** Sebuah ekspor yang sudah lolos pemeriksaan, sudah dicatat di log audit, dan siap ditulis. */
export interface PreparedExport {
  fileName: string;
  /**
   * Menulis berkas ke `out` dan mengembalikan jumlah baris yang tertulis. Berhenti (tanpa
   * melempar) bila penerimanya menutup sambungan di tengah jalan.
   */
  writeTo(out: Writable): Promise<number>;
}

/** Posisi sebuah baris dalam urutan daftar; cukup untuk melanjutkan tepat sesudahnya. */
type Position = Pick<ExportRow, 'transaction_date' | 'created_at' | 'id'>;

/**
 * Baris-baris sesudah `last` menurut `TRANSACTION_LIST_ORDER` (semuanya menurun). Posisinya
 * diambil dari nilai yang sudah dibaca, bukan dibaca ulang dari database, sehingga baris
 * batas yang diubah orang lain selagi ekspor berjalan tidak membuat baris lain terlewat.
 */
function after(last: Position): Prisma.TransactionWhereInput {
  const { transaction_date, created_at, id } = last;
  return {
    OR: [
      { transaction_date: { lt: transaction_date } },
      { transaction_date, created_at: { lt: created_at } },
      { transaction_date, created_at, id: { lt: id } },
    ],
  };
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

  /**
   * Memeriksa filter dan hak, lalu mencatat ekspor di log audit, semuanya sebelum satu byte
   * pun dikirim. Dengan begitu kesalahan masih bisa dijawab sebagai error biasa, dan ekspor
   * tetap tercatat walau penerimanya memutus sambungan sebelum berkas selesai.
   */
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

    await this.audit.log(this.prisma, {
      userId: user.id,
      action: 'EXPORT',
      entityType: TRANSACTION_ENTITY,
      entityId: 'export',
      // Jumlah baris yang cocok saat ekspor diminta.
      after: { filters, rows: await this.prisma.transaction.count({ where }) },
      ip,
    });

    return { fileName: `transaksi-${stamp}.csv`, writeTo: (out) => this.stream(where, out) };
  }

  private async stream(where: Prisma.TransactionWhereInput, out: Writable): Promise<number> {
    let rows = 0;
    let last: Position | undefined;

    for (;;) {
      const batch: ExportRow[] = await this.prisma.transaction.findMany({
        where: last ? { AND: [where, after(last)] } : where,
        select: EXPORT_SELECT,
        orderBy: TRANSACTION_LIST_ORDER,
        take: EXPORT_BATCH_SIZE,
      });

      // Judul kolom baru ditulis setelah pembacaan pertama berhasil, supaya kegagalan
      // database tidak menghasilkan berkas yang tampak sah tetapi kosong.
      const head = last ? '' : CSV_BOM + toCsvRow(HEADER);
      const delivered = await write(out, head + batch.map((row) => toCsvRow(toCells(row))).join(''));
      if (!delivered) break;

      rows += batch.length;
      if (batch.length < EXPORT_BATCH_SIZE) break;
      last = batch[batch.length - 1]!;
    }
    return rows;
  }
}

/**
 * Menulis dan, bila penerimanya lambat, menunggu sampai ia siap lagi. Mengembalikan false
 * bila penerima sudah menutup sambungan, supaya pembacaan dari database berhenti.
 */
async function write(out: Writable, chunk: string): Promise<boolean> {
  if (out.destroyed) return false;
  if (!out.write(chunk)) {
    // Menunggu mana yang lebih dulu: penerima siap lagi, atau sambungannya putus.
    const waiting = new AbortController();
    const settled = (event: string) => once(out, event, { signal: waiting.signal }).catch(() => undefined);
    await Promise.race([settled('drain'), settled('close')]);
    waiting.abort();
  }
  return !out.destroyed;
}
