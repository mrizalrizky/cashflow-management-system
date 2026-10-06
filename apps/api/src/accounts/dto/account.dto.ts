import { IsBoolean, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { IsMoneyString } from '../../common/money.js';
import { PaginationQueryDto } from '../../common/pagination.js';
import { ToBoolean, Trim } from '../../common/transforms.js';
import { IsOptionalNotNull } from '../../common/validation.js';
import { AccountType } from '../../generated/prisma/client.js';

const ACCOUNT_TYPES = Object.values(AccountType);

export class CreateAccountDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsIn(ACCOUNT_TYPES)
  type: AccountType;

  /** Boleh negatif, mis. rekening yang sedang minus saat mulai dicatat. */
  @IsOptionalNotNull()
  @IsMoneyString({ allowNegative: true })
  openingBalance?: string;
}

export class UpdateAccountDto {
  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptionalNotNull()
  @IsIn(ACCOUNT_TYPES)
  type?: AccountType;

  @IsOptionalNotNull()
  @IsMoneyString({ allowNegative: true })
  openingBalance?: string;

  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;
}

export class ListAccountsQueryDto extends PaginationQueryDto {
  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptionalNotNull()
  @IsIn(ACCOUNT_TYPES)
  type?: AccountType;

  @IsOptionalNotNull()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}
