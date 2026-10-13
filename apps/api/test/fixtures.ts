import type { Response } from 'supertest';
import { SessionService } from '../src/auth/session.service.js';
import { TokenService } from '../src/auth/token.service.js';
import type {
  Account,
  AccountType,
  Category,
  PrismaClient,
  Transaction,
  TxStatus,
  TxType,
  User,
} from '../src/generated/prisma/client.js';
import { api, E2eContext } from './e2e-context.js';
import { LOGIN, SETUP_PIN } from './routes.js';

let sequence = 0;

/** Pemilik edisi pribadi, langsung di database; `pinHash` null berarti PIN belum dibuat. */
export function createOwner(
  prisma: PrismaClient,
  overrides: { name?: string; pinHash?: string | null } = {},
): Promise<User> {
  return prisma.user.create({
    data: { name: overrides.name ?? 'Pemilik', pin_hash: overrides.pinHash ?? null },
  });
}

/** Pasangan `refresh_token=<nilai>` dari header Set-Cookie, siap dikirim balik sebagai Cookie. */
export function refreshCookie(res: Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('Respons tidak menyetel cookie refresh_token');
  return cookie.split(';')[0];
}

export interface TestSession {
  accessToken: string;
  cookie: string;
  body: { accessToken: string; user: Record<string, unknown> };
}

/** PIN yang dipakai test bila tidak menyebut yang lain. */
export const OWNER_PIN = '135792';

/** Membuat PIN lewat API, seperti pada kunjungan pertama. Pemiliknya harus sudah ada. */
export async function setupPin(ctx: E2eContext, pin: string = OWNER_PIN): Promise<TestSession> {
  const res = await api(ctx).post(SETUP_PIN).send({ pin }).expect(201);
  return { accessToken: res.body.accessToken, cookie: refreshCookie(res), body: res.body };
}

export function loginWithPin(ctx: E2eContext, pin: unknown) {
  return api(ctx).post(LOGIN).send({ pin });
}

export function bearer(accessToken: string): [string, string] {
  return ['Authorization', `Bearer ${accessToken}`];
}

/** Nama field yang ditolak dalam respons `Validasi gagal`. */
export function errorFields(body: { errors: { field: string }[] }): string[] {
  return body.errors.map((e) => e.field);
}

export type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** Request atas nama sebuah sesi. */
export function call(ctx: E2eContext, session: TestSession, method: Method, path: string) {
  return api(ctx)[method](path).set(...bearer(session.accessToken));
}

/** Hash pengganti untuk sesi buatan test: PIN-nya tidak pernah diperiksa. */
const PLACEHOLDER_PIN_HASH = 'test-tanpa-pin';

/**
 * Sesi pemilik tanpa lewat layar PIN; dipakai test yang tidak menguji cara masuk. Pemilik
 * yang bersesi selalu sudah punya PIN, jadi PIN-nya diisi bila belum ada.
 */
export async function asOwner(ctx: E2eContext): Promise<TestSession & { user: User }> {
  const existing = await ctx.prisma.user.findFirst({ orderBy: { created_at: 'asc' } });
  const user = !existing
    ? await createOwner(ctx.prisma, { pinHash: PLACEHOLDER_PIN_HASH })
    : existing.pin_hash === null
      ? await ctx.prisma.user.update({ where: { id: existing.id }, data: { pin_hash: PLACEHOLDER_PIN_HASH } })
      : existing;
  const accessToken = await ctx.app.get(TokenService).signAccessToken(user.id, user.session_version);
  const refreshToken = await ctx.app.get(SessionService).create(ctx.prisma, user.id);
  return {
    accessToken,
    cookie: `refresh_token=${refreshToken}`,
    body: { accessToken, user: { id: user.id, name: user.name } },
    user,
  };
}

export function createAccount(
  prisma: PrismaClient,
  overrides: Partial<{ name: string; type: AccountType; openingBalance: bigint; isActive: boolean }> = {},
): Promise<Account> {
  sequence += 1;
  return prisma.account.create({
    data: {
      name: overrides.name ?? `Akun ${sequence}`,
      type: overrides.type ?? 'BANK',
      opening_balance: overrides.openingBalance ?? 0n,
      is_active: overrides.isActive ?? true,
    },
  });
}

export function createCategory(
  prisma: PrismaClient,
  overrides: Partial<{ name: string; type: TxType; isSystem: boolean; isActive: boolean }> = {},
): Promise<Category> {
  sequence += 1;
  return prisma.category.create({
    data: {
      name: overrides.name ?? `Kategori ${sequence}`,
      type: overrides.type ?? 'OUT',
      is_system: overrides.isSystem ?? false,
      is_active: overrides.isActive ?? true,
    },
  });
}

/** Transaksi yang ditulis langsung ke database, untuk menguji perhitungan saldo dan ringkasan. */
export function createTransaction(
  prisma: PrismaClient,
  input: {
    accountId: string;
    categoryId: string;
    createdById: string;
    type: TxType;
    amount: bigint;
    status?: TxStatus;
    /** Tanggal transaksi `YYYY-MM-DD`. */
    date?: string;
    description?: string;
    /** Waktu pencatatan, untuk test yang bergantung pada urutan. */
    createdAt?: Date;
    transferGroupId?: string;
  },
): Promise<Transaction> {
  return prisma.transaction.create({
    data: {
      type: input.type,
      amount: input.amount,
      status: input.status ?? 'APPROVED',
      transaction_date: new Date(`${input.date ?? '2026-10-06'}T00:00:00.000Z`),
      description: input.description ?? 'uji',
      account_id: input.accountId,
      category_id: input.categoryId,
      created_by_id: input.createdById,
      created_at: input.createdAt,
      transfer_group_id: input.transferGroupId,
    },
  });
}
