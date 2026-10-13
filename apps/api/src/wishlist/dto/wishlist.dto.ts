import { IsBoolean, IsIn } from 'class-validator';
import { IsPositiveMoneyString } from '../../common/money.js';
import { IsName } from '../../common/name.js';
import { IsOptionalNotNull } from '../../common/validation.js';
import { WishlistStatus } from '../../generated/prisma/client.js';

/** Sama dengan batas nominal transaksi. */
const PRICE_MAX_DIGITS = 13;
/** Tiap jawaban pertanyaan dibatasi 1.000 karakter. */
export const ANSWER_MAX = 1000;
const STATUSES = Object.values(WishlistStatus);

export class CreateWishlistItemDto {
  @IsName()
  name: string;

  @IsPositiveMoneyString(PRICE_MAX_DIGITS)
  price: string;

  /** Kenapa saya menginginkannya? */
  @IsName(ANSWER_MAX)
  reason: string;

  /** Apakah saya sudah punya yang mirip? */
  @IsName(ANSWER_MAX)
  similarOwned: string;

  /** Bagaimana barang ini menambah nilai dalam hidup saya? */
  @IsName(ANSWER_MAX)
  valueAdded: string;

  /** Berapa lama saya membutuhkannya dan untuk apa? */
  @IsName(ANSWER_MAX)
  usageDuration: string;

  /** Ringkasan keuangan (hanya total) ikut dikirim saat meminta pendapat AI. Bawaan true. */
  @IsOptionalNotNull()
  @IsBoolean()
  includeFinance?: boolean;
}

export class UpdateWishlistItemDto {
  @IsOptionalNotNull()
  @IsName()
  name?: string;

  @IsOptionalNotNull()
  @IsPositiveMoneyString(PRICE_MAX_DIGITS)
  price?: string;

  @IsOptionalNotNull()
  @IsName(ANSWER_MAX)
  reason?: string;

  @IsOptionalNotNull()
  @IsName(ANSWER_MAX)
  similarOwned?: string;

  @IsOptionalNotNull()
  @IsName(ANSWER_MAX)
  valueAdded?: string;

  @IsOptionalNotNull()
  @IsName(ANSWER_MAX)
  usageDuration?: string;

  @IsOptionalNotNull()
  @IsBoolean()
  includeFinance?: boolean;

  /** Bebas berpindah, supaya salah pilih bisa dikembalikan. */
  @IsOptionalNotNull()
  @IsIn(STATUSES)
  status?: WishlistStatus;
}

export class ListWishlistQueryDto {
  @IsOptionalNotNull()
  @IsIn(STATUSES)
  status?: WishlistStatus;
}
