import { applyDecorators } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from './transforms.js';

/** Nama atau judul: teks wajib isi, spasi di tepi dibuang, panjang dibatasi. */
export const IsName = (maxLength = 100) =>
  applyDecorators(Trim(), IsString(), MinLength(1), MaxLength(maxLength));
