# Fase 1a: Auth and Users API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working authentication and user-management API: login, refresh-token rotation, logout, change password, role guards, forced password change, user CRUD, login rate limiting, and an audit log entry for every one of those changes.

**Architecture:** A global JWT guard authenticates every route unless it is marked `@Public()`, and re-reads the user from the database on each request so deactivation and role changes apply immediately. A global roles guard enforces `@Roles()`. Refresh tokens are random values stored as SHA-256 hashes, delivered in an httpOnly cookie and rotated on every use. User changes and their audit rows are written in one database transaction.

**Tech Stack:** NestJS 12 (ESM), Prisma 7.10.0, `@nestjs/jwt` 12, `@nestjs/throttler` 6, `cookie-parser`, argon2, Vitest, supertest.

**Spec:** `docs/superpowers/specs/2026-10-06-cashflow-mvp-design.md`, sections 2.3 and 5 (base document: `implementation-plan-cashflow-mvp.md`, sections 6, 8, 11 Fase 1, 13). Where they conflict, the spec wins.

Fase 1 is split in two. This plan (1a) is the API. Fase 1b is the web side: login page, route guards, token refresh, app shell, user management page, and generated API types.

## Global Constraints

- Prisma model fields are `snake_case`. API JSON is `camelCase`; map in response DTO functions. Never return a Prisma row directly.
- `password_hash` and `token_hash` never appear in any response, log line or audit `before`/`after`.
- The API is ESM: every relative import ends in `.js`.
- All routes are under `/api/v1`. Every route requires authentication unless marked `@Public()`.
- Error body is always `{ statusCode, message, errors? }`. Messages are in Indonesian.
- Access token lifetime 15 minutes; refresh token lifetime 7 days.
- Passwords are hashed with argon2. Refresh tokens are stored only as a hash.
- Every change to a user, and every login attempt, writes an audit row. Data changes and their audit row share one database transaction.
- Emails are stored and compared lower-case and trimmed.
- No hard deletes of users; deactivate with `is_active = false`.
- Tests run against real PostgreSQL (`cashflow_test`); no mocking of Prisma in e2e.
- Out of scope: any web code, password reset by email, projects, transactions.

## Review Focus

- **A deactivated or demoted user who still holds a valid access token:** the very next request is rejected (401 if deactivated, 403 if the role no longer allows it). Pinned in Task 8.
- **A stolen refresh token replayed after the real user already rotated it:** every session of that user is revoked. Two browser tabs refreshing at the same moment must not trigger that. Pinned in Task 6.
- **An admin locking themselves out:** deactivating or demoting yourself, or removing the last active SUPER_ADMIN, is refused. Pinned in Task 8.
- **Login with odd input:** email in different case or with spaces logs in; an unknown email and a wrong password give the same 401 message; a 10,000-character password is rejected by validation, not hashed. Pinned in Task 5.
- **A user who must change their password:** every route except change-password, logout and `/auth/me` answers 403, including ones their role would otherwise allow. Pinned in Task 7.

## File Structure

```
apps/api/src/
├─ config/env.validation.ts          (modify) JWT and rate-limit settings
├─ app.setup.ts                      (modify) cookie parser, trust proxy, validation error shape
├─ app.module.ts                     (modify) AuditModule, AuthModule, UsersModule, global filter
├─ common/http-exception.filter.ts   uniform error body
├─ audit/audit.service.ts            AuditService.log(), sanitizeForAudit()
├─ audit/audit.module.ts             global
├─ auth/password.service.ts          argon2 hash and verify
├─ auth/token.service.ts             access JWT, refresh token generate and hash
├─ auth/auth.service.ts              login, refresh, logout, changePassword
├─ auth/auth.controller.ts
├─ auth/auth.module.ts               registers the two global guards
├─ auth/jwt-auth.guard.ts
├─ auth/roles.guard.ts
├─ auth/decorators.ts                @Public, @Roles, @AllowPendingPasswordChange, @CurrentUser
├─ auth/auth.types.ts                AuthUser
├─ auth/dto/*.ts                     LoginDto, ChangePasswordDto
├─ users/users.service.ts
├─ users/users.controller.ts
├─ users/users.module.ts
├─ users/user.mapper.ts              toUserResponse()
└─ users/dto/*.ts                    CreateUserDto, UpdateUserDto, ResetPasswordDto, ListUsersQueryDto
apps/api/test/
├─ app-factory.ts                    createTestApp()
├─ fixtures.ts                       createUser(), login()
└─ *.e2e-spec.ts                     one file per task
```

