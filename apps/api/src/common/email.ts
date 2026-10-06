import { Transform } from 'class-transformer';

/** Email disimpan dan dibandingkan dalam huruf kecil tanpa spasi di tepi. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Dipasang pada field email di DTO, supaya normalisasinya seragam. */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  );
