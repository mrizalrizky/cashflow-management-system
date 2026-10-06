import { Transform } from 'class-transformer';

/** Query string `true`/`false` menjadi boolean; nilai lain dibiarkan supaya ditolak validator. */
export const ToBoolean = () =>
  Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  });

/** Memangkas spasi di tepi string. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