## Shared interfaces

These names are used across tasks. Do not rename them.

```ts
// auth/auth.types.ts
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;                 // from generated Prisma enums
  mustChangePassword: boolean;
}

// users/user.mapper.ts
export interface UserResponse {
  id: string; name: string; email: string; role: Role;
  isActive: boolean; mustChangePassword: boolean;
  createdAt: string; updatedAt: string;       // ISO strings
}
export function toUserResponse(user: User): UserResponse;

// audit/audit.service.ts
export interface AuditEntry {
  userId: string | null;
  action: string;             // LOGIN | LOGIN_FAILED | LOGOUT | CHANGE_PASSWORD | RESET_PASSWORD | CREATE | UPDATE | TOKEN_REUSE
  entityType: string;         // 'user'
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}
type Db = PrismaService | Prisma.TransactionClient;
AuditService.log(db: Db, entry: AuditEntry): Promise<void>;
export function sanitizeForAudit(value: unknown): unknown;

// auth/password.service.ts
PasswordService.hash(plain: string): Promise<string>;
PasswordService.verify(hash: string, plain: string): Promise<boolean>;

// auth/token.service.ts
TokenService.signAccessToken(userId: string): Promise<string>;
TokenService.verifyAccessToken(token: string): Promise<{ sub: string }>;   // throws if invalid or expired
TokenService.generateRefreshToken(): { token: string; hash: string };
TokenService.hashRefreshToken(token: string): string;                      // sha256 hex
TokenService.refreshExpiry(now?: Date): Date;                              // now + 7 days

// test/app-factory.ts and test/fixtures.ts
createTestApp(): Promise<INestApplication<App>>;
createUser(prisma, overrides?: { email?; name?; role?; password?; isActive?; mustChangePassword? }): Promise<User>;
        // defaults: role STAFF, password 'password-123', active, mustChangePassword false
login(app, email: string, password: string): Promise<{ accessToken: string; cookie: string; body: any }>;
```

Auth responses:

```ts
// POST /auth/login, POST /auth/refresh, POST /auth/change-password
{ accessToken: string; user: AuthUser }
// plus Set-Cookie: refresh_token=<token>; HttpOnly; SameSite=Strict; Path=/api/v1/auth; Max-Age=604800; Secure (production only)
```

---

### Task 1: Carry-over fixes from the Fase 0 review

**Files:**
- Modify: `apps/api/src/database/seed.ts`, `apps/api/test/seed.e2e-spec.ts`, `apps/api/prisma/seed.ts`, `apps/api/.env.example`, `docs/decisions.md`, `README.md`

**Interfaces:** `seedDatabase(prisma, options)` keeps its signature.

- [ ] **Step 1: Add failing tests** to `test/seed.e2e-spec.ts`:
  - `does not create a second admin when a SUPER_ADMIN already exists under another email`: seed, then seed again with `adminEmail: 'other@example.com'`; expect `user.count()` to be 1.
  - `does not need a password when an admin already exists`: seed, then seed with `adminPassword: undefined`; expect it to resolve.
  - `refuses the placeholder password from .env.example`: `adminPassword: 'ganti-password-ini'` rejects with `/SEED_ADMIN_PASSWORD/`; `user.count()` is 0.
