import { IsBoolean, IsIn } from 'class-validator';
import { IsName } from '../../common/name.js';
import { ToBoolean } from '../../common/transforms.js';
import { IsOptionalNotNull } from '../../common/validation.js';
import { TxType } from '../../generated/prisma/client.js';

const TX_TYPES = Object.values(TxType);

export class CreateCategoryDto {
  @IsName()
  name: string;

  @IsIn(TX_TYPES)
  type: TxType;

  /** Transaksi berkategori ini wajib memilih cicilan. Hanya untuk kategori pengeluaran. */
  @IsOptionalNotNull()
  @IsBoolean()
  isInstallment?: boolean;
}

/** Tipe sengaja tidak bisa diubah: transaksi yang sudah memakai kategori ini bergantung padanya. */
export class UpdateCategoryDto {
  @IsOptionalNotNull()
  @IsName()
  name?: string;

  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;

  /** Transaksi berkategori ini wajib memilih cicilan. Hanya untuk kategori pengeluaran. */
  @IsOptionalNotNull()
  @IsBoolean()
  isInstallment?: boolean;
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
