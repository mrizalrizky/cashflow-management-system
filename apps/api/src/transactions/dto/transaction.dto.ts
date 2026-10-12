import {
  IsBoolean,
  IsIn,
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
}

/** Alasan pembatalan (void). */
export class ReasonDto {
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