- [ ] **Step 2: Run** `npm run test:e2e -w api`. Expected: those three fail.
- [ ] **Step 3: Implement** in `seed.ts`: look up any user with `role: 'SUPER_ADMIN'` first; only when none exists, validate email and password (reject fewer than 8 characters and the exact string `ganti-password-ini`) and create the admin. Accounts and categories are seeded in both cases. In `prisma/seed.ts`, throw `DATABASE_URL wajib diisi` when it is unset. The existing test `refuses to run without an admin email` still applies when no admin exists.
- [ ] **Step 4: Docs.** In `.env.example` leave `SEED_ADMIN_PASSWORD=` empty with a comment `# wajib diisi, minimal 8 karakter`. In `README.md` add: the two dev servers need separate terminals; set `SEED_ADMIN_PASSWORD` in `apps/api/.env` before seeding; `POSTGRES_PORT` and `TEST_DATABASE_URL` overrides. In `docs/decisions.md` record the npm `allowScripts` decisions (esbuild, prisma, @prisma/engines approved; argon2 denied because its prebuilt binary works) and that the seed is safe to re-run.
- [ ] **Step 5: Run** `npm run test:e2e -w api && npm run lint -w api`. Expected: all pass.
- [ ] **Step 6: Commit** `fix(api): harden seed and document Fase 0 follow-ups`.

---

### Task 2: Environment, error format and request plumbing

**Files:**
- Modify: `apps/api/src/config/env.validation.ts`, `apps/api/src/config/env.validation.spec.ts`, `apps/api/src/app.setup.ts`, `apps/api/src/app.module.ts`, `apps/api/.env.example`, `apps/api/vitest.config.e2e.ts`, `.github/workflows/ci.yml`
- Create: `apps/api/src/common/http-exception.filter.ts`, `apps/api/src/common/http-exception.filter.spec.ts`, `apps/api/test/app-factory.ts`, `apps/api/test/error-format.e2e-spec.ts`

**Interfaces:**
- Produces: `EnvVars` gains `JWT_ACCESS_SECRET: string` (at least 32 characters), `LOGIN_RATE_LIMIT: number` (default 5), `TRUST_PROXY_HOPS: number` (default 0). `HttpExceptionFilter`. `createTestApp()`.

