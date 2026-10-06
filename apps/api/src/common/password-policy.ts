import { applyDecorators } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Aturan untuk password yang baru dibuat; dipakai di semua DTO yang menerimanya. */
export const IsNewPassword = () =>
  applyDecorators(IsString(), MinLength(PASSWORD_MIN_LENGTH), MaxLength(PASSWORD_MAX_LENGTH));

/** Password yang sedang dipakai: hanya dibatasi panjangnya supaya tidak membebani hashing. */
export const IsExistingPassword = () =>
  applyDecorators(IsString(), MinLength(1), MaxLength(PASSWORD_MAX_LENGTH));
