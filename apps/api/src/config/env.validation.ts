import 'reflect-metadata';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
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

  /**
   * Alamat web lain yang boleh memanggil API dari browser, dipisah koma, mis.
   * `https://kas.example.com`. Kosong (bawaan) berarti tidak ada: web dan API disajikan dari
   * alamat yang sama. Wildcard tidak diterima.
   */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      : value,
  )
  @Matches(/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i, {
    each: true,
    message: 'CORS_ORIGINS harus berisi alamat seperti https://kas.example.com, tanpa path dan tanpa *',
  })
  CORS_ORIGINS: string[] = [];
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