- [ ] **Step 1: Install** `npm install -w api @nestjs/jwt @nestjs/throttler cookie-parser && npm install -w api -D @types/cookie-parser`.
- [ ] **Step 2: Write failing tests.**
  - `env.validation.spec.ts`: add `JWT_ACCESS_SECRET` (40 characters) to the `valid` fixture, then add: rejects a missing `JWT_ACCESS_SECRET` naming the variable; rejects one shorter than 32 characters; defaults `LOGIN_RATE_LIMIT` to 5 and `TRUST_PROXY_HOPS` to 0; rejects `LOGIN_RATE_LIMIT=0`.
  - `http-exception.filter.spec.ts` (call the filter with a fake `ArgumentsHost` and capture `status()`/`json()`):
    - `HttpException` with a string message gives `{ statusCode, message }`.
    - `BadRequestException({ message: 'Validasi gagal', errors: [...] })` keeps `errors`.
    - An array message (Nest's default validation shape) is joined into one string with `; `.
    - A plain `Error('boom')` gives 500 with message `Terjadi kesalahan pada server` and the body does not contain `boom`.
    - No body ever contains the key `error` or a stack trace.
  - `error-format.e2e-spec.ts`: `GET /api/v1/tidak-ada` returns exactly `{ statusCode: 404, message: <string> }`.
- [ ] **Step 3: Run** unit and e2e tests. Expected: new tests fail.
- [ ] **Step 4: Implement.**

`common/http-exception.filter.ts`:

```ts
import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import type { Response } from 'express';

interface ErrorBody {
  statusCode: number;
  message: string;
  errors?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      const body: ErrorBody = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Terjadi kesalahan pada server',
      };
      res.status(body.statusCode).json(body);
      return;
    }

    const statusCode = exception.getStatus();
    const payload = exception.getResponse();
    let message = exception.message;
    let errors: unknown;
    if (typeof payload === 'string') {
      message = payload;
    } else if (payload && typeof payload === 'object') {
      const p = payload as { message?: unknown; errors?: unknown };
      if (Array.isArray(p.message)) message = p.message.join('; ');
      else if (typeof p.message === 'string') message = p.message;
      errors = p.errors;
    }
    const body: ErrorBody = { statusCode, message };
    if (errors !== undefined) body.errors = errors;
    res.status(statusCode).json(body);
  }
}
```

Register it in `AppModule` with `{ provide: APP_FILTER, useClass: HttpExceptionFilter }`.

In `app.setup.ts`: add `app.use(cookieParser())`; set `trust proxy` on the Express instance from `TRUST_PROXY_HOPS` when it is greater than 0; give the `ValidationPipe` an `exceptionFactory` that returns `new BadRequestException({ message: 'Validasi gagal', errors })` where `errors` is `[{ field: string, messages: string[] }]` built from the `ValidationError[]` (top-level `property` and `Object.values(constraints)`).

`test/app-factory.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}
```

Add to the `env` block and the `process.env` assignments in `vitest.config.e2e.ts`: `JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-1234'` and `LOGIN_RATE_LIMIT: '1000'`. Add `JWT_ACCESS_SECRET=` (with a comment: at least 32 random characters) to `.env.example`, and a generated value to the local `apps/api/.env`. No CI change is needed for the secret because the e2e config supplies it; add `timeout-minutes: 10` and `permissions: { contents: read }` to the CI job.

- [ ] **Step 5: Run** `npm test -w api && npm run test:e2e -w api && npm run lint -w api && npm run build -w api`. Expected: all pass, including the existing health tests.
- [ ] **Step 6: Commit** `feat(api): add uniform error format, auth env settings and cookie parsing`.

---

### Task 3: Audit service

**Files:**
- Create: `apps/api/src/audit/audit.service.ts`, `apps/api/src/audit/audit.module.ts`, `apps/api/src/audit/audit.service.spec.ts`, `apps/api/test/audit.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:** Produces `AuditService.log`, `sanitizeForAudit`, global `AuditModule` (see Shared interfaces).

- [ ] **Step 1: Write failing tests.**
  - Unit, `sanitizeForAudit`: removes `password_hash` and `token_hash` at any depth; converts `bigint` to string; converts `Date` to ISO string; leaves other values; returns `undefined` for `undefined`.
  - e2e: `log()` writes a row with all fields; `log()` inside a `prisma.$transaction` that then throws leaves **no** audit row; a `before` containing `password_hash` is stored without it.
- [ ] **Step 2: Run.** Expected: fail, module missing.
- [ ] **Step 3: Implement.** `sanitizeForAudit` walks arrays and plain objects recursively. `log` calls `db.auditLog.create` with `user_id`, `action`, `entity_type`, `entity_id`, `before`, `after`, `ip`, passing `sanitizeForAudit(...)` for both JSON fields and `Prisma.JsonNull`-free omission when they are undefined.
- [ ] **Step 4: Run** unit, e2e and lint. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): add audit service`.

---

### Task 4: Password and token services

**Files:**
- Create: `apps/api/src/auth/password.service.ts`, `apps/api/src/auth/token.service.ts`, `apps/api/src/auth/password.service.spec.ts`, `apps/api/src/auth/token.service.spec.ts`

**Interfaces:** Produces `PasswordService` and `TokenService` (see Shared interfaces). `TokenService` is constructed with `JwtService` and `ConfigService`.

- [ ] **Step 1: Write failing unit tests.**
  - Password: a hash verifies with the right password and not with a wrong one; two hashes of the same password differ; `verify` returns `false` (does not throw) for a malformed hash.
  - Token: a signed access token verifies and returns the `sub`; a token signed with another secret is rejected; an expired token is rejected (use `vi.useFakeTimers` and advance 16 minutes); `generateRefreshToken()` returns a token of at least 43 characters whose `hash` equals `hashRefreshToken(token)` and is 64 hex characters; two generated tokens differ; `refreshExpiry(new Date('2026-01-01T00:00:00Z'))` is `2026-01-08T00:00:00Z`.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** Access tokens: `jwt.signAsync({ sub }, { secret, expiresIn: 900, algorithm: 'HS256' })`, verified with `algorithms: ['HS256']`. Refresh tokens: `randomBytes(32).toString('base64url')`, hashed with `createHash('sha256')`.
- [ ] **Step 4: Run** unit tests and lint. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): add password and token services`.

---

### Task 5: Login, authentication guard and current user

**Files:**
- Create: `apps/api/src/auth/auth.types.ts`, `decorators.ts`, `jwt-auth.guard.ts`, `roles.guard.ts`, `auth.service.ts`, `auth.controller.ts`, `auth.module.ts`, `dto/login.dto.ts`, `apps/api/test/fixtures.ts`, `apps/api/test/auth-login.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/health/health.controller.ts` (add `@Public()`)

**Interfaces:**
- Consumes: `PasswordService`, `TokenService`, `AuditService`, `PrismaService`.
- Produces: `POST /auth/login` (public), `GET /auth/me`, decorators `@Public()`, `@Roles(...roles)`, `@AllowPendingPasswordChange()`, `@CurrentUser()`; global `JwtAuthGuard` then `RolesGuard`; fixtures `createUser`, `login`.

- [ ] **Step 1: Write `test/fixtures.ts`** per Shared interfaces. `login` posts to `/api/v1/auth/login`, expects 201 or 200 as implemented (use `@HttpCode(200)`), and returns the access token plus the raw `refresh_token=...` cookie pair taken from `set-cookie`.
- [ ] **Step 2: Write failing e2e tests** (`auth-login.e2e-spec.ts`):
  - Valid credentials return 200 with `accessToken` and `user` (`id`, `name`, `email`, `role`, `mustChangePassword`), and nothing named `password_hash` or `passwordHash` anywhere in the body.
  - The `Set-Cookie` header has `refresh_token`, `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, and `Max-Age=604800`.
  - The database stores a `refresh_tokens` row whose `token_hash` is not equal to the cookie value.
  - Email `  ADMIN@Example.COM ` logs in as `admin@example.com`.
  - Wrong password and unknown email both return 401 with the same message `Email atau password salah`.
  - An inactive user gets that same 401.
  - Missing password returns 400 with `errors` naming `password`; a 10,000-character password returns 400.
  - Success writes an audit row `LOGIN` with the user's id; failure writes `LOGIN_FAILED` whose `after` contains the attempted email and no password.
  - `GET /auth/me` with the token returns the user; without a token returns 401; with a garbage token returns 401.
  - `GET /api/v1/health` still returns 200 without a token.
