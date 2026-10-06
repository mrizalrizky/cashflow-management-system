import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
/** Batas atas supaya `skip` tidak melampaui rentang integer database. */
export const MAX_PAGE = 100_000;

/** Dasar untuk semua DTO query daftar. Turunkan dan tambahkan filter khusus modul. */
export class PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

/** Argumen `skip`/`take` Prisma untuk halaman yang diminta. */
export function toSkipTake(query: PaginationQueryDto): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function paginated<T>(data: T[], total: number, query: PaginationQueryDto): Paginated<T> {
  return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
}
