import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsCalendarMonth } from '../../common/calendar-date.js';
import { IsPositiveMoneyString } from '../../common/money.js';
import { IsName } from '../../common/name.js';
import { Trim } from '../../common/transforms.js';
import { IsOptionalNotNull } from '../../common/validation.js';

/** Sama dengan batas nominal transaksi. */
const AMOUNT_MAX_DIGITS = 13;
const MONTHS_MIN = 1;
const MONTHS_MAX = 120;
const NOTES_MAX = 500;

export class CreateInstallmentDto {
  @IsName()
  name: string;

  @IsPositiveMoneyString(AMOUNT_MAX_DIGITS)
  monthlyAmount: string;

  @IsCalendarMonth()
  startMonth: string;

  @IsInt()
  @Min(MONTHS_MIN)
  @Max(MONTHS_MAX)
  months: number;

  /** null atau teks kosong berarti tanpa catatan. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(NOTES_MAX)
  notes?: string | null;
}

export class UpdateInstallmentDto {
  @IsOptionalNotNull()
  @IsName()
  name?: string;

  @IsOptionalNotNull()
  @IsPositiveMoneyString(AMOUNT_MAX_DIGITS)
  monthlyAmount?: string;

  @IsOptionalNotNull()
  @IsCalendarMonth()
  startMonth?: string;

  @IsOptionalNotNull()
  @IsInt()
  @Min(MONTHS_MIN)
  @Max(MONTHS_MAX)
  months?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(NOTES_MAX)
  notes?: string | null;
}

export const INSTALLMENT_FILTERS = ['ACTIVE', 'PAID_OFF'] as const;
export type InstallmentFilter = (typeof INSTALLMENT_FILTERS)[number];

export class ListInstallmentsQueryDto {
  @IsOptionalNotNull()
  @IsIn(INSTALLMENT_FILTERS)
  status?: InstallmentFilter;
}