- [ ] **Step 3: Run.** Expected: fail with 404 on `/auth/login`.
- [ ] **Step 4: Implement.**

`decorators.ts` uses `SetMetadata` with keys `IS_PUBLIC`, `ROLES`, `ALLOW_PENDING_PASSWORD_CHANGE`, and `createParamDecorator` for `@CurrentUser()` returning `request.user as AuthUser`.

`jwt-auth.guard.ts` (the security-critical part):

```ts
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Sesi tidak valid');

    let userId: string;
    try {
      userId = (await this.tokens.verifyAccessToken(token)).sub;
    } catch {
      throw new UnauthorizedException('Sesi tidak valid');
    }

    // Dibaca ulang tiap request supaya penonaktifan dan ganti peran berlaku seketika.
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.is_active) throw new UnauthorizedException('Sesi tidak valid');

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.must_change_password,
    };

    const allowPending = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_PASSWORD_CHANGE,
      targets,
    );
    if (user.must_change_password && !allowPending) {
      throw new ForbiddenException('Password harus diganti sebelum melanjutkan');
    }
    return true;
  }
}
```

`roles.guard.ts`: read `ROLES`; if none, allow; otherwise allow only when `request.user.role` is in the list, else `ForbiddenException('Anda tidak memiliki akses')`. Public routes have no `request.user` and no roles, so they pass.

