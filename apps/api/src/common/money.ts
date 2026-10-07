import { applyDecorators } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';

// 18 digit: nilai 18 digit mana pun masih di bawah batas kolom BIGINT (sekitar 9,2 x 10^18).
const UNSIGNED = /^\d{1,18}$/;
const SIGNED = /^-?\d{1,18}$/;

/**
 * Nominal rupiah di JSON: string berisi digit saja, tanpa titik, koma, atau desimal.
 * Angka JSON ditolak karena tidak bisa menyimpan nilai besar dengan tepat.
 */
export const IsMoneyString = (options: { allowNegative?: boolean } = {}) =>
  applyDecorators(
    IsString(),
    Matches(options.allowNegative ? SIGNED : UNSIGNED, {
      message: '$property harus berupa bilangan bulat rupiah tanpa titik atau koma',
    }),
  );

export function toMoney(value: string): bigint {
  return BigInt(value);
}

export function fromMoney(value: bigint): string {
  return value.toString();
}

/**
 * Nominal yang harus lebih dari nol dan dibatasi jumlah digitnya, mis. nominal transaksi.
 * Batas digit mencegah salah ketik yang akan mengacaukan semua saldo.
 */
export const IsPositiveMoneyString = (maxDigits: number) =>
  applyDecorators(
    IsString(),
    Matches(new RegExp(`^[1-9][0-9]{0,${maxDigits - 1}}$`), {
      message: `$property harus lebih dari 0, berupa bilangan bulat rupiah, maksimal ${maxDigits} digit`,
    }),
  );
