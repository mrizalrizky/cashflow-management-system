import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { ValidateIf } from 'class-validator';

export interface FieldError {
  field: string;
  messages: string[];
}

/** Bentuk error validasi yang sama untuk DTO dan aturan yang dicek di service. */
export function validationFailed(errors: FieldError[]): BadRequestException {
  return new BadRequestException({ message: 'Validasi gagal', errors });
}

/**
 * Field boleh tidak dikirim, tetapi bila dikirim harus lolos validator lain.
 * Berbeda dari `@IsOptional()`, `null` tidak dilewatkan, jadi tidak sampai ke kolom non-null.
 */
export const IsOptionalNotNull = () => ValidateIf((_object, value) => value !== undefined);

function toFieldErrors(errors: ValidationError[]): FieldError[] {
  return errors.map((error) => ({
    field: error.property,
    messages: Object.values(error.constraints ?? {}),
  }));
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => validationFailed(toFieldErrors(errors)),
  });
}