`auth.module.ts` provides both guards with `APP_GUARD`, in that order, and registers `JwtModule.register({})`.

`AuthService.login(email, password, ip)`: normalise the email; find the user; always run one argon2 verify (against a fixed dummy hash when the user is missing) so timing does not reveal which emails exist; on failure or inactive user write `LOGIN_FAILED` and throw `UnauthorizedException('Email atau password salah')`; on success create the refresh token row and the `LOGIN` audit row in one transaction and return `{ accessToken, user, refreshToken }`. The controller sets the cookie:

```ts
res.cookie('refresh_token', refreshToken, {
  httpOnly: true,
  sameSite: 'strict',
  secure: this.config.get('NODE_ENV') === 'production',
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});
```

`LoginDto`: `email` `@IsEmail() @MaxLength(254)`, `password` `@IsString() @MinLength(1) @MaxLength(128)`. `GET /auth/me` is decorated `@AllowPendingPasswordChange()` and returns `{ user }`.

- [ ] **Step 5: Run** e2e, unit, lint, build. Expected: pass.
- [ ] **Step 6: Commit** `feat(api): add login, JWT guard and roles guard`.

---

### Task 6: Refresh rotation and logout

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`, `auth.controller.ts`
- Create: `apps/api/test/auth-refresh.e2e-spec.ts`

**Interfaces:** Produces `POST /auth/refresh` (public, reads the cookie) and `POST /auth/logout` (public, reads the cookie, returns 204).

- [ ] **Step 1: Write failing e2e tests:**
  - Refresh with a valid cookie returns 200 with a new `accessToken`, sets a **different** `refresh_token` cookie, and marks the old row `revoked_at`.
  - The new access token works on `/auth/me`.
  - Refresh without a cookie, or with an unknown token, returns 401.
  - **Reuse detection:** rotate once, set the old row's `revoked_at` to 11 seconds ago, then present the old cookie again: 401, every refresh token of that user is revoked (the newer cookie now also fails), and a `TOKEN_REUSE` audit row exists.
  - **Two tabs:** rotate once and immediately present the old cookie again (within the grace window): 401, but the newer cookie still works.
  - An expired refresh token (set `expires_at` in the past) returns 401.
  - A user deactivated after login cannot refresh: 401.
  - Logout returns 204, clears the cookie (`Max-Age=0` or an expiry in the past, same `Path`), revokes the row, writes a `LOGOUT` audit row; refreshing with that cookie afterwards returns 401. Logout without a cookie still returns 204.
- [ ] **Step 2: Run.** Expected: fail with 404.
- [ ] **Step 3: Implement** `AuthService.refresh(rawToken, ip)`:

```ts
const REUSE_GRACE_MS = 10_000;

async refresh(rawToken: string | undefined, ip: string | null) {
  const invalid = () => new UnauthorizedException('Sesi berakhir, silakan login kembali');
  if (!rawToken) throw invalid();

  const row = await this.prisma.refreshToken.findUnique({
    where: { token_hash: this.tokens.hashRefreshToken(rawToken) },
    include: { user: true },
  });
  if (!row) throw invalid();

  const now = new Date();
  if (row.revoked_at) {
    // Token lama dipakai lagi. Dalam jeda singkat itu tab lain yang refresh bersamaan;
    // di luar jeda itu dianggap pencurian, semua sesi user dicabut.
    if (now.getTime() - row.revoked_at.getTime() > REUSE_GRACE_MS) {
      await this.prisma.$transaction(async (tx) => {
        await tx.refreshToken.updateMany({
          where: { user_id: row.user_id, revoked_at: null },
          data: { revoked_at: now },
        });
        await this.audit.log(tx, {
          userId: row.user_id, action: 'TOKEN_REUSE', entityType: 'user', entityId: row.user_id, ip,
        });
      });
    }
    throw invalid();
  }
  if (row.expires_at <= now || !row.user.is_active) throw invalid();

  const next = this.tokens.generateRefreshToken();
  const rotated = await this.prisma.$transaction(async (tx) => {
    // Bersyarat: bila dua request berpacu, hanya satu yang berhasil merotasi.
    const { count } = await tx.refreshToken.updateMany({
      where: { id: row.id, revoked_at: null },
      data: { revoked_at: now },
    });
    if (count === 0) return false;
    await tx.refreshToken.create({
      data: { user_id: row.user_id, token_hash: next.hash, expires_at: this.tokens.refreshExpiry(now) },
    });
    return true;
  });
  if (!rotated) throw invalid();

  return {
    accessToken: await this.tokens.signAccessToken(row.user_id),
    user: toAuthUser(row.user),
    refreshToken: next.token,
  };
}
```

`logout(rawToken, ip)`: if the hash matches an unrevoked row, revoke it and write `LOGOUT`. The controller always clears the cookie with the same `path` and returns 204.

- [ ] **Step 4: Run** e2e, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): add refresh token rotation with reuse detection and logout`.

