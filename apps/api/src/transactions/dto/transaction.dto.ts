import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsCalendarDate } from '../../common/calendar-date.js';
import { IsPositiveMoneyString } from '../../common/money.js';
import { IsName } from '../../common/name.js';
import { IntersectionType } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/pagination.js';
import { ToBoolean, Trim } from '../../common/transforms.js';
import { IsOptionalNotNull } from '../../common/validation.js';
import { TxStatus, TxType } from '../../generated/prisma/client.js';

const TX_TYPES = Object.values(TxType);
const TX_STATUSES = Object.values(TxStatus);
/** Sampai Rp 9.999.999.999.999; batas ini mencegah salah ketik mengacaukan semua saldo. */
const AMOUNT_MAX_DIGITS = 13;
const TEXT_MAX = 500;

export class CreateTransactionDto {
  @IsIn(TX_TYPES)
  type: TxType;

  @IsPositiveMoneyString(AMOUNT_MAX_DIGITS)
  amount: string;

  @IsCalendarDate()
  transactionDate: string;

  @IsName(TEXT_MAX)
  description: string;

  @IsUUID()
  accountId: string;

  @IsUUID()
  categoryId: string;

  /** Tidak dikirim atau null berarti overhead perusahaan. */
  @IsOptional()
  @IsUUID()
  projectId?: string | null;
}

export class UpdateTransactionDto {
  @IsOptionalNotNull()
  @IsIn(TX_TYPES)
  type?: TxType;

  @IsOptionalNotNull()
  @IsPositiveMoneyString(AMOUNT_MAX_DIGITS)
  amount?: string;

  @IsOptionalNotNull()
  @IsCalendarDate()
  transactionDate?: string;

  @IsOptionalNotNull()
  @IsName(TEXT_MAX)
  description?: string;

  @IsOptionalNotNull()
  @IsUUID()
  accountId?: string;

  @IsOptionalNotNull()
  @IsUUID()
  categoryId?: string;

  /** null memindahkan transaksi ke overhead; tidak dikirim berarti tidak diubah. */
  @IsOptional()
  @IsUUID()
  projectId?: string | null;
}

/** Alasan untuk menolak, membatalkan, atau melakukan void. */
export class ReasonDto {
  @IsName(TEXT_MAX)
  reason: string;
}

/**
 * Keputusan peninjau. `expectedUpdatedAt` adalah `updatedAt` transaksi saat ia membukanya;
 * bila disertakan dan transaksinya sudah berubah, keputusan ditolak (409).
 */
export class ReviewDto {
  @IsOptionalNotNull()
  @IsISO8601({ strict: true })
  expectedUpdatedAt?: string;
}

export class RejectDto extends ReviewDto {
  @IsName(TEXT_MAX)
  reason: string;
}

export class TransferDto {
  @IsUUID()
  fromAccountId: string;

  @IsUUID()
  toAccountId: string;

  @IsPositiveMoneyString(AMOUNT_MAX_DIGITS)
  amount: string;

  @IsCalendarDate()
  transactionDate: string;

  @IsName(TEXT_MAX)
  description: string;
}

/** Filter daftar transaksi; dipakai juga, tanpa halaman, oleh ekspor. */
export class TransactionFiltersDto {
  @IsOptionalNotNull()
  @IsCalendarDate()
  dateFrom?: string;

  @IsOptionalNotNull()
  @IsCalendarDate()
  dateTo?: string;

  @IsOptionalNotNull()
  @IsIn(TX_TYPES)
  type?: TxType;

  @IsOptionalNotNull()
  @IsIn(TX_STATUSES)
  status?: TxStatus;

  @IsOptionalNotNull()
  @IsUUID()
  accountId?: string;

  @IsOptionalNotNull()
  @IsUUID()
  categoryId?: string;

  @IsOptionalNotNull()
  @IsUUID()
  projectId?: string;

  /** true: hanya transaksi tanpa proyek. */
  @IsOptionalNotNull()
  @ToBoolean()
  @IsBoolean()
  overhead?: boolean;

  /** false: sembunyikan sisi transfer antar akun. */
  @IsOptionalNotNull()
  @ToBoolean()
  @IsBoolean()
  includeTransfers?: boolean;

  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class ListTransactionsQueryDto extends IntersectionType(
  PaginationQueryDto,
  TransactionFiltersDto,
) {}
