import { BadRequestException, Type } from '@nestjs/common';
import { createValidationPipe, FieldError } from '../validation.js';

/**
 * Menjalankan validasi yang sama dengan aplikasi terhadap sebuah DTO, untuk unit test
 * decorator. Mengembalikan DTO hasil transformasi, atau daftar field yang ditolak.
 */
export async function validateBody<T>(
  dto: Type<T>,
  body: unknown,
): Promise<{ value: T; rejected: string[] }> {
  try {
    const value = (await createValidationPipe().transform(body, {
      type: 'body',
      metatype: dto,
    })) as T;
    return { value, rejected: [] };
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    const { errors } = error.getResponse() as { errors: FieldError[] };
    return { value: undefined as T, rejected: errors.map((e) => e.field) };
  }
}