---

### Task 7: Change password and the forced-change gate

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`, `auth.controller.ts`
- Create: `apps/api/src/auth/dto/change-password.dto.ts`, `apps/api/test/auth-password.e2e-spec.ts`

**Interfaces:** Produces `POST /auth/change-password` (`@AllowPendingPasswordChange()`), body `{ currentPassword, newPassword }`, response as login.

- [ ] **Step 1: Write failing e2e tests:**
  - A user with `mustChangePassword: true` gets 403 with message `Password harus diganti sebelum melanjutkan` on a normal protected route, and 200 on `/auth/me`.
  - Changing the password returns 200 with `user.mustChangePassword === false`; the old password no longer logs in; the new one does.
  - After the change, the previous refresh cookie returns 401, and the cookie set by the change response works.
  - A second session of the same user (logged in separately before the change) can no longer refresh.
  - Wrong `currentPassword` returns 401 with `Password saat ini salah` and changes nothing.
  - `newPassword` shorter than 8 characters, longer than 128, or equal to `currentPassword` returns 400 with `errors` naming `newPassword`.
  - An audit row `CHANGE_PASSWORD` exists and contains no password or hash.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.** In one transaction: update `password_hash` and `must_change_password = false`, revoke all the user's refresh tokens, create a fresh one, write the audit row. The "must differ from current" check is done in the service and thrown as the same `BadRequestException({ message: 'Validasi gagal', errors: [{ field: 'newPassword', messages: [...] }] })` shape.
- [ ] **Step 4: Run** e2e, lint, build. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): add change password and forced password change`.

---

### Task 8: User management and role enforcement

