import { applyDecorators } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';

// 15 digit cukup untuk ratusan triliun rupiah dan masih jauh di bawah batas BIGINT.
const UNSIGNED = /^\d{1,15}$/;
const SIGNED = /^-?\d{1,15}$/;

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
