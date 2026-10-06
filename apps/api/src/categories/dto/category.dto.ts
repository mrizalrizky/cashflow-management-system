import { IsBoolean, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { ToBoolean, Trim } from '../../common/transforms.js';
import { IsOptionalNotNull } from '../../common/validation.js';
import { TxType } from '../../generated/prisma/client.js';

const TX_TYPES = Object.values(TxType);

export class CreateCategoryDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsIn(TX_TYPES)
  type: TxType;
}

/** Tipe sengaja tidak bisa diubah: transaksi yang sudah memakai kategori ini bergantung padanya. */
export class UpdateCategoryDto {
  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;
}

export class ListCategoriesQueryDto {
  @IsOptionalNotNull()
  @IsIn(TX_TYPES)
  type?: TxType;

  @IsOptionalNotNull()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}
