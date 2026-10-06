import type { Response } from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import type { PrismaClient, Role, User } from '../src/generated/prisma/client.js';
import { api, E2eContext } from './e2e-context.js';
import { LOGIN } from './routes.js';

export const DEFAULT_PASSWORD = 'password-123';

export interface UserOverrides {
  email?: string;
  name?: string;
  role?: Role;
  password?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
}

// Hashing argon2 sengaja lambat; hash untuk password yang sama dipakai ulang antar test.
const passwords = new PasswordService();
const hashCache = new Map<string, Promise<string>>();
function hashOnce(password: string): Promise<string> {
  let hash = hashCache.get(password);
  if (!hash) {
    hash = passwords.hash(password);
    hashCache.set(password, hash);
  }
  return hash;
}

let sequence = 0;

export async function createUser(prisma: PrismaClient, overrides: UserOverrides = {}): Promise<User> {
  sequence += 1;
  return prisma.user.create({
    data: {
      name: overrides.name ?? `Pengguna ${sequence}`,
      email: overrides.email ?? `user${sequence}@example.com`,
      password_hash: await hashOnce(overrides.password ?? DEFAULT_PASSWORD),
      role: overrides.role ?? 'STAFF',
      is_active: overrides.isActive ?? true,
      must_change_password: overrides.mustChangePassword ?? false,
    },
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

export async function login(
  ctx: E2eContext,
  email: string,
  password: string = DEFAULT_PASSWORD,
): Promise<TestSession> {
  const res = await api(ctx).post(LOGIN).send({ email, password }).expect(200);
  return { accessToken: res.body.accessToken, cookie: refreshCookie(res), body: res.body };
}

/** Membuat user lalu login; dipakai test yang hanya butuh sesi dengan peran tertentu. */
export async function loginAs(
  ctx: E2eContext,
  overrides: UserOverrides = {},
): Promise<TestSession & { user: User }> {
  const user = await createUser(ctx.prisma, overrides);
  const session = await login(ctx, user.email, overrides.password);
  return { ...session, user };
}

export function bearer(accessToken: string): [string, string] {
  return ['Authorization', `Bearer ${accessToken}`];
}

/** Nama field yang ditolak dalam respons `Validasi gagal`. */
export function errorFields(body: { errors: { field: string }[] }): string[] {
  return body.errors.map((e) => e.field);
}