**Files:**
- Create: `apps/api/src/users/users.service.ts`, `users.controller.ts`, `users.module.ts`, `user.mapper.ts`, `dto/create-user.dto.ts`, `dto/update-user.dto.ts`, `dto/reset-password.dto.ts`, `dto/list-users-query.dto.ts`, `apps/api/test/users.e2e-spec.ts`, `apps/api/test/auth-roles.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:** All routes `@Roles('SUPER_ADMIN')`.
- `GET /users?search=&role=&isActive=&page=1&pageSize=20` returns `{ data: UserResponse[], meta: { page, pageSize, total } }`, ordered by `name`. `pageSize` is capped at 100.
- `GET /users/:id`, `POST /users`, `PATCH /users/:id`, `POST /users/:id/reset-password`.
- `:id` is validated with `ParseUUIDPipe`.

- [ ] **Step 1: Write failing e2e tests.**

`auth-roles.e2e-spec.ts`:
  - `GET /users`: no token 401; STAFF 403; PROJECT_MANAGER 403; SUPER_ADMIN 200. Same matrix for `POST /users`.
  - A SUPER_ADMIN is demoted to STAFF directly in the database: their existing access token now gets 403 on `GET /users`.
  - A user is deactivated directly in the database: their existing access token now gets 401 on `/auth/me`.

`users.e2e-spec.ts`:
  - Create returns 201 with a `UserResponse` (`mustChangePassword: true`, lower-cased email, no hash); the new user can log in and is then blocked by the forced-change gate.
  - Duplicate email, including in a different case, returns 409 `Email sudah dipakai`.
  - Invalid role, invalid email, or password shorter than 8 returns 400 with `errors`. Unknown body property returns 400.
  - List supports `search` (matches name or email, case-insensitive), `role`, `isActive`, and pagination; `meta.total` counts all matches; `pageSize=1000` is rejected with 400.
  - `GET /users/not-a-uuid` returns 400; an unknown UUID returns 404 `Pengguna tidak ditemukan`.
  - Update changes name, email, role and `isActive`; the audit row `UPDATE` has `before` and `after` without `password_hash`.
  - Deactivating a user revokes their refresh tokens; changing their role revokes them too; changing only their name does not.
  - An admin cannot deactivate themselves or change their own role: 400 `Tidak bisa menonaktifkan atau mengubah peran akun sendiri`.
  - The last active SUPER_ADMIN cannot be deactivated or demoted by anyone: with two admins A and B, A deactivates B (allowed), then A cannot demote A (self rule); and with B deactivated, reactivating is allowed.
  - Reset password sets `mustChangePassword: true`, revokes the user's refresh tokens, lets them log in with the new password, and writes `RESET_PASSWORD` without the password.
  - Create and update both write their audit row; a failed create (duplicate email) writes none.
- [ ] **Step 2: Run.** Expected: fail with 404.
- [ ] **Step 3: Implement.** Each mutation runs in `prisma.$transaction`: load the user, apply the rules, write the change, revoke refresh tokens when `is_active` becomes false or `role` changes, write the audit row. Map Prisma's unique violation (`P2002`) to `ConflictException('Email sudah dipakai')`. The last-admin rule: refuse when the target is an active SUPER_ADMIN, the change would make them inactive or another role, and no other active SUPER_ADMIN exists. `toUserResponse` is the only way a user leaves the service.
- [ ] **Step 4: Run** e2e, unit, lint, build. Expected: pass.
- [ ] **Step 5: Record in `docs/decisions.md`:** what happens to `project_members` rows when a PROJECT_MANAGER changes role is decided in Fase 2.
- [ ] **Step 6: Commit** `feat(api): add user management with role enforcement`.

---

### Task 9: Login rate limiting

**Files:**
- Modify: `apps/api/src/auth/auth.module.ts`, `auth.controller.ts`
- Create: `apps/api/test/auth-rate-limit.e2e-spec.ts`

**Interfaces:** Consumes `LOGIN_RATE_LIMIT` from Task 2. Only `POST /auth/login` is limited: that many attempts per IP per 60 seconds.

- [ ] **Step 1: Write the failing e2e test.** The e2e default limit is 1000, so this file lowers it before the app module is imported:

```ts
vi.hoisted(() => {
  process.env.LOGIN_RATE_LIMIT = '3';
});
```

  - Three wrong-password attempts return 401; the fourth returns 429 with `{ statusCode: 429, message: 'Terlalu banyak percobaan login. Coba lagi nanti.' }`.
  - While limited, a correct password is also refused with 429.
  - `GET /api/v1/health` is not limited (10 calls all return 200).
- [ ] **Step 2: Run.** Expected: the fourth attempt returns 401, not 429.
- [ ] **Step 3: Implement.** `ThrottlerModule.forRootAsync` in `AuthModule` with `throttlers: [{ ttl: 60_000, limit: config.getOrThrow('LOGIN_RATE_LIMIT') }]` and `errorMessage` set to the Indonesian text; `@UseGuards(ThrottlerGuard)` on the login handler only.
- [ ] **Step 4: Run** the full suite: `npm run lint && npm test && npm run test:e2e && npm run build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(api): rate limit login attempts`.

---

## Fase 1a acceptance

- [ ] e2e tests prove the three roles are restricted and an inactive user cannot log in (base document, Fase 1 exit criteria).
- [ ] No response, audit row or log line contains a password or token hash.
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` and `npm run build` pass from a clean `npm ci`.
