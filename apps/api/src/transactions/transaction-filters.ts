import { parseCalendarDate } from '../common/calendar-date.js';
import { containsText } from '../common/search.js';
import { validationFailed } from '../common/validation.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { TransactionFiltersDto } from './dto/transaction.dto.js';

/**
 * Filter pilihan pengguna menjadi kondisi query. Dipakai daftar transaksi dan ekspornya,
 * supaya berkas ekspor selalu berisi persis apa yang tampil di daftar. Scope (apa yang
 * boleh dilihat pengguna) ditambahkan pemanggilnya; filter hanya bisa mempersempit.
 */
export function toTransactionWhere(query: TransactionFiltersDto): Prisma.TransactionWhereInput {
  if (query.projectId && query.overhead) {
    throw validationFailed([
      { field: 'overhead', messages: ['Tidak bisa digabung dengan filter proyek'] },
    ]);
  }

  const where: Prisma.TransactionWhereInput = {};
  if (query.dateFrom || query.dateTo) {
    where.transaction_date = {
      gte: query.dateFrom ? parseCalendarDate(query.dateFrom) : undefined,
      lte: query.dateTo ? parseCalendarDate(query.dateTo) : undefined,
    };
  }
  if (query.type) where.type = query.type;
  if (query.status) where.status = query.status;
  if (query.accountId) where.account_id = query.accountId;
  if (query.categoryId) where.category_id = query.categoryId;
  if (query.projectId) where.project_id = query.projectId;
  if (query.overhead) where.project_id = null;
  if (query.includeTransfers === false) where.transfer_group_id = null;
  if (query.search) where.description = containsText(query.search);
  return where;
}

/** Urutan daftar transaksi: tanggal transaksi terbaru dulu, lalu yang terakhir dicatat. */
export const TRANSACTION_LIST_ORDER = [
  { transaction_date: 'desc' },
  { created_at: 'desc' },
  { id: 'desc' },
] satisfies Prisma.TransactionOrderByWithRelationInput[];
