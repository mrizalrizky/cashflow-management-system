import { applyDecorators } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';

export const PIN_PATTERN = /^\d{6,12}$/;
export const PIN_MESSAGE = 'PIN harus 6 sampai 12 angka';

/** PIN: 6 sampai 12 angka, dikirim sebagai teks supaya angka nol di depan tidak hilang. */
export function IsPin(): PropertyDecorator {
  return applyDecorators(
    IsString({ message: PIN_MESSAGE }),
    Matches(PIN_PATTERN, { message: PIN_MESSAGE }),
  );
}
