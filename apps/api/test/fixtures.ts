import type { Response } from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import type {
  Account,
  AccountType,
  Category,
  PrismaClient,
  Project,
  ProjectStatus,
  Role,
  Transaction,
  TxStatus,
  TxType,
  User,
} from '../src/generated/prisma/client.js';
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

export type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** Request atas nama sebuah sesi. */
export function call(ctx: E2eContext, session: TestSession, method: Method, path: string) {
  return api(ctx)[method](path).set(...bearer(session.accessToken));
}

/**
 * Memastikan sebuah rute menolak request tanpa token (401) dan menjawab tiap peran
 * dengan status yang diharapkan. Tiap peran memakai user baru.
 */
export async function expectAccess(
  ctx: E2eContext,
  request: { method: Method; path: string; body?: object },
  expected: Record<Role, number>,
): Promise<void> {
  const send = (session?: TestSession) => {
    const req = session
      ? call(ctx, session, request.method, request.path)
      : api(ctx)[request.method](request.path);
    return request.body ? req.send(request.body) : req;
  };

  await send().expect(401);
  for (const [role, status] of Object.entries(expected) as [Role, number][]) {
    const res = await send(await loginAs(ctx, { role }));
    if (res.status !== status) {
      throw new Error(
        `${request.method.toUpperCase()} ${request.path} sebagai ${role}: ` +
          `diharapkan ${status}, didapat ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
  }
}

const ADMIN_ONLY = { SUPER_ADMIN: 200, PROJECT_MANAGER: 403, STAFF: 403 } as const;

/** Status yang diharapkan untuk rute khusus SUPER_ADMIN; `ok` adalah status saat berhasil. */
export function adminOnly(ok = 200): Record<Role, number> {
  return { ...ADMIN_ONLY, SUPER_ADMIN: ok };
}

export function asAdmin(ctx: E2eContext) {
  return loginAs(ctx, { role: 'SUPER_ADMIN', email: 'admin@example.com', name: 'Admin' });
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

export function createProject(
  prisma: PrismaClient,
  overrides: Partial<{ code: string; name: string; clientName: string; status: ProjectStatus; contractValue: bigint }> = {},
): Promise<Project> {
  sequence += 1;
  return prisma.project.create({
    data: {
      code: overrides.code ?? `PRJ-TEST-${String(sequence).padStart(4, '0')}`,
      name: overrides.name ?? `Proyek ${sequence}`,
      client_name: overrides.clientName ?? `Klien ${sequence}`,
      status: overrides.status ?? 'ACTIVE',
      contract_value: overrides.contractValue ?? 0n,
    },
  });
}

/** Menugaskan seorang koordinator ke sebuah proyek, langsung di database. */
export async function assign(prisma: PrismaClient, projectId: string, userId: string): Promise<void> {
  await prisma.projectMember.create({ data: { project_id: projectId, user_id: userId } });
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
    projectId?: string;
  },
): Promise<Transaction> {
  return prisma.transaction.create({
    data: {
      type: input.type,
      amount: input.amount,
      status: input.status ?? 'APPROVED',
      transaction_date: new Date('2026-10-06T00:00:00.000Z'),
      description: 'uji',
      account_id: input.accountId,
      category_id: input.categoryId,
      created_by_id: input.createdById,
      project_id: input.projectId,
    },
  });
}
