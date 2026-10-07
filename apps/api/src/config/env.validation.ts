import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export class EnvVars {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string = 'development';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  /** Kunci penanda tangan access token. */
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  /** Jumlah percobaan login per IP per menit. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  LOGIN_RATE_LIMIT: number = 5;

  /** Folder tempat berkas bukti disimpan; harus ikut dicadangkan bersama database. */
  @IsString()
  @IsNotEmpty()
  STORAGE_DIR: string = './storage';

  /** Jumlah reverse proxy di depan API; 0 berarti diakses langsung. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  TRUST_PROXY_HOPS: number = 0;
}

export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const env = plainToInstance(EnvVars, raw, { exposeDefaultValues: true });
  const errors = validateSync(env);
  if (errors.length > 0) {
    const detail = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('; ');
    throw new Error(`Konfigurasi environment tidak valid. ${detail}`);
  }
  return env;
}
