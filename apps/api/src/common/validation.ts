import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

export interface FieldError {
  field: string;
  messages: string[];
}

/** Bentuk error validasi yang sama untuk DTO dan aturan yang dicek di service. */
export function validationFailed(errors: FieldError[]): BadRequestException {
  return new BadRequestException({ message: 'Validasi gagal', errors });
}

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
